-- Extends ai_diagnostic_runs (migration 0016) into the cross-feature AI
-- cost ledger called for in docs/PRICING_AND_AI_COST_AUDIT.md §6.4/§7 —
-- deliberately NOT a new ai_diagnostic_cost_ledger table, to avoid a third
-- overlapping log table alongside ai_diagnostic_runs/scan_ai_runs.
-- scan_ai_runs keeps its existing job (the AI's structured diagnostic
-- output, safety review, confidence); this table is purely cost/usage
-- accounting, shared by both the chat and scan-report features exactly as
-- it already was.
--
-- No workspace_id column: this schema has no workspace/team entity
-- anywhere (Workshop's multi-seat entitlement is a seat *count*, not a
-- workspace object — see technicianSeatLimit in src/lib/pricing.ts), so a
-- workspace_id column would be permanently null. user_id is the
-- workspace-equivalent grouping key for now.
--
-- Purely additive — every new column is nullable or has a default, so
-- existing rows and existing readers of this table are unaffected.

alter table ai_diagnostic_runs
  add column diagnostic_case_id uuid references scan_cases (id) on delete set null,
  add column report_id uuid references scan_reports (id) on delete set null,
  add column operation_type text not null default 'standard_report'
    check (operation_type in (
      'standard_report', 'long_scanner_report', 'additional_reviewer',
      'additional_language', 'major_regeneration', 'follow_up_round'
    )),
  add column credits_consumed numeric(4, 2) not null default 1,
  add column estimated_input_cost_micros bigint,
  add column estimated_output_cost_micros bigint,
  add column estimated_tool_cost_micros bigint not null default 0,
  add column estimated_total_cost_micros bigint,
  add column currency text not null default 'usd',
  add column latency_ms integer,
  add column tool_calls integer not null default 0;

-- credits_consumed matches DIAGNOSTIC_CREDIT_WEIGHTS in src/lib/pricing.ts
-- (standardReport: 1, longScannerReport: 2, additionalReviewer: 1,
-- additionalLanguage: 0.5, majorRegeneration: 1, followUpRound: 0.5).
--
-- estimated_*_cost_micros are integer micro-units of currency (1 USD =
-- 1,000,000 micros) per the spec's "decimal-safe monetary storage"
-- requirement — the older estimated_cost_usd numeric(10,6) column is left
-- in place, unused going forward, rather than dropped (no destructive SQL
-- on a live table; see docs/PRICING_ROLLBACK_PLAN.md's existing precedent
-- of leaving superseded columns/tables in place).
--
-- No separate reservation_id: ai_diagnostic_runs already carries the same
-- (user_id, request_id) pair ai_diagnostic_usage is uniquely keyed on
-- (migration 0016), so that pair is already the join key back to the
-- report-count reservation a given cost-ledger row corresponds to — a
-- dedicated FK column would just duplicate it.
create index ai_diagnostic_runs_case_idx on ai_diagnostic_runs (diagnostic_case_id)
  where diagnostic_case_id is not null;
create index ai_diagnostic_runs_created_cost_idx on ai_diagnostic_runs (created_at, estimated_total_cost_micros);
