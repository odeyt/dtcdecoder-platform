-- Enables the six BUILT interface locales (es, fr, th, lo, vi, km) so the
-- (app) shell — account, pricing, preferences, and the legal pages that read
-- getLocale() — renders in the selected language. Until a locale is enabled
-- here, resolveAppShellLocale()/isEnabledLocale() ignore the interface-locale
-- cookie and saved account preference for it and fall back to English (the
-- public content tree under /<locale> already renders from the catalog and
-- does NOT depend on this flag).
--
-- Supersedes 0017_publish_spanish.sql: this migration covers es too, with the
-- HONEST beta flags below instead of 0017's "approved / seo_enabled" values.
-- Running 0018 makes 0017 unnecessary; running both is harmless (idempotent
-- UPDATEs), but if 0017 has already been applied, 0018 corrects es back to the
-- beta posture. Apply THIS one.
--
-- Flag rationale (all six locales are AI-translated, NOT human-reviewed):
--   enabled=true                 -> interface locale activates for the shell.
--   public_available=true        -> offered as a public language option.
--   paid_only=false              -> free/anonymous users may select it (it is
--                                   the anonymous language-switcher target),
--                                   matching English.
--   seo_enabled=FALSE            -> deliberately NOT indexed. buildLocaleAlternates
--                                   only emits hreflang for enabled+seo_enabled
--                                   locales; beta machine translations must not
--                                   be indexed until human linguistic review.
--                                   Flip an individual locale to true only after
--                                   review (start with es, the most mature).
--   support_tier=3               -> "AI-supported / beta", never tier 1 (verified).
--   ui_translation_completion_percent=100 -> catalogs are full key-parity mirrors
--                                   (enforced by test/catalog-parity.test.ts).
--   safety_review_status='in_review' -> honest: awaiting human review, not approved.
--
-- Does NOT touch ai_output_enabled/bilingual_enabled — AI *report* translation
-- for these locales is a later phase and stays as-is.
--
-- Additive/non-destructive: UPDATE of flags on existing rows only. Rollback in
-- docs/SPANISH_PUBLISH_ROLLBACK.md (extend the same UPDATE to these locale_codes).
update languages
set
  enabled = true,
  public_available = true,
  paid_only = false,
  seo_enabled = false,
  support_tier = 3,
  ui_translation_completion_percent = 100,
  safety_review_status = 'in_review',
  updated_at = now()
where locale_code in ('es', 'fr', 'th', 'lo', 'vi', 'km');
