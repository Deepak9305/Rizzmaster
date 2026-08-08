CREATE TABLE IF NOT EXISTS public.dodo_checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  billing_reference uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  dodo_session_id text UNIQUE,
  plan text NOT NULL CHECK (plan IN ('WEEKLY', 'MONTHLY')),
  product_id text NOT NULL,
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'redirected', 'completed', 'expired', 'failed')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dodo_checkout_sessions_user_created_idx
  ON public.dodo_checkout_sessions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.dodo_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dodo_customer_id text NOT NULL,
  dodo_subscription_id text NOT NULL UNIQUE,
  billing_reference uuid,
  product_id text NOT NULL,
  plan text NOT NULL CHECK (plan IN ('WEEKLY', 'MONTHLY')),
  status text NOT NULL CHECK (status IN ('pending', 'active', 'on_hold', 'cancelled', 'failed', 'expired')),
  currency text,
  recurring_amount integer,
  cancel_at_next_billing_date boolean NOT NULL DEFAULT false,
  next_billing_date timestamptz,
  access_expires_at timestamptz,
  on_hold_grace_expires_at timestamptz,
  provider_updated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dodo_subscriptions_user_status_idx
  ON public.dodo_subscriptions (user_id, status, access_expires_at DESC);

CREATE INDEX IF NOT EXISTS dodo_subscriptions_customer_idx
  ON public.dodo_subscriptions (dodo_customer_id);

