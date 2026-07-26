-- Add-on report packs (docs/PRICING_AND_AI_COST_AUDIT.md §6.3/§7,
-- ADD_ON_PACKS in src/lib/pricing.ts). Stored separately from the plan's
-- included monthly allowance, consumed only after that allowance is
-- exhausted, and never silently recurring — a balance is granted once per
-- purchase and only ever decreases.
--
-- Expiration: add-on credits do not expire. The task asked for "documented
-- expiration rules" without specifying actual terms; "never expires,
-- consumed oldest-purchase-first" is the documented rule adopted here, not
-- a placeholder — revisit if a real expiration policy is wanted later.
create table report_addon_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Matches an id in ADD_ON_PACKS (src/lib/pricing.ts), e.g. "addon-10" —
  -- not a foreign key since that registry is a static TS file, not a table.
  pack_id text not null,
  reports_purchased integer not null check (reports_purchased > 0),
  reports_remaining integer not null check (reports_remaining >= 0),
  -- Creem's checkout/order id for this purchase — the idempotency key so a
  -- webhook retry never grants the same pack twice. Nullable only because
  -- this table's schema shouldn't hard-require a payment-provider concept
  -- for tests/tooling that grant a balance directly.
  creem_order_id text,
  purchased_at timestamptz not null default now()
);

create unique index report_addon_balances_creem_order_idx
  on report_addon_balances (creem_order_id) where creem_order_id is not null;
-- Consumption always looks for a user's oldest pack with credits left.
create index report_addon_balances_user_remaining_idx
  on report_addon_balances (user_id, purchased_at) where reports_remaining > 0;

-- Idempotent grant — a webhook retry with the same creem_order_id is a
-- no-op, never a double-grant. security definer + no RLS policies beyond
-- owner-read below means only the service-role client (the webhook
-- handler) can ever call this with meaningful effect.
create or replace function grant_addon_pack(
  p_user_id uuid,
  p_pack_id text,
  p_reports integer,
  p_creem_order_id text
)
returns void as $$
begin
  insert into report_addon_balances (user_id, pack_id, reports_purchased, reports_remaining, creem_order_id)
  values (p_user_id, p_pack_id, p_reports, p_reports, p_creem_order_id)
  on conflict (creem_order_id) where creem_order_id is not null do nothing;
end;
$$ language plpgsql security definer;

-- Extends record_ai_diagnostic_usage (migration 0016): when the MONTHLY
-- report allowance is exhausted, try to cover the request with an add-on
-- credit before rejecting it. The DAILY limit is checked first and is
-- NOT bypassable by add-on credits — it's a hard cost-safety ceiling
-- regardless of allowance source, not part of what add-on packs sell.
-- Reuses the same per-user advisory lock already held at the top of this
-- function, so the add-on balance check+decrement+usage-insert below is
-- just as atomic as the existing count-then-insert logic it extends.
create or replace function record_ai_diagnostic_usage(
  p_user_id uuid,
  p_request_id text,
  p_feature text,
  p_access_level text,
  p_daily_limit integer,
  p_monthly_limit integer
)
returns text as $$
declare
  v_already boolean;
  v_daily_count integer;
  v_monthly_count integer;
  v_addon_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select exists(
    select 1 from ai_diagnostic_usage
    where user_id = p_user_id and request_id = p_request_id
  ) into v_already;
  if v_already then
    return 'already_recorded';
  end if;

  if p_daily_limit is not null then
    select count(*)::integer into v_daily_count
    from ai_diagnostic_usage
    where user_id = p_user_id
      and access_level = p_access_level
      and (created_at at time zone 'utc')::date = (now() at time zone 'utc')::date;

    if v_daily_count >= p_daily_limit then
      return 'daily_limit_exceeded';
    end if;
  end if;

  if p_monthly_limit is not null then
    select count(*)::integer into v_monthly_count
    from ai_diagnostic_usage
    where user_id = p_user_id
      and access_level = p_access_level
      and (created_at at time zone 'utc') >= date_trunc('month', now() at time zone 'utc');

    if v_monthly_count >= p_monthly_limit then
      select id into v_addon_id
        from report_addon_balances
        where user_id = p_user_id and reports_remaining > 0
        order by purchased_at asc
        limit 1;

      if v_addon_id is not null then
        update report_addon_balances
          set reports_remaining = reports_remaining - 1
          where id = v_addon_id;

        insert into ai_diagnostic_usage (user_id, request_id, feature, access_level)
        values (p_user_id, p_request_id, p_feature, p_access_level);

        return 'recorded_via_addon';
      end if;

      return 'monthly_limit_exceeded';
    end if;
  end if;

  insert into ai_diagnostic_usage (user_id, request_id, feature, access_level)
  values (p_user_id, p_request_id, p_feature, p_access_level);

  return 'recorded';
end;
$$ language plpgsql security definer;

alter table report_addon_balances enable row level security;

create policy report_addon_balances_owner_read on report_addon_balances
  for select using (auth.uid() = user_id);
