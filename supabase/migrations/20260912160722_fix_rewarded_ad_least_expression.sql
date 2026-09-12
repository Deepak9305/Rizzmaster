CREATE OR REPLACE FUNCTION public.admin_grant_rewarded_ad(
  p_attempt_id uuid,
  p_transaction_id text,
  p_reward_amount integer,
  p_reward_item text,
  p_ad_unit_id text,
  p_ssv_user_id text DEFAULT NULL,
  p_verified_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  rewarded_attempt public.rewarded_ad_attempts%ROWTYPE;
  current_profile public.profiles%ROWTYPE;
  conflicting_attempt_id uuid;
  new_credits integer;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: only service_role can grant rewarded credits';
  END IF;

  SELECT * INTO rewarded_attempt
  FROM public.rewarded_ad_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF rewarded_attempt.id IS NULL THEN
    RAISE EXCEPTION 'Rewarded ad attempt not found';
  END IF;

  SELECT * INTO current_profile
  FROM public.profiles
  WHERE id = rewarded_attempt.user_id
  FOR UPDATE;

  IF current_profile.id IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  IF rewarded_attempt.status = 'granted' THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'granted',
      'idempotent', true,
      'credits', COALESCE(current_profile.credits, 0)
    );
  END IF;

  IF rewarded_attempt.status <> 'pending' THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', rewarded_attempt.status,
      'idempotent', false,
      'credits', COALESCE(current_profile.credits, 0),
      'reason', rewarded_attempt.rejection_code
    );
  END IF;

  IF rewarded_attempt.expires_at <= pg_catalog.now() THEN
    UPDATE public.rewarded_ad_attempts
    SET status = 'expired',
        rejection_code = 'ATTEMPT_EXPIRED',
        updated_at = pg_catalog.now()
    WHERE id = rewarded_attempt.id;
    RETURN pg_catalog.jsonb_build_object(
      'status', 'expired',
      'idempotent', false,
      'credits', COALESCE(current_profile.credits, 0),
      'reason', 'ATTEMPT_EXPIRED'
    );
  END IF;

  IF p_reward_amount <> 5
     OR p_reward_item <> 'rizz_credits'
     OR p_ad_unit_id <> 'ca-app-pub-7381421031784616/6580197977'
     OR p_transaction_id IS NULL
     OR pg_catalog.btrim(p_transaction_id) = '' THEN
    UPDATE public.rewarded_ad_attempts
    SET status = 'rejected',
        rejection_code = 'REWARD_CONFIGURATION_MISMATCH',
        updated_at = pg_catalog.now()
    WHERE id = rewarded_attempt.id;
    RETURN pg_catalog.jsonb_build_object(
      'status', 'rejected',
      'idempotent', false,
      'credits', COALESCE(current_profile.credits, 0),
      'reason', 'REWARD_CONFIGURATION_MISMATCH'
    );
  END IF;

  IF p_ssv_user_id IS NOT NULL AND p_ssv_user_id <> rewarded_attempt.user_id::text THEN
    UPDATE public.rewarded_ad_attempts
    SET status = 'rejected',
        rejection_code = 'SSV_USER_MISMATCH',
        updated_at = pg_catalog.now()
    WHERE id = rewarded_attempt.id;
    RETURN pg_catalog.jsonb_build_object(
      'status', 'rejected',
      'idempotent', false,
      'credits', COALESCE(current_profile.credits, 0),
      'reason', 'SSV_USER_MISMATCH'
    );
  END IF;

  SELECT id INTO conflicting_attempt_id
  FROM public.rewarded_ad_attempts
  WHERE transaction_id = p_transaction_id
    AND id <> rewarded_attempt.id
  LIMIT 1;

  IF conflicting_attempt_id IS NOT NULL THEN
    UPDATE public.rewarded_ad_attempts
    SET status = 'rejected',
        rejection_code = 'TRANSACTION_ALREADY_USED',
        updated_at = pg_catalog.now()
    WHERE id = rewarded_attempt.id;
    RETURN pg_catalog.jsonb_build_object(
      'status', 'rejected',
      'idempotent', false,
      'credits', COALESCE(current_profile.credits, 0),
      'reason', 'TRANSACTION_ALREADY_USED'
    );
  END IF;

  IF current_profile.is_premium = true THEN
    UPDATE public.rewarded_ad_attempts
    SET status = 'rejected',
        rejection_code = 'PREMIUM_USER',
        updated_at = pg_catalog.now()
    WHERE id = rewarded_attempt.id;
    RETURN pg_catalog.jsonb_build_object(
      'status', 'rejected',
      'idempotent', false,
      'credits', COALESCE(current_profile.credits, 0),
      'reason', 'PREMIUM_USER'
    );
  END IF;

  IF COALESCE(current_profile.credits, 0) >= rewarded_attempt.required_cost THEN
    UPDATE public.rewarded_ad_attempts
    SET status = 'rejected',
        rejection_code = 'CREDITS_AVAILABLE',
        updated_at = pg_catalog.now()
    WHERE id = rewarded_attempt.id;
    RETURN pg_catalog.jsonb_build_object(
      'status', 'rejected',
      'idempotent', false,
      'credits', COALESCE(current_profile.credits, 0),
      'reason', 'CREDITS_AVAILABLE'
    );
  END IF;

  PERFORM pg_catalog.set_config('app.bypass_profile_trigger', 'true', true);

  new_credits := COALESCE(current_profile.credits, 0) + 5;
  UPDATE public.profiles
  SET credits = new_credits
  WHERE id = rewarded_attempt.user_id;

  UPDATE public.rewarded_ad_attempts
  SET status = 'granted',
      transaction_id = pg_catalog.btrim(p_transaction_id),
      ssv_user_id = p_ssv_user_id,
      verified_at = LEAST(COALESCE(p_verified_at, pg_catalog.now()), pg_catalog.now()),
      updated_at = pg_catalog.now()
  WHERE id = rewarded_attempt.id;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'granted',
    'idempotent', false,
    'credits', new_credits
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_rewarded_ad(uuid, text, integer, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_rewarded_ad(uuid, text, integer, text, text, text, timestamptz) TO service_role;
