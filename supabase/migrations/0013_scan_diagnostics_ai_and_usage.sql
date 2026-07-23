-- Diagnostic Scan Report Analysis — AI-run, report, feedback, and monthly
-- usage-ledger schema.

create table scan_ai_runs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references scan_cases (id) on delete cascade,
  provider_id text not null,
  model_id text not null,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  output jsonb,
  safety_review jsonb,
  confidence numeric,
  confidence_breakdown jsonb,
  input_tokens integer,
  output_tokens integer,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index scan_ai_runs_case_id_idx on scan_ai_runs (case_id, started_at desc);

-- One row per case: re-analyzing upserts in place rather than accumulating
-- history, matching scan_extractions' idempotent-retry pattern.
create table scan_reports (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references scan_cases (id) on delete cascade,
  ai_run_id uuid not null references scan_ai_runs (id) on delete cascade,
  ranked_causes jsonb not null,
  recommended_tests jsonb not null,
  safety_warnings jsonb not null default '[]',
  missing_information text[] not null default '{}',
  confidence numeric not null,
  confidence_rationale text[] not null default '{}',
  generated_at timestamptz not null default now()
);

create unique index scan_reports_case_id_idx on scan_reports (case_id);

-- Unique on case_id so a resubmission is an upsert, not a duplicate row.
create table scan_feedback (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references scan_cases (id) on delete cascade,
  report_id uuid not null references scan_reports (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  diagnosis_was_correct boolean,
  actual_root_cause text,
  confirmed_fix text,
  parts_replaced text[] not null default '{}',
  notes text,
  submitted_at timestamptz not null default now()
);

create unique index scan_feedback_case_id_idx on scan_feedback (case_id);

-- Usage ledger: one row per case that has successfully consumed a monthly
-- analysis slot. Counting ledger rows *is* the monthly usage count — no
-- separate incrementing counter table, which is what makes retries safe
-- (see consume_scan_usage_slot below and src/lib/scan-diagnostics/usage.ts).
create table scan_usage (
  case_id uuid primary key references scan_cases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_month date not null,
  created_at timestamptz not null default now()
);

create index scan_usage_user_month_idx on scan_usage (user_id, usage_month);

create or replace function get_monthly_scan_usage(p_user_id uuid)
returns integer as $$
  select count(*)::integer from scan_usage
  where user_id = p_user_id
    and usage_month = date_trunc('month', current_date)::date;
$$ language sql stable security definer;

-- Idempotency guard for the analyze stage: called once per analyze
-- attempt. If this case already has a ledger row (an earlier attempt
-- already consumed the slot — e.g. a provider failure being retried),
-- returns true WITHOUT inserting again or re-checking the limit, so a
-- retry never double-charges and never gets newly blocked by the limit
-- either. Otherwise checks the limit and only inserts if under it.
create or replace function consume_scan_usage_slot(p_user_id uuid, p_case_id uuid, p_limit integer)
returns boolean as $$
declare
  v_already boolean;
  v_count integer;
begin
  select exists(select 1 from scan_usage where case_id = p_case_id) into v_already;
  if v_already then
    return true;
  end if;

  select get_monthly_scan_usage(p_user_id) into v_count;
  if v_count >= p_limit then
    return false;
  end if;

  insert into scan_usage (case_id, user_id, usage_month)
  values (p_case_id, p_user_id, date_trunc('month', current_date)::date);
  return true;
end;
$$ language plpgsql security definer;

alter table scan_ai_runs enable row level security;
alter table scan_reports enable row level security;
alter table scan_feedback enable row level security;
alter table scan_usage enable row level security;

create policy scan_ai_runs_owner_read on scan_ai_runs
  for select using (
    exists (select 1 from scan_cases c where c.id = case_id and c.user_id = auth.uid())
  );

create policy scan_reports_owner_read on scan_reports
  for select using (
    exists (select 1 from scan_cases c where c.id = case_id and c.user_id = auth.uid())
  );

create policy scan_feedback_owner_read on scan_feedback
  for select using (auth.uid() = user_id);

create policy scan_usage_owner_read on scan_usage
  for select using (auth.uid() = user_id);
