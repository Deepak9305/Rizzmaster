CREATE TABLE IF NOT EXISTS public.rewarded_ad_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  required_cost integer NOT NULL CHECK (required_cost IN (1, 2)),
  reward_amount integer NOT NULL DEFAULT 5 CHECK (reward_amount = 5),
  reward_item text NOT NULL DEFAULT 'rizz_credits' CHECK (reward_item = 'rizz_credits'),
  ad_unit_id text NOT NULL DEFAULT 'ca-app-pub-7381421031784616/6580197977'
    CHECK (ad_unit_id = 'ca-app-pub-7381421031784616/6580197977'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'granted', 'rejected', 'expired')),
  transaction_id text,
  ssv_user_id text,
  rejection_code text,
  verified_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rewarded_ad_attempts
  ADD COLUMN IF NOT EXISTS required_cost integer,
  ADD COLUMN IF NOT EXISTS reward_amount integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS reward_item text DEFAULT 'rizz_credits',
  ADD COLUMN IF NOT EXISTS ad_unit_id text DEFAULT 'ca-app-pub-7381421031784616/6580197977',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS transaction_id text,
  ADD COLUMN IF NOT EXISTS ssv_user_id text,
  ADD COLUMN IF NOT EXISTS rejection_code text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT (now() + interval '15 minutes'),
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS rewarded_ad_attempts_transaction_id_key
  ON public.rewarded_ad_attempts (transaction_id)
  WHERE transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS rewarded_ad_attempts_user_status_idx
  ON public.rewarded_ad_attempts (user_id, status, created_at DESC);

ALTER TABLE public.rewarded_ad_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rewarded_ad_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rewarded_ad_attempts TO service_role;

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
  SET credits = new_credits,
      updated_at = pg_catalog.now()
  WHERE id = rewarded_attempt.user_id;

  UPDATE public.rewarded_ad_attempts
  SET status = 'granted',
      transaction_id = pg_catalog.btrim(p_transaction_id),
      ssv_user_id = p_ssv_user_id,
      verified_at = pg_catalog.least(COALESCE(p_verified_at, pg_catalog.now()), pg_catalog.now()),
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
