-- Records the report language the user selected when starting a diagnostic
-- case (currently only the no-file "Run Full AI Diagnosis" quick-case path
-- collects this — see createQuickDiagnosticCase). Read back at case-detail
-- time to decide whether to serve a localized report (see
-- src/lib/scan-diagnostics/report-localization.ts). Defaulting existing and
-- future file-upload cases to 'en' is correct: that flow has no language
-- selector yet, so English is exactly what it always produced.
alter table scan_cases
  add column if not exists report_language text not null default 'en';
