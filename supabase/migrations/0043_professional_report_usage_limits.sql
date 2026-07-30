-- Server-side follow-up and regeneration limits for a purchased
-- Professional Diagnostic Report (single_report_purchases, migration
-- 0037; PROFESSIONAL_REPORT_ONE_TIME in src/lib/pricing.ts). Both counters
-- live on the same consumed-purchase row a case's unlock already comes
-- from, rather than a new table — there is exactly one active purchase
-- row per unlocked case (enforced by redeem_single_report_purchase's
-- one-purchase-per-case design), so this is a 1:1 extension, not a new
-- entity.
--
-- Limits (5 follow-ups, 1 regeneration) are read from
-- PROFESSIONAL_REPORT_ONE_TIME in application code and passed into these
-- RPCs as parameters — not hardcoded here — so a future limit change never
-- requires a migration. Each RPC is a single atomic UPDATE ... WHERE
-- ... RETURNING: the WHERE clause is re-evaluated against the current
-- committed row when the row lock is acquired, so two concurrent requests
-- for the same case can never both succeed once the limit is reached
-- (the loser's UPDATE affects zero rows and the function returns false —
-- no separate SELECT-then-UPDATE race window).
alter table single_report_purchases
  add column followup_count integer not null default 0,
  add column regeneration_count integer not null default 0;

alter table single_report_purchases
  add constraint single_report_purchases_followup_count_check check (followup_count >= 0),
  add constraint single_report_purchases_regeneration_count_check check (regeneration_count >= 0);

-- Atomically increments the follow-up counter for the purchase unlocking
-- this case, only while still under p_max_followups. Returns false (no
-- throw) when the case has no active 'consumed' purchase row, or when the
-- limit is already reached — both are ordinary "not allowed" outcomes for
-- the caller, never an error condition.
create or replace function consume_report_followup(
  p_case_id uuid,
  p_max_followups integer
)
returns boolean as $$
declare
  v_id uuid;
begin
  update single_report_purchases
    set followup_count = followup_count + 1
    where case_id = p_case_id
      and status = 'consumed'
      and followup_count < p_max_followups
    returning id into v_id;

  return v_id is not null;
end;
$$ language plpgsql security definer;

-- Same atomicity guarantee as consume_report_followup, for the single
-- permitted final-report regeneration per purchased case.
create or replace function consume_report_regeneration(
  p_case_id uuid,
  p_max_regenerations integer
)
returns boolean as $$
declare
  v_id uuid;
begin
  update single_report_purchases
    set regeneration_count = regeneration_count + 1
    where case_id = p_case_id
      and status = 'consumed'
      and regeneration_count < p_max_regenerations
    returning id into v_id;

  return v_id is not null;
end;
$$ language plpgsql security definer;
