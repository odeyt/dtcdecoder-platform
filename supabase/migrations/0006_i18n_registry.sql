-- Global multilingual platform: language registry, currency registry,
-- automotive terminology protection, and per-user language/region/currency
-- preferences. Phase 1 of the multilingual rollout — see the plan for the
-- full rationale. Only English is fully activated in this migration;
-- Spanish and every other language are seeded but left disabled/unreviewed
-- until their actual translation work lands in a later slice (a language
-- must not claim a support tier it hasn't earned).

create table languages (
  locale_code text primary key,           -- BCP-47, e.g. 'en', 'es', 'zh-CN'
  base_language text not null,
  region_code text,
  english_name text not null,
  native_name text not null,
  script text not null default 'Latin',
  direction text not null default 'ltr' check (direction in ('ltr', 'rtl')),
  enabled boolean not null default false,
  public_available boolean not null default false,
  paid_only boolean not null default true,
  support_tier int not null default 4 check (support_tier between 1 and 4),
  ai_input_enabled boolean not null default false,
  ai_output_enabled boolean not null default false,
  bilingual_enabled boolean not null default false,
  multilingual_enabled boolean not null default false,
  safety_review_status text not null default 'not_reviewed'
    check (safety_review_status in ('not_reviewed', 'in_review', 'approved', 'rejected')),
  glossary_completion_percent int not null default 0
    check (glossary_completion_percent between 0 and 100),
  ui_translation_completion_percent int not null default 0
    check (ui_translation_completion_percent between 0 and 100),
  seo_enabled boolean not null default false,
  -- Always false today: no PDF/report-export feature exists anywhere in the
  -- app yet (DTC pages link out to external Gumroad PDFs/YouTube). This
  -- column exists so the registry shape is future-ready, not because export
  -- is implemented — src/lib/i18n/entitlements.ts hardcodes the
  -- corresponding entitlement to false regardless of this column.
  export_enabled boolean not null default false,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index languages_enabled_idx on languages (enabled, public_available);

create trigger languages_set_updated_at
before update on languages
for each row execute function set_updated_at();

-- Public read on the full table (not just enabled=true rows): the account
-- preferences UI needs to render locked/disabled languages too ("Spanish —
-- Pro only", "French coming soon"), not just the active subset. Callers
-- filter to enabled+public_available themselves for routing/sitemap
-- purposes. No insert/update/delete policy — every write goes through the
-- admin Server Action's service-role client.
alter table languages enable row level security;
create policy languages_public_read on languages for select using (true);

create table currencies (
  code text primary key,                  -- ISO 4217, e.g. 'USD'
  name text not null,
  symbol text not null,
  decimal_places int not null default 2,
  enabled boolean not null default false,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger currencies_set_updated_at
before update on currencies
for each row execute function set_updated_at();

alter table currencies enable row level security;
create policy currencies_public_read on currencies for select using (true);

-- Automotive terminology protection. Consumed server-side only (injected
-- into the AI translation system prompt) — never exposed via a public
-- policy, matching admin_settings.
create table terminology_glossary (
  id uuid primary key default gen_random_uuid(),
  term_en text not null,
  locale_code text not null references languages (locale_code),
  translated_term text not null,
  category text,
  notes text,
  do_not_translate boolean not null default false,
  safety_critical boolean not null default false,
  review_status text not null default 'draft'
    check (review_status in ('draft', 'reviewed', 'approved')),
  reviewed_by text,
  glossary_version int not null default 1,
  updated_at timestamptz not null default now(),
  unique (term_en, locale_code)
);

create index terminology_glossary_locale_idx on terminology_glossary (locale_code);

create trigger terminology_glossary_set_updated_at
before update on terminology_glossary
for each row execute function set_updated_at();

alter table terminology_glossary enable row level security;
-- No policy at all — service-role only, same as admin_settings.

create table user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  interface_locale text not null default 'en' references languages (locale_code),
  ai_report_locale text references languages (locale_code),
  secondary_report_locale text references languages (locale_code),
  report_mode text not null default 'single'
    check (report_mode in ('single', 'bilingual', 'multilingual')),
  preferred_currency text references currencies (code),
  measurement_system text not null default 'imperial'
    check (measurement_system in ('imperial', 'metric')),
  timezone text,
  date_format text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_preferences_set_updated_at
before update on user_preferences
for each row execute function set_updated_at();

-- Owner-read only. Deliberately no insert/update policy: this app writes
-- every user-scoped row through a Server Action + the service-role client
-- (see admin actions, subscriptions webhook), not via direct RLS-gated
-- client writes — kept consistent rather than introducing a new pattern.
alter table user_preferences enable row level security;
create policy user_preferences_owner_read on user_preferences
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- Seed data: the full target language list from the rollout plan, so the
-- registry already covers global reach on day one. Only English is fully
-- live; every other row (including Spanish) stays disabled until its own
-- translation/safety-review work is complete in a later slice.
-- ---------------------------------------------------------------------

insert into languages (
  locale_code, base_language, region_code, english_name, native_name, script, direction,
  enabled, public_available, paid_only, support_tier,
  ai_input_enabled, ai_output_enabled, bilingual_enabled, multilingual_enabled,
  safety_review_status, glossary_completion_percent, ui_translation_completion_percent,
  seo_enabled, display_order
) values
  ('en', 'en', null, 'English', 'English', 'Latin', 'ltr',
    true, true, false, 1,
    true, true, true, true,
    'approved', 100, 100, true, 0),
  ('es', 'es', null, 'Spanish', 'Español', 'Latin', 'ltr',
    false, false, true, 3,
    false, false, false, false,
    'not_reviewed', 0, 0, false, 1),
  ('fr', 'fr', null, 'French', 'Français', 'Latin', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 2),
  ('de', 'de', null, 'German', 'Deutsch', 'Latin', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 3),
  ('pt', 'pt', null, 'Portuguese', 'Português', 'Latin', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 4),
  ('it', 'it', null, 'Italian', 'Italiano', 'Latin', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 5),
  ('nl', 'nl', null, 'Dutch', 'Nederlands', 'Latin', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 6),
  ('pl', 'pl', null, 'Polish', 'Polski', 'Latin', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 7),
  ('ro', 'ro', null, 'Romanian', 'Română', 'Latin', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 8),
  ('cs', 'cs', null, 'Czech', 'Čeština', 'Latin', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 9),
  ('sk', 'sk', null, 'Slovak', 'Slovenčina', 'Latin', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 10),
  ('hu', 'hu', null, 'Hungarian', 'Magyar', 'Latin', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 11),
  ('el', 'el', null, 'Greek', 'Ελληνικά', 'Greek', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 12),
  ('sv', 'sv', null, 'Swedish', 'Svenska', 'Latin', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 13),
  ('no', 'no', null, 'Norwegian', 'Norsk', 'Latin', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 14),
  ('da', 'da', null, 'Danish', 'Dansk', 'Latin', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 15),
  ('fi', 'fi', null, 'Finnish', 'Suomi', 'Latin', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 16),
  ('uk', 'uk', null, 'Ukrainian', 'Українська', 'Cyrillic', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 17),
  ('ru', 'ru', null, 'Russian', 'Русский', 'Cyrillic', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 18),
  ('tr', 'tr', null, 'Turkish', 'Türkçe', 'Latin', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 19),
  ('ar', 'ar', null, 'Arabic', 'العربية', 'Arabic', 'rtl',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 20),
  ('he', 'he', null, 'Hebrew', 'עברית', 'Hebrew', 'rtl',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 21),
  ('fa', 'fa', null, 'Persian', 'فارسی', 'Arabic', 'rtl',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 22),
  ('hi', 'hi', null, 'Hindi', 'हिन्दी', 'Devanagari', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 23),
  ('bn', 'bn', null, 'Bengali', 'বাংলা', 'Bengali', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 24),
  ('ur', 'ur', null, 'Urdu', 'اردو', 'Arabic', 'rtl',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 25),
  ('pa', 'pa', null, 'Punjabi', 'ਪੰਜਾਬੀ', 'Gurmukhi', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 26),
  ('gu', 'gu', null, 'Gujarati', 'ગુજરાતી', 'Gujarati', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 27),
  ('mr', 'mr', null, 'Marathi', 'मराठी', 'Devanagari', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 28),
  ('ta', 'ta', null, 'Tamil', 'தமிழ்', 'Tamil', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 29),
  ('te', 'te', null, 'Telugu', 'తెలుగు', 'Telugu', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 30),
  ('kn', 'kn', null, 'Kannada', 'ಕನ್ನಡ', 'Kannada', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 31),
  ('ml', 'ml', null, 'Malayalam', 'മലയാളം', 'Malayalam', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 32),
  ('ne', 'ne', null, 'Nepali', 'नेपाली', 'Devanagari', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 33),
  ('si', 'si', null, 'Sinhala', 'සිංහල', 'Sinhala', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 34),
  ('th', 'th', null, 'Thai', 'ไทย', 'Thai', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 35),
  ('lo', 'lo', null, 'Lao', 'ລາວ', 'Lao', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 36),
  ('vi', 'vi', null, 'Vietnamese', 'Tiếng Việt', 'Latin', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 37),
  ('km', 'km', null, 'Khmer', 'ខ្មែរ', 'Khmer', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 38),
  ('my', 'my', null, 'Burmese', 'မြန်မာ', 'Myanmar', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 39),
  ('id', 'id', null, 'Indonesian', 'Bahasa Indonesia', 'Latin', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 40),
  ('ms', 'ms', null, 'Malay', 'Bahasa Melayu', 'Latin', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 41),
  ('fil', 'fil', null, 'Filipino', 'Filipino', 'Latin', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 42),
  ('zh-CN', 'zh', 'CN', 'Chinese (Simplified)', '简体中文', 'Han-Simplified', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 43),
  ('zh-TW', 'zh', 'TW', 'Chinese (Traditional)', '繁體中文', 'Han-Traditional', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 44),
  ('ja', 'ja', null, 'Japanese', '日本語', 'Japanese', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 45),
  ('ko', 'ko', null, 'Korean', '한국어', 'Hangul', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 46),
  ('sw', 'sw', null, 'Swahili', 'Kiswahili', 'Latin', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 47),
  ('am', 'am', null, 'Amharic', 'አማርኛ', 'Ethiopic', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 48),
  ('af', 'af', null, 'Afrikaans', 'Afrikaans', 'Latin', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 49),
  ('zu', 'zu', null, 'Zulu', 'isiZulu', 'Latin', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 50),
  ('ha', 'ha', null, 'Hausa', 'Hausa', 'Latin', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 51),
  ('yo', 'yo', null, 'Yoruba', 'Yorùbá', 'Latin', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 52),
  ('so', 'so', null, 'Somali', 'Soomaali', 'Latin', 'ltr',
    false, false, true, 4, false, false, false, false, 'not_reviewed', 0, 0, false, 53);

insert into currencies (code, name, symbol, decimal_places, enabled, display_order) values
  ('USD', 'US Dollar', '$', 2, true, 0),
  ('EUR', 'Euro', '€', 2, false, 1),
  ('GBP', 'British Pound', '£', 2, false, 2),
  ('CAD', 'Canadian Dollar', '$', 2, false, 3),
  ('AUD', 'Australian Dollar', '$', 2, false, 4),
  ('NZD', 'New Zealand Dollar', '$', 2, false, 5),
  ('JPY', 'Japanese Yen', '¥', 0, false, 6),
  ('CNY', 'Chinese Yuan', '¥', 2, false, 7),
  ('HKD', 'Hong Kong Dollar', '$', 2, false, 8),
  ('SGD', 'Singapore Dollar', '$', 2, false, 9),
  ('KRW', 'South Korean Won', '₩', 0, false, 10),
  ('INR', 'Indian Rupee', '₹', 2, false, 11),
  ('THB', 'Thai Baht', '฿', 2, false, 12),
  ('LAK', 'Lao Kip', '₭', 2, false, 13),
  ('VND', 'Vietnamese Dong', '₫', 0, false, 14),
  ('MYR', 'Malaysian Ringgit', 'RM', 2, false, 15),
  ('IDR', 'Indonesian Rupiah', 'Rp', 2, false, 16),
  ('PHP', 'Philippine Peso', '₱', 2, false, 17),
  ('AED', 'UAE Dirham', 'د.إ', 2, false, 18),
  ('SAR', 'Saudi Riyal', '﷼', 2, false, 19),
  ('QAR', 'Qatari Riyal', 'ر.ق', 2, false, 20),
  ('KWD', 'Kuwaiti Dinar', 'د.ك', 3, false, 21),
  ('BHD', 'Bahraini Dinar', '.د.ب', 3, false, 22),
  ('ZAR', 'South African Rand', 'R', 2, false, 23),
  ('NGN', 'Nigerian Naira', '₦', 2, false, 24),
  ('KES', 'Kenyan Shilling', 'KSh', 2, false, 25),
  ('MXN', 'Mexican Peso', '$', 2, false, 26),
  ('BRL', 'Brazilian Real', 'R$', 2, false, 27),
  ('ARS', 'Argentine Peso', '$', 2, false, 28),
  ('CLP', 'Chilean Peso', '$', 0, false, 29),
  ('COP', 'Colombian Peso', '$', 2, false, 30),
  ('PEN', 'Peruvian Sol', 'S/', 2, false, 31),
  ('CHF', 'Swiss Franc', 'CHF', 2, false, 32),
  ('SEK', 'Swedish Krona', 'kr', 2, false, 33),
  ('NOK', 'Norwegian Krone', 'kr', 2, false, 34),
  ('DKK', 'Danish Krone', 'kr', 2, false, 35),
  ('PLN', 'Polish Zloty', 'zł', 2, false, 36),
  ('CZK', 'Czech Koruna', 'Kč', 2, false, 37),
  ('HUF', 'Hungarian Forint', 'Ft', 0, false, 38),
  ('RON', 'Romanian Leu', 'lei', 2, false, 39),
  ('TRY', 'Turkish Lira', '₺', 2, false, 40);

-- A handful of representative, hand-reviewed terminology entries for
-- Spanish, proving the protection mechanism (acronyms and technical
-- identifiers preserved verbatim) ahead of the full glossary pass. This is
-- not a claim that Spanish's glossary is complete — languages.
-- glossary_completion_percent for 'es' stays 0 until the full pass lands.
insert into terminology_glossary (
  term_en, locale_code, translated_term, category, do_not_translate, safety_critical, review_status
) values
  ('PCM', 'es', 'PCM', 'acronym', true, false, 'approved'),
  ('DTC', 'es', 'DTC', 'acronym', true, false, 'approved'),
  ('ECU', 'es', 'ECU', 'acronym', true, false, 'approved'),
  ('Powertrain Control Module', 'es', 'Módulo de Control del Tren Motriz (PCM)', 'module_name', false, false, 'approved'),
  ('Check Engine Light', 'es', 'Luz de Revisar Motor (Check Engine)', 'dashboard_indicator', false, true, 'approved'),
  ('CAN Bus', 'es', 'Bus CAN', 'network_protocol', false, false, 'approved'),
  ('Misfire', 'es', 'Falla de encendido (misfire)', 'symptom', false, true, 'approved'),
  ('Torque', 'es', 'Par de apriete (torque)', 'measurement', false, false, 'approved');
