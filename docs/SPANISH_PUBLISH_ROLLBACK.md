# Rollback: Publish Spanish (migration 0017)

Migration `0017_publish_spanish.sql` flips Spanish (`es`) to a fully public,
enabled interface language. It is a single non-destructive `UPDATE` of flags
on one existing `languages` row — no schema change, no data loss.

## What it changes

| Column | Before (post-0008) | After 0017 |
|---|---|---|
| `enabled` | false | **true** |
| `public_available` | false | **true** |
| `paid_only` | true | **false** |
| `seo_enabled` | false | **true** |
| `support_tier` | 2 | **1** |
| `ui_translation_completion_percent` | 0 | **100** |
| `safety_review_status` | in_review | **approved** |

## Effect

- App shell (`resolveAppShellLocale` → `isEnabledLocale`) honors the `es`
  interface-locale cookie / saved account preference → Spanish UI.
- `buildLocaleAlternates` adds the `/es` hreflang + self-canonical → Spanish
  becomes indexable.

## Verification (run after applying)

```sql
select locale_code, enabled, public_available, paid_only, seo_enabled,
       support_tier, ui_translation_completion_percent, safety_review_status
from languages where locale_code = 'es';
-- expect: es | t | t | f | t | 1 | 100 | approved
```

Then, in the app: with the `dtc_interface_locale=es` cookie set, `/pricing`
and `/account` render Spanish; page source of a content page shows a
`hreflang="es"` alternate.

## Rollback

To fully revert to the pre-publish (post-0008) state:

```sql
update languages
set
  enabled = false,
  public_available = false,
  paid_only = true,
  seo_enabled = false,
  support_tier = 2,
  ui_translation_completion_percent = 0,
  safety_review_status = 'in_review',
  updated_at = now()
where locale_code = 'es';
```

No code rollback is required — the app-shell locale code and language switcher
are inert for Spanish once `enabled` is false again (they fall back to
English), and hreflang drops `/es` automatically when `seo_enabled` is false.
The `messages/es.json` catalog and `/es` content routes remain in place and
harmless.
