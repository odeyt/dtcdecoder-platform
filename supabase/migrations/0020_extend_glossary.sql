-- Extends the controlled automotive glossary (terminology_glossary, created in
-- 0006 and ACTIVELY USED — injected into the translation system prompt + admin
-- CRUD) with the remaining spec fields. Additive only: new nullable text/
-- timestamp columns on an existing, live table. No data change.
--
-- Existing columns already cover: term_en (canonical), locale_code, translated_
-- term (approved), category, notes, do_not_translate, safety_critical,
-- review_status, reviewed_by, glossary_version, updated_at.

alter table terminology_glossary
  add column if not exists acronym text,
  add column if not exists manufacturer_context text,
  add column if not exists system_context text,
  add column if not exists alternative_translation text,
  add column if not exists reviewed_at timestamptz;
