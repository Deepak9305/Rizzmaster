create table public.web_daily_credit_usage (
  credit_day date not null,
  identity text not null,
  spent integer not null check (spent between 0 and 3),
  primary key (credit_day, identity)
);
alter table public.web_daily_credit_usage enable row level security;
revoke all on public.web_daily_credit_usage from public, anon, authenticated;
grant select, insert, update on public.web_daily_credit_usage to service_role;

create function public.web_daily_credits(
  p_account uuid, p_guest uuid, p_day date, p_delta integer
) returns integer language plpgsql security invoker set search_path = '' as $$
declare
  subject text;
  used integer;
  balance integer := 3;
begin
  if (p_account is null) = (p_guest is null)
      or p_day is null or p_delta is null or p_delta not between -2 and 2 then
    raise exception 'Invalid web credit request';
  end if;
  subject := case when p_account is null then 'guest:' || p_guest else 'account:' || p_account end;
  if p_account is not null then
    select coalesce(credits, 0) into strict balance from public.profiles
      where id = p_account for update;
  end if;
  if p_delta <> 0 then
    insert into public.web_daily_credit_usage values (p_day, subject, 0) on conflict do nothing;
  end if;
  select spent into used from public.web_daily_credit_usage
    where credit_day = p_day and identity = subject for update;
  used := coalesce(used, 0);
  if p_delta > least(3 - used, balance) and p_delta > 0 then
    raise exception 'Insufficient credits';
  end if;
  if p_delta < 0 and used < -p_delta then
    raise exception 'Invalid web credit refund';
  end if;
  if p_delta <> 0 then
    used := used + p_delta;
    update public.web_daily_credit_usage set spent = used
      where credit_day = p_day and identity = subject;
    if p_account is not null then
      perform set_config('app.bypass_profile_trigger', 'true', true);
      update public.profiles set credits = balance - p_delta where id = p_account;
      balance := balance - p_delta;
    end if;
  end if;
  return greatest(0, least(3 - used, balance));
end;
$$;
revoke execute on function public.web_daily_credits(uuid, uuid, date, integer) from public, anon, authenticated;
grant execute on function public.web_daily_credits(uuid, uuid, date, integer) to service_role;
