
-- Create profiles table
create table public.profiles (
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

-- Create saved_items table
create table public.saved_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  type text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create premium_subscriptions table
create table public.premium_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  platform text not null, -- 'android' or 'ios'
  product_id text not null,
  transaction_id text,
  purchase_date timestamp with time zone default now(),
  is_active boolean default true,
  constraint unique_user_subscription unique (user_id)
);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.saved_items enable row level security;
alter table public.premium_subscriptions enable row level security;

-- Explicit Data API grants. New Supabase projects may not expose public tables
-- to anon/authenticated roles automatically.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.saved_items TO authenticated;
GRANT SELECT ON TABLE public.premium_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.saved_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.premium_subscriptions TO service_role;

-- Policies for profiles
create policy "Users can view own profile" 
  on public.profiles for select 
  using ( (select auth.uid()) = id );

create policy "Users can insert own profile" 
  on public.profiles for insert 
  with check ( (select auth.uid()) = id );

create policy "Users can update own profile" 
  on public.profiles for update 
  using ( (select auth.uid()) = id )
  with check ( (select auth.uid()) = id );

create policy "Users can delete own profile" 
  on public.profiles for delete 
  using ( (select auth.uid()) = id );

-- Policies for saved_items
create policy "Users can view own saved items" 
  on public.saved_items for select 
  using ( (select auth.uid()) = user_id );

create policy "Users can insert own saved items" 
  on public.saved_items for insert 
  with check ( (select auth.uid()) = user_id );

create policy "Users can delete own saved items" 
  on public.saved_items for delete 
  using ( (select auth.uid()) = user_id );

-- Policies for premium_subscriptions
create policy "Users can view own subscription" 
  on public.premium_subscriptions for select 
  using ( (select auth.uid()) = user_id );

-- RPC Function for Complete Account Deletion
-- Run this in your Supabase SQL Editor to fix the "function not found" error
drop function if exists public.delete_user();

create or replace function public.delete_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1. Delete user data (Explicit cleanup)
  delete from public.saved_items where user_id = auth.uid();
  delete from public.profiles where id = auth.uid();
  
  -- 2. Delete the auth user (Removes login credentials)
  delete from auth.users where id = auth.uid();
end;
$$;

-- Grant execute permission to authenticated users
grant execute on function public.delete_user() to authenticated;
grant execute on function public.delete_user() to service_role;

-- Protect profile sensitive columns trigger
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If not bypassed by setting app.bypass_profile_trigger = 'true'
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
      RAISE EXCEPTION 'Cannot update sensitive columns directly from client.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_sensitive_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_sensitive_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_sensitive_columns();

-- Secure RPC to modify credits (service_role only)
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
  -- Set config to bypass the trigger
  PERFORM set_config('app.bypass_profile_trigger', 'true', true);
  
  SELECT credits INTO current_credits
  FROM public.profiles
  WHERE id = user_uuid
  FOR UPDATE;
  
  IF current_credits IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

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