CREATE TABLE IF NOT EXISTS public.dodo_webhook_events (
  webhook_id text PRIMARY KEY,
  event_type text NOT NULL,
  dodo_subscription_id text,
  processing_status text NOT NULL CHECK (processing_status IN ('processed', 'ignored', 'failed')),
  safe_error_code text,
  safe_error_message text,
  event_timestamp timestamptz NOT NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dodo_checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dodo_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dodo_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.dodo_checkout_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.dodo_subscriptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.dodo_webhook_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.dodo_checkout_sessions TO service_role;
GRANT ALL ON TABLE public.dodo_subscriptions TO service_role;
GRANT ALL ON TABLE public.dodo_webhook_events TO service_role;

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

  IF has_google AND has_dodo THEN
    effective_expiry := CASE
      WHEN (NOT has_google_grace AND google_subscription.expires_at IS NULL) OR dodo_subscription.access_expires_at IS NULL THEN NULL
      ELSE GREATEST(
        CASE WHEN has_google_grace THEN current_profile.premium_grace_expires_at ELSE google_subscription.expires_at END,
        dodo_subscription.access_expires_at
      )
    END;
  ELSIF has_google THEN
    effective_expiry := CASE WHEN has_google_grace THEN current_profile.premium_grace_expires_at ELSE google_subscription.expires_at END;
  ELSIF has_dodo THEN
    effective_expiry := CASE
      WHEN dodo_subscription.status = 'on_hold' THEN dodo_subscription.on_hold_grace_expires_at
      ELSE dodo_subscription.access_expires_at
    END;
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

CREATE OR REPLACE FUNCTION public.admin_apply_dodo_subscription_event(
  p_webhook_id text,
  p_event_type text,
  p_event_timestamp timestamptz,
  p_user_uuid uuid,
  p_subscription_id text,
  p_customer_id text,
  p_product_id text,
  p_plan text,
  p_status text,
  p_cancel_at_next_billing_date boolean,
  p_next_billing_date timestamptz,
  p_recurring_amount integer,
  p_currency text,
  p_billing_reference uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  existing_owner uuid;
  inserted_event_id text;
  grace_expires_at timestamptz;
  access_expires_at timestamptz;
  profile_result jsonb;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: Only service_role can apply Dodo events';
  END IF;

  IF p_plan NOT IN ('WEEKLY', 'MONTHLY') OR p_status NOT IN ('pending', 'active', 'on_hold', 'cancelled', 'failed', 'expired') THEN
    RAISE EXCEPTION 'Invalid Dodo subscription state';
  END IF;

  INSERT INTO public.dodo_webhook_events (
    webhook_id, event_type, dodo_subscription_id, processing_status, event_timestamp
  ) VALUES (
    p_webhook_id, p_event_type, p_subscription_id, 'processed', p_event_timestamp
  )
  ON CONFLICT (webhook_id) DO NOTHING
  RETURNING webhook_id INTO inserted_event_id;

  IF inserted_event_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('duplicate', true);
  END IF;

  SELECT user_id INTO existing_owner
  FROM public.dodo_subscriptions
  WHERE dodo_subscription_id = p_subscription_id;

  IF existing_owner IS NOT NULL AND existing_owner <> p_user_uuid THEN
    RAISE EXCEPTION 'Dodo subscription is already linked to another account';
  END IF;

  grace_expires_at := CASE
    WHEN p_status = 'on_hold' THEN p_event_timestamp + interval '48 hours'
    ELSE NULL
  END;

  access_expires_at := CASE
    WHEN p_status = 'active' THEN p_next_billing_date
    WHEN p_status = 'on_hold' THEN COALESCE(p_next_billing_date, grace_expires_at)
    ELSE p_event_timestamp
  END;

  INSERT INTO public.dodo_subscriptions (
    user_id, dodo_customer_id, dodo_subscription_id, billing_reference, product_id, plan,
    status, currency, recurring_amount, cancel_at_next_billing_date, next_billing_date,
    access_expires_at, on_hold_grace_expires_at, provider_updated_at
  ) VALUES (
    p_user_uuid, p_customer_id, p_subscription_id, p_billing_reference, p_product_id, p_plan,
    p_status, upper(p_currency), p_recurring_amount, COALESCE(p_cancel_at_next_billing_date, false),
    p_next_billing_date, access_expires_at, grace_expires_at, p_event_timestamp
  )
  ON CONFLICT (dodo_subscription_id) DO UPDATE
  SET dodo_customer_id = EXCLUDED.dodo_customer_id,
      product_id = EXCLUDED.product_id,
      plan = EXCLUDED.plan,
      status = EXCLUDED.status,
      currency = EXCLUDED.currency,
      recurring_amount = EXCLUDED.recurring_amount,
      cancel_at_next_billing_date = EXCLUDED.cancel_at_next_billing_date,
      next_billing_date = EXCLUDED.next_billing_date,
      access_expires_at = EXCLUDED.access_expires_at,
      on_hold_grace_expires_at = EXCLUDED.on_hold_grace_expires_at,
      billing_reference = COALESCE(EXCLUDED.billing_reference, public.dodo_subscriptions.billing_reference),
      provider_updated_at = EXCLUDED.provider_updated_at,
      updated_at = now()
  WHERE EXCLUDED.provider_updated_at >= public.dodo_subscriptions.provider_updated_at;

  IF p_billing_reference IS NOT NULL THEN
    UPDATE public.dodo_checkout_sessions
    SET status = CASE WHEN p_status IN ('active', 'on_hold') THEN 'completed' ELSE status END,
        updated_at = now()
    WHERE billing_reference = p_billing_reference
      AND user_id = p_user_uuid;
  END IF;

  profile_result := public.admin_recompute_premium(p_user_uuid);
  RETURN pg_catalog.jsonb_build_object('duplicate', false, 'profile', profile_result);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_premium(user_uuid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: Only service_role can revoke premium';
  END IF;

  UPDATE public.premium_subscriptions
  SET is_active = false,
      updated_at = now()
  WHERE user_id = user_uuid
    AND is_active = true;

  RETURN public.admin_recompute_premium(user_uuid);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_recompute_premium(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recompute_premium(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.admin_apply_dodo_subscription_event(text, text, timestamptz, uuid, text, text, text, text, text, boolean, timestamptz, integer, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_apply_dodo_subscription_event(text, text, timestamptz, uuid, text, text, text, text, text, boolean, timestamptz, integer, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.admin_revoke_premium(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_premium(uuid) TO service_role;
