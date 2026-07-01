CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create profiles table
create table if not exists public.profiles (
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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'last_daily_reset'
      AND data_type <> 'date'
  ) THEN
    ALTER TABLE public.profiles ALTER COLUMN last_daily_reset DROP DEFAULT;
    ALTER TABLE public.profiles
      ALTER COLUMN last_daily_reset TYPE date
      USING CASE
        WHEN last_daily_reset IS NULL OR btrim(last_daily_reset::text) = '' THEN current_date
        ELSE last_daily_reset::text::date
      END;
    ALTER TABLE public.profiles ALTER COLUMN last_daily_reset SET DEFAULT current_date;
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

-- Create saved_items table
create table if not exists public.saved_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  type text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_saved_items_user_id
  on public.saved_items (user_id);

-- Create premium_subscriptions table
create table if not exists public.premium_subscriptions (
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

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Explicit Data API grants. New Supabase projects may not expose public tables
-- to anon/authenticated roles automatically.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.saved_items TO authenticated;
GRANT SELECT ON TABLE public.premium_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.saved_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.premium_subscriptions TO service_role;

-- Policies for profiles
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" 
  on public.profiles for select 
  to authenticated
  using (
    coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
    and (select auth.uid()) = id
  );

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" 
  on public.profiles for insert 
  to authenticated
  with check (
    coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
    and (select auth.uid()) = id
  );

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" 
  on public.profiles for update 
  to authenticated
  using (
    coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
    and (select auth.uid()) = id
  )
  with check (
    coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
    and (select auth.uid()) = id
  );

drop policy if exists "Users can delete own profile" on public.profiles;
create policy "Users can delete own profile" 
  on public.profiles for delete 
  to authenticated
  using (
    coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
    and (select auth.uid()) = id
  );

-- Policies for saved_items
drop policy if exists "Users can view own saved items" on public.saved_items;
create policy "Users can view own saved items" 
  on public.saved_items for select 
  to authenticated
  using (
    coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
    and (select auth.uid()) = user_id
  );

drop policy if exists "Users can insert own saved items" on public.saved_items;
create policy "Users can insert own saved items" 
  on public.saved_items for insert 
  to authenticated
  with check (
    coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
    and (select auth.uid()) = user_id
  );

drop policy if exists "Users can delete own saved items" on public.saved_items;
create policy "Users can delete own saved items" 
  on public.saved_items for delete 
  to authenticated
  using (
    coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
    and (select auth.uid()) = user_id
  );

-- Policies for premium_subscriptions
drop policy if exists "Users can view own subscription" on public.premium_subscriptions;
create policy "Users can view own subscription" 
  on public.premium_subscriptions for select 
  to authenticated
  using (
    coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
    and (select auth.uid()) = user_id
  );

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

revoke execute on function public.delete_user() from public;
grant execute on function public.delete_user() to service_role;

-- Protect profile sensitive columns trigger
DROP TRIGGER IF EXISTS trg_protect_profile_billing_fields ON public.profiles;
DROP FUNCTION IF EXISTS public.protect_profile_billing_fields();

CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE EXECUTE ON FUNCTION public.protect_profile_sensitive_columns() FROM PUBLIC;

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
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: Only service_role can modify credits';
  END IF;

  -- Set config to bypass the trigger
  PERFORM set_config('app.bypass_profile_trigger', 'true', true);
  
  SELECT COALESCE(credits, 0) INTO current_credits
  FROM public.profiles
  WHERE id = user_uuid
  FOR UPDATE;
  
  IF NOT FOUND THEN
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
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: Only service_role can set premium';
  END IF;

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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

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
SECURITY INVOKER
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

REVOKE EXECUTE ON FUNCTION public.claim_daily_credits_and_streak() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_daily_credits_and_streak() TO authenticated;

CREATE OR REPLACE FUNCTION public.increment_total_time_spent(input_ms bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  new_total bigint;
BEGIN
  IF input_ms IS NULL OR input_ms <= 0 THEN
    RAISE EXCEPTION 'input_ms must be greater than zero';
  END IF;

  UPDATE public.profiles
  SET total_time_spent_ms = COALESCE(total_time_spent_ms, 0) + input_ms
  WHERE id = (select auth.uid())
    AND coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
  RETURNING total_time_spent_ms INTO new_total;

  IF new_total IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN new_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_total_time_spent(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_total_time_spent(bigint) TO authenticated;

-- Optional analytics table used by the app for one insert per active user/day.
-- Core profile loading tolerates this table being absent, but keeping it in the
-- schema prevents noisy backend errors on fresh projects.
CREATE TABLE IF NOT EXISTS public.user_activity_log (
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  active_date date DEFAULT current_date NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (user_id, active_date)
);

ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;

GRANT INSERT ON TABLE public.user_activity_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_activity_log TO service_role;

DROP POLICY IF EXISTS "Users can insert own activity" ON public.user_activity_log;
CREATE POLICY "Users can insert own activity"
  ON public.user_activity_log FOR INSERT
  TO authenticated
  WITH CHECK (
    coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
    and (select auth.uid()) = user_id
  );

-- Create public.reports table
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  content text NOT NULL,
  type text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_user_id
  ON public.reports (user_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reports'
      AND column_name = 'user_id'
      AND data_type <> 'uuid'
  ) THEN
    ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_user_id_fkey;
    ALTER TABLE public.reports
      ALTER COLUMN user_id TYPE uuid
      USING NULLIF(btrim(user_id::text), '')::uuid;
    ALTER TABLE public.reports
      ADD CONSTRAINT reports_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

GRANT INSERT ON TABLE public.reports TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reports TO service_role;

-- Allow authenticated and anonymous users to insert reports
DROP POLICY IF EXISTS "Allow authenticated inserts" ON public.reports;
CREATE POLICY "Allow authenticated inserts" 
  ON public.reports FOR INSERT 
  TO authenticated
  WITH CHECK (
    coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
    AND user_id = (select auth.uid())
  );

DROP POLICY IF EXISTS "Allow anonymous inserts" ON public.reports;
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

DO $$
BEGIN
  IF to_regclass('public.deleted_users_stats') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.deleted_users_stats FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON TABLE public.deleted_users_stats FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.deleted_users_stats FROM authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.deleted_users_stats TO service_role';
    EXECUTE 'DROP POLICY IF EXISTS "Service role can manage deleted users stats" ON public.deleted_users_stats';
    EXECUTE '' ||
      'CREATE POLICY "Service role can manage deleted users stats" ' ||
      'ON public.deleted_users_stats FOR ALL TO service_role ' ||
      'USING (true) WITH CHECK (true)';
  END IF;
END $$;
