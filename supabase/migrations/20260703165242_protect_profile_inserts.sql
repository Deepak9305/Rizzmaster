create or replace function public.enforce_safe_profile_insert_defaults()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.bypass_profile_trigger', true) is distinct from 'true' then
    new.credits := 5;
    new.is_premium := false;
    new.last_daily_reset := current_date;
    new.premium_source := null;
    new.premium_platform := null;
    new.premium_product_id := null;
    new.premium_base_plan_id := null;
    new.premium_transaction_id := null;
    new.premium_expires_at := null;
    new.premium_verified_at := null;
    new.streak_count := 1;
    new.last_streak_claim := current_date;
    new.total_time_spent_ms := 0;
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_safe_profile_insert_defaults() from public;

drop trigger if exists trg_enforce_safe_profile_insert_defaults on public.profiles;
create trigger trg_enforce_safe_profile_insert_defaults
  before insert on public.profiles
  for each row
  execute function public.enforce_safe_profile_insert_defaults();

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  to authenticated
  with check (
    coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
    and (select auth.uid()) = id
    and credits = 5
    and is_premium = false
    and last_daily_reset = current_date
    and premium_source is null
    and premium_platform is null
    and premium_product_id is null
    and premium_base_plan_id is null
    and premium_transaction_id is null
    and premium_expires_at is null
    and premium_verified_at is null
    and streak_count = 1
    and last_streak_claim = current_date
    and coalesce(total_time_spent_ms, 0) = 0
  );
