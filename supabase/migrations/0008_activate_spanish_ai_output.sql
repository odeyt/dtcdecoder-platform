-- Activates Spanish for AI-supported output (support tier 2), now that the
-- translation pipeline (translateDiagnosticText: always translate the
-- fixed English canonical text, never regenerate independently) and
-- terminology protection (terminology_glossary, seeded in migration 0006)
-- are built and tested end-to-end.
--
-- This is deliberately NOT tier 1 ("fully verified"): the spec's own tier
-- gates require core interface translation to be complete first, and only
-- nav/footer/hero/homepage are translated so far (DTC results, pricing,
-- and account screens are still English-only). Spanish stays paid_only,
-- not public_available, until that UI work lands and a real safety review
-- of the AI-generated (not just admin-authored) Spanish output is done.
update languages
set
  ai_output_enabled = true,
  bilingual_enabled = true,
  support_tier = 2,
  safety_review_status = 'in_review'
where locale_code = 'es';
