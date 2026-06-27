-- ==============================================================================
-- DEEP FIX: RIZZMASTER PREMIUM & CREDIT ENFORCEMENT
-- 1. Profiles Table Expansion
-- ==============================================================================

-- Safely add new columns to profiles table if they don't exist
DO $$
BEGIN
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
END $$;


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

-- Unique constraints to prevent replay attacks
-- Drop existing constraints if re-running
ALTER TABLE public.purchase_receipts DROP CONSTRAINT IF EXISTS unique_transaction_id;
ALTER TABLE public.purchase_receipts DROP CONSTRAINT IF EXISTS unique_purchase_token;

CREATE UNIQUE INDEX IF NOT EXISTS unique_transaction_id ON public.purchase_receipts (platform, transaction_id) WHERE transaction_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS unique_purchase_token ON public.purchase_receipts (platform, purchase_token) WHERE purchase_token IS NOT NULL;

ALTER TABLE public.purchase_receipts ENABLE ROW LEVEL SECURITY;

-- Policies for purchase_receipts (Read-only for owner, No inserts from client)
DROP POLICY IF EXISTS "Users can view own receipts" ON public.purchase_receipts;
CREATE POLICY "Users can view own receipts" 
  ON public.purchase_receipts FOR SELECT 
  USING ( auth.uid() = user_id );


-- ==============================================================================
-- 3. Profile Trigger Protection Updates
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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
  PERFORM set_config('app.bypass_profile_trigger', 'true', true);
  
  SELECT credits INTO current_credits
  FROM public.profiles
  WHERE id = user_uuid;
  
  IF current_credits IS NULL THEN
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

CREATE OR REPLACE FUNCTION public.admin_set_premium(
  user_uuid uuid,
  platform_name text,
  product_identifier text,
  transaction_identifier text,
  base_plan_identifier text DEFAULT NULL,
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
  PERFORM set_config('app.bypass_profile_trigger', 'true', true);

  -- Insert into purchase_receipts securely
  -- Using ON CONFLICT DO NOTHING to prevent crashing if restoring an existing receipt
  INSERT INTO public.purchase_receipts (
      user_id, platform, product_id, base_plan_id, transaction_id, raw_payload, status
  )
  VALUES (
      user_uuid, platform_name, product_identifier, base_plan_identifier, transaction_identifier, raw_payload, 'verified'
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

  SELECT * INTO updated_profile 
  FROM public.profiles 
  WHERE id = user_uuid;

  RETURN to_jsonb(updated_profile);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_premium(uuid, text, text, text, text, timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_premium(uuid, text, text, text, text, timestamptz, jsonb) TO service_role;


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
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
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
-- REMOVED: GRANT EXECUTE ON FUNCTION public.admin_revoke_premium(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_premium(uuid) TO service_role;
