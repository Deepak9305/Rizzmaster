-- ==============================================================================
-- DEEP FIX: RIZZMASTER PREMIUM & CREDIT ENFORCEMENT
-- 1. Profiles Table Expansion
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  credits integer default 5,
  is_premium boolean default false,
  last_daily_reset date default current_date,
  shadow_notes text,
  streak_count integer default 1,
  last_streak_claim date,
  premium_source text,
  premium_platform text,
  premium_product_id text,
  premium_base_plan_id text,
  premium_transaction_id text,
  premium_expires_at timestamptz,
  premium_verified_at timestamptz,
  total_time_spent_ms bigint default 0
);

-- Safely add new columns to profiles table if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'email') THEN
        ALTER TABLE public.profiles ADD COLUMN email text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'credits') THEN
        ALTER TABLE public.profiles ADD COLUMN credits integer default 5;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_premium') THEN
        ALTER TABLE public.profiles ADD COLUMN is_premium boolean default false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'premium_source') THEN
        ALTER TABLE public.profiles ADD COLUMN premium_source text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'premium_platform') THEN
        ALTER TABLE public.profiles ADD COLUMN premium_platform text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'premium_product_id') THEN
        ALTER TABLE public.profiles ADD COLUMN premium_product_id text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'premium_base_plan_id') THEN
        ALTER TABLE public.profiles ADD COLUMN premium_base_plan_id text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'premium_transaction_id') THEN
        ALTER TABLE public.profiles ADD COLUMN premium_transaction_id text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'premium_expires_at') THEN
        ALTER TABLE public.profiles ADD COLUMN premium_expires_at timestamptz;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'premium_verified_at') THEN
        ALTER TABLE public.profiles ADD COLUMN premium_verified_at timestamptz;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'total_time_spent_ms') THEN
        ALTER TABLE public.profiles ADD COLUMN total_time_spent_ms bigint default 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'last_daily_reset') THEN
        ALTER TABLE public.profiles ADD COLUMN last_daily_reset date default current_date;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'shadow_notes') THEN
        ALTER TABLE public.profiles ADD COLUMN shadow_notes text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'streak_count') THEN
        ALTER TABLE public.profiles ADD COLUMN streak_count integer default 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'last_streak_claim') THEN
        ALTER TABLE public.profiles ADD COLUMN last_streak_claim date;
    END IF;
END $$;

-- Backfill profiles for Auth users whose public profile row was deleted or never created.
INSERT INTO public.profiles (
  id,
  email,
  credits,
  is_premium,
  last_daily_reset,
  shadow_notes,
  streak_count,
  last_streak_claim,
  total_time_spent_ms
)
SELECT
  u.id,
  u.email,
  5,
  false,
  current_date,
  '',
  1,
  current_date,
  0
FROM auth.users u
ON CONFLICT (id) DO NOTHING;


-- ==============================================================================
-- 2. Purchase Receipts Table
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  platform text not null,
  product_id text not null,
  base_plan_id text,
  transaction_id text,
  purchase_token text,
  status text default 'verified',
  raw_payload jsonb default '{}'::jsonb,
  verified_at timestamptz default now(),
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS public.premium_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  platform text not null,
  product_id text not null,
  transaction_id text,
  purchase_date timestamp with time zone default now(),
  is_active boolean default true
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_subscriptions ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated;
GRANT SELECT ON TABLE public.premium_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.premium_subscriptions TO service_role;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can view own subscription" ON public.premium_subscriptions;
CREATE POLICY "Users can view own subscription"
  ON public.premium_subscriptions FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- Unique constraints to prevent replay attacks
-- Drop existing constraints if re-running
ALTER TABLE public.purchase_receipts DROP CONSTRAINT IF EXISTS unique_transaction_id;
ALTER TABLE public.purchase_receipts DROP CONSTRAINT IF EXISTS unique_purchase_token;

CREATE UNIQUE INDEX IF NOT EXISTS unique_transaction_id ON public.purchase_receipts (platform, transaction_id) WHERE transaction_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS unique_purchase_token ON public.purchase_receipts (platform, purchase_token) WHERE purchase_token IS NOT NULL;

ALTER TABLE public.purchase_receipts ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.purchase_receipts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.purchase_receipts TO service_role;

-- Policies for purchase_receipts (Read-only for owner, No inserts from client)
DROP POLICY IF EXISTS "Users can view own receipts" ON public.purchase_receipts;
CREATE POLICY "Users can view own receipts" 
  ON public.purchase_receipts FOR SELECT 
  USING ( (select auth.uid()) = user_id );


