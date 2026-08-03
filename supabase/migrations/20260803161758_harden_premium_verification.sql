ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_successful_verification_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS premium_grace_expires_at timestamptz;

UPDATE public.profiles
SET last_successful_verification_at = COALESCE(last_successful_verification_at, premium_verified_at)
WHERE last_successful_verification_at IS NULL
  AND premium_verified_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.admin_set_premium(
  p_user_uuid uuid,
  p_platform_name text,
  p_product_identifier text,
  p_transaction_identifier text,
  p_base_plan_identifier text DEFAULT NULL,
  p_purchase_token_identifier text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_raw_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_profile record;
  existing_owner uuid;
  inserted_owner uuid;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: Only service_role can set premium';
  END IF;

  PERFORM set_config('app.bypass_profile_trigger', 'true', true);

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_uuid) THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  INSERT INTO public.purchase_receipts (
    user_id, platform, product_id, base_plan_id, transaction_id, purchase_token, raw_payload, status
  )
  VALUES (
    p_user_uuid, p_platform_name, p_product_identifier, p_base_plan_identifier, p_transaction_identifier, p_purchase_token_identifier, p_raw_payload, 'verified'
  )
  ON CONFLICT DO NOTHING
  RETURNING user_id INTO inserted_owner;

  IF inserted_owner IS NULL THEN
    SELECT pr.user_id
    INTO existing_owner
    FROM public.purchase_receipts pr
    WHERE pr.platform = p_platform_name
      AND (
        (p_purchase_token_identifier IS NOT NULL AND pr.purchase_token = p_purchase_token_identifier)
        OR (p_transaction_identifier IS NOT NULL AND pr.transaction_id = p_transaction_identifier)
      )
    LIMIT 1;

    IF existing_owner IS NULL THEN
      RAISE EXCEPTION 'Purchase receipt conflict could not be resolved';
    END IF;

    IF existing_owner <> p_user_uuid THEN
      RAISE EXCEPTION 'This purchase is already linked to another account';
    END IF;
  END IF;

  UPDATE public.profiles
  SET is_premium = TRUE,
      premium_source = 'native',
      premium_platform = p_platform_name,
      premium_product_id = p_product_identifier,
      premium_base_plan_id = p_base_plan_identifier,
      premium_transaction_id = p_transaction_identifier,
      premium_expires_at = p_expires_at,
      premium_verified_at = NOW(),
      last_successful_verification_at = NOW(),
      verification_failure_count = 0,
      premium_grace_expires_at = NULL
  WHERE id = p_user_uuid;

  UPDATE public.premium_subscriptions
  SET platform = p_platform_name,
      product_id = p_product_identifier,
      base_plan_id = p_base_plan_identifier,
      transaction_id = p_transaction_identifier,
      purchase_token_identifier = p_purchase_token_identifier,
      is_active = TRUE,
      purchase_date = NOW(),
      expires_at = p_expires_at,
      raw_payload = COALESCE(p_raw_payload, '{}'::jsonb),
      updated_at = NOW()
  WHERE user_id = p_user_uuid;

  IF NOT FOUND THEN
    INSERT INTO public.premium_subscriptions (
      user_id, platform, product_id, base_plan_id, transaction_id, purchase_token_identifier,
      is_active, purchase_date, expires_at, raw_payload, created_at, updated_at
    )
    VALUES (
      p_user_uuid, p_platform_name, p_product_identifier, p_base_plan_identifier, p_transaction_identifier, p_purchase_token_identifier,
      TRUE, NOW(), p_expires_at, COALESCE(p_raw_payload, '{}'::jsonb), NOW(), NOW()
    );
  END IF;

  SELECT * INTO updated_profile FROM public.profiles WHERE id = p_user_uuid;
  RETURN to_jsonb(updated_profile);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_record_premium_verification_failure(
  p_user_uuid uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_profile record;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: Only service_role can record premium verification failures';
  END IF;

  PERFORM set_config('app.bypass_profile_trigger', 'true', true);

  UPDATE public.profiles
  SET verification_failure_count = COALESCE(verification_failure_count, 0) + 1,
      premium_grace_expires_at = CASE
        WHEN is_premium THEN COALESCE(premium_grace_expires_at, NOW() + INTERVAL '48 hours')
        ELSE NULL
      END
  WHERE id = p_user_uuid
  RETURNING * INTO updated_profile;

  IF updated_profile.id IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  RETURN to_jsonb(updated_profile);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_premium(uuid, text, text, text, text, text, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_premium(uuid, text, text, text, text, text, timestamptz, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.admin_record_premium_verification_failure(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_premium_verification_failure(uuid, text) TO service_role;
