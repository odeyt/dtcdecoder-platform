-- Distinguishes a comped subscription -- one granted directly, never paid
-- for -- from a real, Creem-billed one.
--
-- Why this is needed: /admin/profitability estimates MRR as
-- active-subscription count x list price (see estimateMonthlyRecurringRevenueUsd
-- in src/lib/admin-profitability.ts). Nothing in the schema distinguishes a
-- row that came from a real Creem checkout from one inserted by hand, so a
-- comped account inflates reported revenue by its full list price
-- indefinitely. In production this reported $99/mo of Workshop revenue
-- against $0/mo of actual recurring charges.
--
-- The alternative was deleting comped rows outright, which was rejected
-- because entitlement is derived from this table (getEffectivePlan in
-- src/lib/subscriptions.ts). Deleting a comped row silently revokes the
-- account's access. A flag keeps entitlement working while letting the
-- revenue math exclude it.
--
-- Deliberately NOT enforced as `is_comp = (creem_subscription_id is null)`.
-- The two are independent: a genuine paid subscription can temporarily lack
-- a Creem id if a webhook is delayed or dropped, and treating that as comped
-- would under-report real revenue. is_comp records an intent ("this was
-- granted"), not an inference from missing data.
alter table subscriptions
  add column if not exists is_comp boolean not null default false,
  add column if not exists comp_reason text;

comment on column subscriptions.is_comp is
  'True when this subscription was granted rather than paid for. Excluded from revenue estimates; still grants entitlement.';
comment on column subscriptions.comp_reason is
  'Free-text note on why this subscription was comped (owner account, support grant, partner, etc.). Advisory only.';

-- Backfill. Every subscription row currently in production has a null
-- creem_subscription_id and no counterpart in the Creem dashboard, so none
-- of them represents a real recurring charge. This is a one-time
-- reconciliation of existing data against a verified external fact -- it is
-- not the ongoing rule (see the note above); new rows default to false and
-- must be comped deliberately.
update subscriptions
   set is_comp = true,
       comp_reason = coalesce(comp_reason, 'backfill 0045: no Creem subscription link at migration time')
 where creem_subscription_id is null
   and is_comp = false;

-- Partial index: the revenue query filters on status plus this flag, and
-- real (non-comped) rows are the ones that need to stay fast as the table
-- grows. Comped rows are expected to stay a handful.
create index if not exists subscriptions_billable_active_idx
  on subscriptions (status, current_period_end)
  where is_comp = false;