-- ==============================================================================
-- 3. Profile Trigger Protection Updates
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.bypass_profile_trigger', true) IS DISTINCT FROM 'true' THEN
    IF (OLD.credits IS DISTINCT FROM NEW.credits) OR
       (OLD.is_premium IS DISTINCT FROM NEW.is_premium) OR
       (OLD.last_daily_reset IS DISTINCT FROM NEW.last_daily_reset) OR
       (OLD.premium_source IS DISTINCT FROM NEW.premium_source) OR
       (OLD.premium_platform IS DISTINCT FROM NEW.premium_platform) OR
       (OLD.premium_product_id IS DISTINCT FROM NEW.premium_product_id) OR
       (OLD.premium_base_plan_id IS DISTINCT FROM NEW.premium_base_plan_id) OR
       (OLD.premium_transaction_id IS DISTINCT FROM NEW.premium_transaction_id) OR
       (OLD.premium_expires_at IS DISTINCT FROM NEW.premium_expires_at) OR
       (OLD.premium_verified_at IS DISTINCT FROM NEW.premium_verified_at) THEN
      RAISE EXCEPTION 'Cannot update sensitive premium/credit columns directly from client.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_profile_sensitive_columns() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_protect_profile_sensitive_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_sensitive_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_sensitive_columns();


-- ==============================================================================
-- 4. Secure RPC Updates
-- ==============================================================================

-- Update admin_modify_credits (Enforce >= 0)
CREATE OR REPLACE FUNCTION public.admin_modify_credits(user_uuid uuid, amount_change integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_credits integer;
  new_credits integer;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: Only service_role can modify credits';
  END IF;

  PERFORM set_config('app.bypass_profile_trigger', 'true', true);
  
  SELECT COALESCE(credits, 0) INTO current_credits
  FROM public.profiles
  WHERE id = user_uuid
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  -- Block negative credits entirely
  new_credits := current_credits + amount_change;
  IF new_credits < 0 THEN
      RAISE EXCEPTION 'Insufficient credits';
  END IF;
  
  UPDATE public.profiles
  SET credits = new_credits
  WHERE id = user_uuid;
  
  RETURN new_credits;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_modify_credits(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_modify_credits(uuid, integer) TO service_role;


-- Update admin_set_premium
DROP FUNCTION IF EXISTS public.admin_set_premium(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.admin_set_premium(uuid, text, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.admin_set_premium(uuid, text, text, text, text, timestamptz, jsonb);

CREATE OR REPLACE FUNCTION public.admin_set_premium(
  user_uuid uuid,
  platform_name text,
  product_identifier text,
  transaction_identifier text,
  base_plan_identifier text DEFAULT NULL,
  purchase_token_identifier text DEFAULT NULL,
  expires_at timestamptz DEFAULT NULL,
  raw_payload jsonb DEFAULT '{}'::jsonb
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
    RAISE EXCEPTION 'Unauthorized: Only service_role can set premium';
  END IF;

  PERFORM set_config('app.bypass_profile_trigger', 'true', true);

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = user_uuid) THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  -- Insert into purchase_receipts securely
  -- Using ON CONFLICT DO NOTHING to prevent crashing if restoring an existing receipt
  INSERT INTO public.purchase_receipts (
      user_id, platform, product_id, base_plan_id, transaction_id, purchase_token, raw_payload, status
  )
  VALUES (
      user_uuid, platform_name, product_identifier, base_plan_identifier, transaction_identifier, purchase_token_identifier, raw_payload, 'verified'
  )
  ON CONFLICT DO NOTHING;

  -- Update profiles with the backend source of truth
  UPDATE public.profiles
  SET 
    is_premium = true,
    premium_source = 'native',
    premium_platform = platform_name,
    premium_product_id = product_identifier,
    premium_base_plan_id = base_plan_identifier,
    premium_transaction_id = transaction_identifier,
    premium_expires_at = expires_at,
    premium_verified_at = now()
  WHERE id = user_uuid;

  UPDATE public.premium_subscriptions
  SET platform = platform_name,
      product_id = product_identifier,
      transaction_id = transaction_identifier,
      is_active = true,
      purchase_date = now()
  WHERE user_id = user_uuid;

  IF NOT FOUND THEN
    INSERT INTO public.premium_subscriptions (user_id, platform, product_id, transaction_id, is_active, purchase_date)
    VALUES (user_uuid, platform_name, product_identifier, transaction_identifier, true, now());
  END IF;

  SELECT * INTO updated_profile 
  FROM public.profiles 
  WHERE id = user_uuid;

  RETURN to_jsonb(updated_profile);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_premium(uuid, text, text, text, text, text, timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_premium(uuid, text, text, text, text, text, timestamptz, jsonb) TO service_role;


-- Update admin_revoke_premium (Service Role Only!)
CREATE OR REPLACE FUNCTION public.admin_revoke_premium(user_uuid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_profile record;
BEGIN
  -- Strict Service Role enforcement
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: Only service_role can revoke premium';
  END IF;

  PERFORM set_config('app.bypass_profile_trigger', 'true', true);

  UPDATE public.profiles
  SET 
    is_premium = false,
    premium_source = 'revoked',
    premium_expires_at = NULL
  WHERE id = user_uuid;

  UPDATE public.premium_subscriptions
  SET is_active = false
  WHERE user_id = user_uuid;

  SELECT * INTO updated_profile 
  FROM public.profiles 
  WHERE id = user_uuid;

  RETURN to_jsonb(updated_profile);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_premium(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revoke_premium(uuid) TO service_role;

DO $$
BEGIN
  IF to_regprocedure('public.claim_daily_credits_and_streak()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.claim_daily_credits_and_streak() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.claim_daily_credits_and_streak() TO authenticated;
  END IF;
END $$;
