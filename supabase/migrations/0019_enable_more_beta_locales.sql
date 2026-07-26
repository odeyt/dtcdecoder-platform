-- Activates the five newly built interface locales (zh-CN, pt-BR, de, ja, ko)
-- so the (app) shell renders in them, same honest beta posture as 0018:
-- enabled + public + free, seo_enabled=false (NOT indexed until human review),
-- support_tier=3 (AI-supported), safety_review_status='in_review'.
--
-- pt-BR needs a NEW row: migration 0006 seeded generic 'pt' only, and pt-BR is
-- a distinct first-class locale (never generic Portuguese). zh-CN, de, ja, ko
-- already exist as rows and are only UPDATEd.
--
-- Additive/non-destructive. Idempotent: the INSERT is ON CONFLICT DO NOTHING
-- and the UPDATE re-asserts flags. Rollback: delete the pt-BR row and set the
-- other four back to enabled=false (see docs/SPANISH_PUBLISH_ROLLBACK.md).

insert into languages (
  locale_code, base_language, region_code, english_name, native_name, script, direction,
  enabled, public_available, paid_only, support_tier,
  ai_input_enabled, ai_output_enabled, bilingual_enabled, multilingual_enabled,
  safety_review_status, glossary_completion_percent, ui_translation_completion_percent,
  seo_enabled, display_order
) values (
  'pt-BR', 'pt', 'BR', 'Portuguese (Brazil)', 'Português (Brasil)', 'Latin', 'ltr',
  true, true, false, 3,
  false, false, false, false,
  'in_review', 0, 100,
  false, 5
)
on conflict (locale_code) do nothing;

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
where locale_code in ('zh-CN', 'pt-BR', 'de', 'ja', 'ko');
