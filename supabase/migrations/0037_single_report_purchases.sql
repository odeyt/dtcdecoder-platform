-- One-off, $9.99 single-report purchases (docs reference: pricing page
-- "Buy 1 report" tier). Deliberately a separate mechanism from
-- report_addon_balances (migration 0024), not an extra pack size layered
-- into it: that system's consumption path (record_ai_diagnostic_usage)
-- checks the plan's DAILY ceiling before ever considering an add-on
-- credit, and Free tier's daily ceiling is a hard 0 by design (an
-- intentional, unbypassable cost-safety floor). Reusing it would mean
-- either weakening that check or accepting Free-tier customers can never
-- redeem a single-report purchase at all — defeating the point of a
-- pay-per-report entry point with no subscription. Instead, redemption
-- here is checked BEFORE record_ai_diagnostic_usage is ever called (see
-- src/lib/ai-diagnostics/single-report-purchases.ts), as an independent
-- authorization path that never touches that tested code.
create table single_report_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'unused' check (status in ('unused', 'consumed', 'expired')),
  -- Set only on redemption (status -> 'consumed'). Nullable: an unused
  -- purchase isn't tied to any case yet. on delete set null (not cascade)
  -- so a later 90-day retention sweep deleting the case doesn't also
  -- delete this purchase's own audit row.
  case_id uuid references scan_cases (id) on delete set null,
  -- Creem's checkout/order id — idempotency key so a webhook retry never
  -- grants the same purchase twice, same pattern as
  -- report_addon_balances.creem_order_id.
  creem_order_id text,
  purchased_at timestamptz not null default now(),
  consumed_at timestamptz,
  -- View-access window: 30 days from redemption, not from purchase — a
  -- purchase sitting unused doesn't start a clock. Set alongside
  -- consumed_at, never independently.
  expires_at timestamptz,
  constraint single_report_purchases_consumed_fields_check check (
    (status = 'unused' and case_id is null and consumed_at is null and expires_at is null)
    or (status in ('consumed', 'expired') and case_id is not null and consumed_at is not null and expires_at is not null)
  )
);

create unique index single_report_purchases_creem_order_idx
  on single_report_purchases (creem_order_id) where creem_order_id is not null;
-- Redemption always looks for a user's oldest unused purchase.
create index single_report_purchases_user_unused_idx
  on single_report_purchases (user_id, purchased_at) where status = 'unused';
-- The 90-day retention sweep excludes any case with an active (unexpired)
-- single-report unlock — this index serves that lookup.
create index single_report_purchases_case_id_idx
  on single_report_purchases (case_id) where case_id is not null;

alter table single_report_purchases enable row level security;

create policy single_report_purchases_owner_read on single_report_purchases
  for select using (auth.uid() = user_id);

-- Idempotent grant — a webhook retry with the same creem_order_id is a
-- no-op, never a double-grant. security definer + no RLS write policy
-- means only the service-role client (the webhook handler) can call this
-- with meaningful effect.
create or replace function grant_single_report_purchase(
  p_user_id uuid,
  p_creem_order_id text
)
returns void as $$
begin
  insert into single_report_purchases (user_id, creem_order_id)
  values (p_user_id, p_creem_order_id)
  on conflict (creem_order_id) where creem_order_id is not null do nothing;
end;
$$ language plpgsql security definer;

-- Atomically claims the user's oldest unused purchase for this case, or
-- returns false if none exists. `for update skip locked` avoids racing a
-- concurrent redemption attempt for the same user (belt-and-suspenders —
-- report generation is already serialized per-case by the case's own
-- status-transition guard, but this makes the function safe regardless).
create or replace function redeem_single_report_purchase(
  p_user_id uuid,
  p_case_id uuid
)
returns boolean as $$
declare
  v_id uuid;
begin
  select id into v_id
    from single_report_purchases
    where user_id = p_user_id and status = 'unused'
    order by purchased_at asc
    limit 1
    for update skip locked;

  if v_id is null then
    return false;
  end if;

  update single_report_purchases
    set status = 'consumed',
        case_id = p_case_id,
        consumed_at = now(),
        expires_at = now() + interval '30 days'
    where id = v_id;

  return true;
end;
$$ language plpgsql security definer;
