-- Activates Thai for AI-supported output, mirroring migration 0008's
-- activation of Spanish. The translation pipeline itself (Guided Diagnosis
-- turn translation, Scan Report translation, terminology glossary) was
-- built and tested this session, but the languages.ai_output_enabled flag
-- for Thai was never flipped -- every translation call site correctly
-- checked this flag and fell back to English the whole time, exactly as a
-- disabled locale should behave. This migration is the deliberate decision
-- to turn it on, requested directly by the owner.
--
-- Thai's UI chrome (next-intl catalog) is already fully translated and
-- enabled -- this only affects AI-generated content (diagnostic prose),
-- not interface strings.
--
-- Not yet support_tier 1 ("fully verified") for the same reason Spanish
-- wasn't at this stage: AI-generated Thai output has not yet had a
-- dedicated safety review pass. Lao is intentionally left untouched here --
-- built the same way this session, but not requested to be activated yet.
update languages
set
  ai_output_enabled = true,
  bilingual_enabled = true,
  support_tier = 2,
  safety_review_status = 'in_review'
where locale_code = 'th';
