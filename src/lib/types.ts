export type DtcDifficulty = "easy" | "moderate" | "hard" | "professional";
export type DtcSeverity = "low" | "moderate" | "high" | "critical";

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
  created_at: string;
  updated_at: string;
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
  category: string | null;
  notes: string | null;
  do_not_translate: boolean;
  safety_critical: boolean;
  review_status: "draft" | "reviewed" | "approved";
  reviewed_by: string | null;
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
