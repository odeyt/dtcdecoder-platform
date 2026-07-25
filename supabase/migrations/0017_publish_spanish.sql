-- Publishes Spanish as a fully public interface language, now that the core
-- UI translation is complete: nav/footer/hero/home plus pricing, account,
-- preferences, AI assistant, history, and all legal/policy pages are
-- translated (messages/es.json is a full mirror of en.json), the (app) shell
-- is locale-aware, and the public content tree serves /es.
--
-- Effect of each flag:
--   enabled              -> isEnabledLocale() honors the /es interface-locale
--                           cookie + saved account preference (app shell can
--                           render Spanish).
--   public_available     -> Spanish is an officially offered public language.
--   paid_only = false    -> free/anonymous visitors may use Spanish (it is the
--                           anonymous language-switcher target), matching how
--                           English (the default) is not paid-gated.
--   seo_enabled          -> buildLocaleAlternates() adds the /es hreflang +
--                           self-canonical, so search engines index Spanish.
--   support_tier = 1     -> fully supported.
--
-- Content caveat (documented, not a blocker): DTC descriptions and blog
-- article BODIES remain English (there is no per-locale content table yet);
-- only the UI chrome is translated. The es UI strings are machine/AI
-- translated and not professionally legal-reviewed — same standing as the
-- English legal drafts.
--
-- Additive/non-destructive: a single UPDATE of boolean/int/text flags on one
-- existing row. No schema change, no data deletion. Rollback in
-- docs/SPANISH_PUBLISH_ROLLBACK.md restores the pre-publish flag values.
update languages
set
  enabled = true,
  public_available = true,
  paid_only = false,
  seo_enabled = true,
  support_tier = 1,
  ui_translation_completion_percent = 100,
  safety_review_status = 'approved',
  updated_at = now()
where locale_code = 'es';
