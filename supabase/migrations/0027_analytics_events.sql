-- Minimal, insert-only product-analytics ledger. Deliberately generic (one
-- table, a constrained event_type, a small non-sensitive metadata blob) —
-- not a rebuild of the AI usage/cost ledgers (ai_diagnostic_usage,
-- ai_diagnostic_runs), which remain the source of truth for billing/quota.
-- This table exists only to answer "how many people saw/clicked/completed
-- X" for the DTC search -> paid AI diagnosis funnel.
create table analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  event_type text not null check (event_type in (
    'basic_dtc_search',
    'unknown_dtc_search',
    'ai_diagnosis_cta_viewed',
    'ai_diagnosis_cta_clicked',
    'ai_diagnosis_started',
    'ai_diagnosis_completed',
    'ai_diagnosis_failed',
    'upgrade_prompt_viewed'
  )),
  -- Small, structured, non-sensitive tags only (e.g. dtcCodeFamily, plan,
  -- source page) — never free-text symptoms, VINs, complaint text, or any
  -- AI-generated diagnostic content. Enforced by convention at the call
  -- sites (src/lib/analytics/events.ts), not by a DB constraint.
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index analytics_events_type_created_idx on analytics_events (event_type, created_at desc);

-- RLS enabled with NO policies: every row is written by the server-side
-- admin client (which bypasses RLS via the service role), and no policy
-- grants any anon/authenticated client read or write access at all — this
-- table is never queried from the browser.
alter table analytics_events enable row level security;