-- Secure RPC to upgrade to premium (service_role only)
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
  -- Set config to bypass the trigger
  PERFORM set_config('app.bypass_profile_trigger', 'true', true);

  UPDATE public.profiles
  SET is_premium = true,
      premium_source = 'native',
      premium_platform = platform_name,
      premium_product_id = product_identifier,
      premium_base_plan_id = base_plan_identifier,
      premium_transaction_id = transaction_identifier,
      premium_expires_at = expires_at,
      premium_verified_at = now()
  WHERE id = user_uuid;

  INSERT INTO public.premium_subscriptions (user_id, platform, product_id, transaction_id, is_active, purchase_date)
  VALUES (user_uuid, platform_name, product_identifier, transaction_identifier, true, now())
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    platform = EXCLUDED.platform,
    product_id = EXCLUDED.product_id,
    transaction_id = EXCLUDED.transaction_id,
    is_active = true,
    purchase_date = now();

  SELECT *
  INTO updated_profile 
  FROM public.profiles 
  WHERE id = user_uuid;

  RETURN to_jsonb(updated_profile);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_premium(uuid, text, text, text, text, text, timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_premium(uuid, text, text, text, text, text, timestamptz, jsonb) TO service_role;

-- Secure daily reset and streak tracking RPC (authenticated users can invoke)
CREATE OR REPLACE FUNCTION public.claim_daily_credits_and_streak()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_uuid uuid;
  prof record;
  today_date date;
  yesterday_date date;
  new_credits integer;
  new_streak integer;
  bonus_credits integer := 0;
  streak_msg text;
  updated boolean := false;
BEGIN
  user_uuid := auth.uid();
  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Set config to bypass trigger
  PERFORM set_config('app.bypass_profile_trigger', 'true', true);

  today_date := current_date;
  yesterday_date := current_date - 1;

  SELECT * INTO prof FROM public.profiles WHERE id = user_uuid;
  IF prof IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  -- 1. Daily Credit Reset
  IF prof.last_daily_reset IS NULL OR prof.last_daily_reset < today_date THEN
    new_credits := 5; -- Set to 5 credits daily
    UPDATE public.profiles
    SET credits = new_credits,
        last_daily_reset = today_date
    WHERE id = user_uuid;
    updated := true;
  ELSE
    new_credits := prof.credits;
  END IF;

  -- Refresh prof data after possible daily credit reset
  SELECT * INTO prof FROM public.profiles WHERE id = user_uuid;

  -- 2. Streak Logic
  IF prof.last_streak_claim IS NULL OR prof.last_streak_claim < today_date THEN
    IF prof.last_streak_claim IS NOT NULL AND prof.last_streak_claim = yesterday_date THEN
      new_streak := COALESCE(prof.streak_count, 0) + 1;
    ELSE
      new_streak := 1;
    END IF;

    -- Calculate bonus credits
    IF new_streak >= 8 THEN
      bonus_credits := 3;
      streak_msg := '🔥 Day ' || new_streak || ' Streak! +' || bonus_credits || ' Bonus Credits!';
    ELSIF new_streak >= 5 THEN
      bonus_credits := 2;
      streak_msg := '🔥 Day ' || new_streak || ' Streak! +' || bonus_credits || ' Bonus Credits!';
    ELSIF new_streak >= 2 THEN
      bonus_credits := 1;
      streak_msg := '🔥 Day ' || new_streak || ' Streak! +' || bonus_credits || ' Bonus Credit!';
    ELSE
      streak_msg := 'Welcome back! 🔥 Day 1 – keep it up for bonus credits!';
    END IF;

    -- Update streak
    UPDATE public.profiles
    SET streak_count = new_streak,
        last_streak_claim = today_date
    WHERE id = user_uuid;

    -- Add bonus credits if not premium
    IF bonus_credits > 0 AND NOT prof.is_premium THEN
      UPDATE public.profiles
      SET credits = credits + bonus_credits
      WHERE id = user_uuid;
      new_credits := new_credits + bonus_credits;
    END IF;

    updated := true;
  ELSE
    new_streak := COALESCE(prof.streak_count, 1);
    streak_msg := '';
  END IF;

  -- Get final profile state
  SELECT * INTO prof FROM public.profiles WHERE id = user_uuid;

  RETURN jsonb_build_object(
    'updated', updated,
    'profile', to_jsonb(prof),
    'streak_msg', streak_msg
  );
END;
$$;

-- Create public.reports table
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  content text NOT NULL,
  type text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

GRANT INSERT ON TABLE public.reports TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reports TO service_role;

-- Allow authenticated and anonymous users to insert reports
CREATE POLICY "Allow authenticated inserts" 
  ON public.reports FOR INSERT 
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Allow anonymous inserts" 
  ON public.reports FOR INSERT 
  TO anon
  WITH CHECK (user_id IS NULL);

-- Secure RPC to revoke premium status (used by client during exploit re-verification check)
CREATE OR REPLACE FUNCTION public.admin_revoke_premium(user_uuid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_profile record;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: Only service_role can revoke premium';
  END IF;

  -- Set config to bypass the trigger
  PERFORM set_config('app.bypass_profile_trigger', 'true', true);

  UPDATE public.profiles
  SET is_premium = false,
      premium_source = 'revoked'
  WHERE id = user_uuid;

  UPDATE public.premium_subscriptions
  SET is_active = false
  WHERE user_id = user_uuid;

  SELECT id, email, credits, is_premium, last_daily_reset, shadow_notes 
  INTO updated_profile 
  FROM public.profiles 
  WHERE id = user_uuid;

  RETURN to_jsonb(updated_profile);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_revoke_premium(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revoke_premium(uuid) TO service_role;
