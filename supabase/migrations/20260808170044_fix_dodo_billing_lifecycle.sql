CREATE OR REPLACE FUNCTION public.admin_recompute_premium(p_user_uuid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  google_subscription public.premium_subscriptions%ROWTYPE;
  dodo_subscription public.dodo_subscriptions%ROWTYPE;
  updated_profile public.profiles%ROWTYPE;
  current_profile public.profiles%ROWTYPE;
  has_google boolean := false;
  has_dodo boolean := false;
  has_google_grace boolean := false;
  dodo_effective_expiry timestamptz;
  effective_expiry timestamptz;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: Only service_role can recompute premium';
  END IF;

  PERFORM pg_catalog.set_config('app.bypass_profile_trigger', 'true', true);

  SELECT * INTO current_profile
  FROM public.profiles
  WHERE id = p_user_uuid;

  IF current_profile.id IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  SELECT * INTO google_subscription
  FROM public.premium_subscriptions
  WHERE user_id = p_user_uuid
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY expires_at DESC NULLS FIRST, updated_at DESC NULLS LAST
  LIMIT 1;
  has_google := FOUND;
  has_google_grace := current_profile.is_premium
    AND current_profile.premium_grace_expires_at IS NOT NULL
    AND current_profile.premium_grace_expires_at > now()
    AND (
      current_profile.premium_platform IN ('android', 'multiple')
      OR current_profile.premium_source IN ('native', 'google_play', 'both')
    );
  has_google := has_google OR has_google_grace;

  SELECT * INTO dodo_subscription
  FROM public.dodo_subscriptions
  WHERE user_id = p_user_uuid
    AND (
      (status = 'active' AND (access_expires_at IS NULL OR access_expires_at > now()))
      OR (status = 'on_hold' AND on_hold_grace_expires_at > now())
    )
  ORDER BY
    CASE WHEN status = 'active' THEN 0 ELSE 1 END,
    access_expires_at DESC NULLS FIRST,
    updated_at DESC
  LIMIT 1;
  has_dodo := FOUND;

  IF has_dodo THEN
    dodo_effective_expiry := CASE
      WHEN dodo_subscription.status = 'on_hold' THEN dodo_subscription.on_hold_grace_expires_at
      ELSE dodo_subscription.access_expires_at
    END;
  END IF;

  IF has_google AND has_dodo THEN
    effective_expiry := CASE
      WHEN (NOT has_google_grace AND google_subscription.expires_at IS NULL) OR dodo_effective_expiry IS NULL THEN NULL
      ELSE GREATEST(
        CASE WHEN has_google_grace THEN current_profile.premium_grace_expires_at ELSE google_subscription.expires_at END,
        dodo_effective_expiry
      )
    END;
  ELSIF has_google THEN
    effective_expiry := CASE WHEN has_google_grace THEN current_profile.premium_grace_expires_at ELSE google_subscription.expires_at END;
  ELSIF has_dodo THEN
    effective_expiry := dodo_effective_expiry;
  ELSE
    effective_expiry := NULL;
  END IF;

  UPDATE public.profiles
  SET is_premium = has_google OR has_dodo,
      premium_source = CASE
        WHEN has_google AND has_dodo THEN 'both'
        WHEN has_google THEN 'google_play'
        WHEN has_dodo THEN 'dodo'
        ELSE 'expired'
      END,
      premium_platform = CASE
        WHEN has_google AND has_dodo THEN 'multiple'
        WHEN has_google THEN COALESCE(google_subscription.platform, current_profile.premium_platform, 'android')
        WHEN has_dodo THEN 'web'
        ELSE NULL
      END,
      premium_product_id = CASE
        WHEN has_google THEN COALESCE(google_subscription.product_id, current_profile.premium_product_id)
        WHEN has_dodo THEN dodo_subscription.product_id
        ELSE NULL
      END,
      premium_base_plan_id = CASE WHEN has_google THEN COALESCE(google_subscription.base_plan_id, current_profile.premium_base_plan_id) ELSE NULL END,
      premium_transaction_id = CASE
        WHEN has_google THEN COALESCE(google_subscription.transaction_id, current_profile.premium_transaction_id)
        WHEN has_dodo THEN dodo_subscription.dodo_subscription_id
        ELSE NULL
      END,
      premium_expires_at = effective_expiry,
      premium_verified_at = CASE WHEN has_google OR has_dodo THEN COALESCE(premium_verified_at, now()) ELSE premium_verified_at END,
      last_successful_verification_at = CASE WHEN has_google OR has_dodo THEN COALESCE(last_successful_verification_at, now()) ELSE last_successful_verification_at END,
      verification_failure_count = CASE WHEN has_google OR has_dodo THEN 0 ELSE verification_failure_count END,
      premium_grace_expires_at = CASE WHEN has_google_grace THEN current_profile.premium_grace_expires_at ELSE NULL END
  WHERE id = p_user_uuid
  RETURNING * INTO updated_profile;

  IF updated_profile.id IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  RETURN pg_catalog.to_jsonb(updated_profile);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_recompute_premium(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recompute_premium(uuid) TO service_role;
