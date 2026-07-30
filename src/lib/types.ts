export type DtcDifficulty = "easy" | "moderate" | "hard" | "professional";
export type DtcSeverity = "low" | "moderate" | "high" | "critical";
export type DtcCodeType = "generic" | "manufacturer_specific" | "reserved" | "unknown";
export type DtcReviewStatus = "unreviewed" | "in_review" | "approved" | "rejected";

export interface DtcFaqEntry {
  q: string;
  a: string;
}

export interface DtcCode {
  id: string;
  code: string;
  make: string | null;
  model: string | null;
  engine_code: string | null;
  slug: string;
  title: string;
  meta_description: string | null;
  meaning: string;
  symptoms: string[];
  causes: string[];
  diagnostic_steps: string[];
  common_mistakes: string | null;
  difficulty: DtcDifficulty;
  severity: DtcSeverity;
  drive_recommendation: string | null;
  related_makes: string[];
  faq: DtcFaqEntry[];
  pdf_url: string | null;
  youtube_url: string | null;
  search_count: number;
  is_published: boolean;
  // --- DTC reference expansion (migration 0041) ---------------------------
  normalized_code: string;
  family: string;
  code_type: DtcCodeType | null;
  generic_definition: boolean;
  manufacturer_specific: boolean;
  reserved_code: boolean;
  source_type: string;
  source_name: string | null;
  source_url: string | null;
  source_license: string | null;
  source_version: string | null;
  source_hash: string | null;
  review_status: DtcReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// D1 Imports' own confirmed repair intelligence — never a source for the
// published dtc_codes definition (see migration 0041's comment). Downstream,
// optional corroboration only.
export interface DtcVerifiedRepair {
  id: string;
  dtc_code_id: string | null;
  recorded_by_user_id: string | null;
  vehicle_year: number | null;
  manufacturer: string | null;
  model: string | null;
  engine: string | null;
  vin_hash: string | null;
  symptoms: unknown[];
  related_codes: unknown[];
  test_results: unknown[];
  confirmed_root_cause: string;
  completed_repair: string;
  parts_used: unknown[];
  labor_minutes: number | null;
  verification_method: string | null;
  outcome: string;
  technician_notes: string | null;
  evidence_quality: "unverified" | "self_reported" | "verified";
  approved_for_aggregation: boolean;
  created_at: string;
  updated_at: string;
}

export interface DtcDatasetImport {
  id: string;
  dataset_name: string;
  dataset_version: string | null;
  source_url: string | null;
  license_name: string | null;
  license_url: string | null;
  imported_record_count: number;
  inserted_record_count: number;
  updated_record_count: number;
  rejected_record_count: number;
  checksum: string | null;
  status: "running" | "completed" | "failed" | "rejected";
  import_log: Record<string, unknown>;
  started_at: string;
  completed_at: string | null;
}

export interface SearchHistoryEntry {
  id: string;
  user_id: string;
  kind: "lookup" | "ai";
  query: string;
  dtc_code_id: string | null;
  ai_canonical_response_en: string | null;
  ai_translated_response: string | null;
  created_at: string;
}

export type BlogCategory =
  | "dtc_guides"
  | "check_engine_light"
  | "limp_mode"
  | "can_bus_diagnostics"
  | "ev_diagnostics"
  | "transmission_faults"
  | "immobilizer_problems"
  | "bmw_diagnostics"
  | "land_rover_diagnostics"
  | "toyota_diagnostics";

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  category: BlogCategory;
  excerpt: string | null;
  content: string;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export type SubscriptionPlan = "free" | "pro" | "workshop";
export type SubscriptionStatus = "active" | "past_due" | "canceled";

export interface Subscription {
  id: string;
  user_id: string | null;
  email: string;
  plan: SubscriptionPlan;
  billing_interval: "monthly" | "yearly";
  status: SubscriptionStatus;
  creem_subscription_id: string | null;
  creem_customer_id: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailSignup {
  id: string;
  name: string | null;
  email: string;
  signup_locale: string | null;
  created_at: string;
}

// --- Multilingual platform ---------------------------------------------

export type SupportTier = 1 | 2 | 3 | 4;
export type SafetyReviewStatus = "not_reviewed" | "in_review" | "approved" | "rejected";
export type TextDirection = "ltr" | "rtl";

// The full language registry row. `enabled`/`public_available`/tier flags
// are the operational source of truth (admin-editable); routing/proxy code
// uses the separate static locale-codes list for fast, DB-free lookups —
// see src/lib/i18n/locale-codes.ts.
export interface Language {
  locale_code: string;
  base_language: string;
  region_code: string | null;
  english_name: string;
  native_name: string;
  script: string;
  direction: TextDirection;
  enabled: boolean;
  public_available: boolean;
  paid_only: boolean;
  support_tier: SupportTier;
  ai_input_enabled: boolean;
  ai_output_enabled: boolean;
  bilingual_enabled: boolean;
  multilingual_enabled: boolean;
  safety_review_status: SafetyReviewStatus;
  glossary_completion_percent: number;
  ui_translation_completion_percent: number;
  seo_enabled: boolean;
  export_enabled: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  decimal_places: number;
  enabled: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// Static, admin-managed FX rate for display estimates only — never used
// for actual checkout/settlement (Creem bills in USD regardless).
export interface CurrencyRate {
  id: string;
  base_currency: string;
  quote_currency: string;
  rate: number;
  effective_at: string;
  expires_at: string | null;
  source_label: string;
  enabled: boolean;
  updated_by: string | null;
  updated_at: string;
}

export interface TerminologyGlossaryEntry {
  id: string;
  term_en: string;
  locale_code: string;
  translated_term: string;
  acronym: string | null;
  category: string | null;
  manufacturer_context: string | null;
  system_context: string | null;
  alternative_translation: string | null;
  notes: string | null;
  do_not_translate: boolean;
  safety_critical: boolean;
  review_status: "draft" | "reviewed" | "approved";
  reviewed_by: string | null;
  reviewed_at: string | null;
  glossary_version: number;
  updated_at: string;
}

export type ReportMode = "single" | "bilingual" | "multilingual";
export type MeasurementSystem = "imperial" | "metric";
export type TemperatureUnit = "celsius" | "fahrenheit";
export type TimeFormat = "12h" | "24h";

export interface UserPreferences {
  user_id: string;
  interface_locale: string;
  ai_report_locale: string | null;
  secondary_report_locale: string | null;
  report_mode: ReportMode;
  preferred_currency: string | null;
  region_code: string | null;
  measurement_system: MeasurementSystem;
  temperature_unit: TemperatureUnit;
  time_format: TimeFormat;
  timezone: string | null;
  date_format: string | null;
  created_at: string;
  updated_at: string;
}

// The one canonical (always-English) diagnostic record. Localizations are
// translations of canonical_text, never independently-regenerated
// conclusions — see the AI localization design in the plan.
export interface DiagnosticReport {
  id: string;
  user_id: string;
  search_history_id: string | null;
  source_message: string;
  detected_source_language: string | null;
  canonical_locale: "en";
  canonical_text: string;
  grounding_dtc_code_ids: string[];
  model_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiagnosticReportLocalization {
  id: string;
  report_id: string;
  locale_code: string;
  translated_text: string;
  translation_status: "pending" | "completed" | "failed";
  generated_at: string | null;
}

// --- Diagnostic Scan Report Analysis ------------------------------------
// Unrelated to DiagnosticReport above (that's a saved AI-chat answer). This
// is the scan-file-upload workflow: a user uploads a scan-tool report and
// gets a structured AI diagnostic analysis. Tables use a scan_ prefix to
// keep the two features' vocabulary from colliding — see
// supabase/migrations/0012_scan_diagnostics_core.sql.

export type ScanCaseStatus =
  | "draft"
  | "uploaded"
  | "extracting"
  | "extraction_review"
  | "ready_for_analysis"
  | "analyzing"
  | "completed"
  | "failed";

export interface ScanCase {
  id: string;
  user_id: string;
  status: ScanCaseStatus;
  status_updated_at: string;
  error_message: string | null;
  complaint: string | null;
  symptoms: string[];
  mileage: number | null;
  recent_repairs: string | null;
  battery_condition: string | null;
  technician_notes: string | null;
  title: string | null;
  report_language: string;
  created_at: string;
  updated_at: string;
  // Technician-initiated completion (migration 0042) — distinct from
  // `status`, which only tracks the AI pipeline stage. "completed" status
  // means a report was generated; these track whether a technician has
  // actually reviewed and closed out the case.
  technician_completed_at: string | null;
  technician_completed_by: string | null;
}

export type ScanFileFormat = "pdf" | "txt" | "csv" | "json" | "xml" | "html" | "unknown";

export interface ScanCaseFile {
  id: string;
  case_id: string;
  storage_path: string;
  original_filename: string;
  declared_mime_type: string;
  detected_format: ScanFileFormat | null;
  file_size_bytes: number;
  file_sha256: string;
  uploaded_at: string;
}

export interface ScanModule {
  name: string;
  status?: string;
}

export interface ScanExtraction {
  id: string;
  case_id: string;
  file_id: string;
  parser_id: string;
  parser_version: string;
  vin: string | null;
  make: string | null;
  model: string | null;
  model_year: number | null;
  engine: string | null;
  odometer_miles: number | null;
  modules: ScanModule[];
  freeze_frame: Record<string, unknown>[];
  live_data: Record<string, unknown>[];
  image_only_pdf: boolean;
  warnings: string[];
  reviewed_fields: Record<string, unknown>;
  extracted_at: string;
  reviewed_at: string | null;
  // Scanner/report metadata + extraction-quality tracking (migration 0028) —
  // see docs/FULL_SCAN_DATA_LOSS_AUDIT.md and canonical-scan.ts.
  scanner_brand: string | null;
  diagnostic_application_version: string | null;
  vehicle_software_version: string | null;
  diagnostic_path: string | null;
  test_time: string | null;
  report_type: string | null;
  pages_expected: number | null;
  pages_parsed: number | null;
  systems_expected: number | null;
  systems_parsed: number | null;
  dtcs_expected: number | null;
  dtcs_parsed: number | null;
  extraction_truncated: boolean;
  extraction_confidence: "high" | "medium" | "low" | null;
}

export type ScanDtcStatus =
  | "current"
  | "history"
  | "pending"
  | "permanent"
  | "intermittent"
  | "stored"
  | "reference_only"
  | "unknown";

export type ScanDtcSource = "extracted" | "user_added" | "user_edited";

export interface ScanDtcRecord {
  id: string;
  case_id: string;
  module: string | null;
  code: string;
  status: ScanDtcStatus | null;
  description_raw: string | null;
  source: ScanDtcSource;
  created_at: string;
  // Provenance + category relevance (migration 0028).
  system_name: string | null;
  source_page: number | null;
  source_text: string | null;
  safety_relevance: boolean;
  network_relevance: boolean;
  battery_relevance: boolean;
  bus_off_relevance: boolean;
}

export type ScanSystemStatus = "faulted" | "ok" | "unknown";

export interface ScanSystem {
  id: string;
  case_id: string;
  system_name: string;
  module_name: string | null;
  status: ScanSystemStatus;
  dtc_count_reported: number | null;
  dtc_count_extracted: number;
  extraction_complete: boolean;
  created_at: string;
}

export type ScanPatternSeverity = "info" | "warn" | "critical";

export interface ScanPattern {
  id: string;
  case_id: string;
  pattern_type: string;
  severity: ScanPatternSeverity;
  evidence: Record<string, unknown>;
  affected_modules: string[];
  rule_version: string;
  created_at: string;
}

export type ScanAiRunStatus = "running" | "completed" | "failed";

export interface ScanAiRun {
  id: string;
  case_id: string;
  provider_id: string;
  model_id: string;
  prompt_version: string | null;
  status: ScanAiRunStatus;
  output: Record<string, unknown> | null;
  safety_review: Record<string, unknown> | null;
  // Deprecated numeric field (kept for audit/debug only) — see
  // confidence_breakdown.confidenceLevel and ScanReport.confidence_level
  // for the value actually surfaced to users. docs/DIAGNOSTIC_SCHEMA_V2.md.
  confidence: number | null;
  confidence_breakdown: Record<string, unknown> | null;
  input_tokens: number | null;
  output_tokens: number | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export type ScanReportSchemaVersion = "1.0" | "2.0";
export type ScanConfidenceLevel = "high" | "medium" | "low" | "insufficient_evidence";

export interface ScanReport {
  id: string;
  case_id: string;
  ai_run_id: string;
  ranked_causes: Record<string, unknown>[];
  recommended_tests: Record<string, unknown>[];
  safety_warnings: Record<string, unknown>[];
  missing_information: string[];
  // Deprecated (schema_version "1.0" rows only) — never render directly;
  // schema_version "2.0" rows populate confidence_level instead and this
  // is kept only for audit/debug continuity. See
  // docs/DIAGNOSTIC_SCHEMA_V2.md and docs/DIAGNOSTIC_MIGRATION_PLAN.md.
  confidence: number;
  confidence_level: ScanConfidenceLevel | null;
  confidence_rationale: string[];
  schema_version: ScanReportSchemaVersion;
  generated_at: string;
}

export interface ScanFeedback {
  id: string;
  case_id: string;
  report_id: string;
  user_id: string;
  diagnosis_was_correct: boolean | null;
  actual_root_cause: string | null;
  confirmed_fix: string | null;
  parts_replaced: string[];
  notes: string | null;
  submitted_at: string;
}

// --- Diagnostic Workbench persistence (migration 0042) ------------------
// Ongoing technician notes, per-test/per-cause interactive state, and the
// verification checklist. All genuinely new — the only prior persistence
// was ScanCase.technician_notes (write-once at creation) and ScanFeedback
// (one-time post-repair form). See docs/DIAGNOSTIC_WORKBENCH_ARCHITECTURE.md.

export type ScanCaseNoteCategory = "observation" | "measurement" | "repair_performed" | "follow_up";

export interface ScanCaseNote {
  id: string;
  case_id: string;
  user_id: string;
  category: ScanCaseNoteCategory;
  body: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export type ScanTestOutcome = "pass" | "fail" | "not_tested";

// Keyed by (case_id, test_index) — test_index is the item's position in
// ScanReport.recommended_tests, which has no stable per-item id of its own.
export interface ScanReportTestProgress {
  id: string;
  case_id: string;
  report_id: string;
  test_index: number;
  completed: boolean;
  outcome: ScanTestOutcome;
  actual_result: string | null;
  technician_note: string | null;
  completed_at: string | null;
  updated_at: string;
}

export type ScanCauseStatus = "untested" | "supported" | "ruled_out" | "confirmed";

// Keyed by (case_id, cause_index) — cause_index is the item's position in
// ScanReport.ranked_causes.
export interface ScanReportCauseStatus {
  id: string;
  case_id: string;
  report_id: string;
  cause_index: number;
  status: ScanCauseStatus;
  reviewed: boolean;
  updated_at: string;
}

// One row per case — the fixed 8-item post-repair verification checklist.
export interface ScanCaseVerification {
  case_id: string;
  concern_resolved: boolean;
  dtcs_cleared: boolean;
  dtcs_did_not_return: boolean;
  calibration_completed: boolean;
  road_test_completed: boolean;
  no_new_warning_lights: boolean;
  post_repair_scan_reviewed: boolean;
  customer_notes_recorded: boolean;
  updated_at: string;
}
