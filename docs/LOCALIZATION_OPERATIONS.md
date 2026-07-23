# Localization Operations

Day-to-day operational reference: applying pending migrations, running admin
workflows, required env vars, testing, deployment/rollback, and known blockers. See
[`LOCALIZATION_ARCHITECTURE.md`](LOCALIZATION_ARCHITECTURE.md) for how the system is
built and [`LANGUAGE_AND_CURRENCY_ENTITLEMENTS.md`](LANGUAGE_AND_CURRENCY_ENTITLEMENTS.md)
for the free/paid rules.

## Migrations — two still need to be applied

Migrations `0001`–`0009` have been applied to the live Supabase project (confirmed via
live queries during earlier slices). **`0010_currency_rates.sql` and
`0011_email_signup_locale.sql` have NOT been applied yet** — they were written and
reviewed in this slice but never run against the real database.

Apply them the same way every prior migration in this project has been applied: paste
the file's contents into the Supabase Dashboard → SQL Editor → New Query → Run, in
order (`0010` before `0011` — `0011` doesn't depend on `0010`, but keep migrations in
numeric order as a habit). Both are additive only (`create table` /
`alter table ... add column`) — no drops, no data loss, no rollback needed if something
goes wrong beyond dropping the new table/column.

- `0010_currency_rates.sql` — creates `currency_rates` (public read, service-role
  write). Nothing reads from it until this migration is applied — admin currency
  actions, `getCurrencyRate()`, and the account preferences currency estimate will
  work but the estimate will always fall back to a plain USD price until it's applied.
- `0011_email_signup_locale.sql` — adds `signup_locale` to `email_signups`. The
  `/api/email-signup` route already handles a null column gracefully (it always sends
  `signup_locale` in the upsert), but the **column itself doesn't exist yet** — every
  signup will fail with a Postgres "column does not exist" error until this migration
  is applied. Apply this one before deploying the current code to production.

## Admin workflows

All admin routes are gated by `requireAdmin()` (`src/lib/admin-auth.ts`) — checks the
signed-in Supabase user's email against the `ADMIN_ALLOWED_EMAILS` env var (a
comma-separated list). Called at the top of every admin Server Action, not just at
render time, since actions are directly reachable by anyone who can send the same POST
regardless of what the UI renders.

### Activating a language

1. Go to `/admin/languages`, open the language's edit page.
2. Set `enabled` (and `public_available` if it should be indexed/visible to anonymous
   visitors), `support_tier`, `ai_output_enabled`/`bilingual_enabled` as appropriate,
   and `safety_review_status`.
3. The action rejects enabling a language whose code collides with an existing
   `dtc_codes.make` value (e.g. you can't enable a language coded `"de"` if a DTC code
   already has `make = "de"`) — this is enforced server-side, not just documented.
4. If the language needs AI diagnostic output, add its glossary terms first (below) —
   `ai_output_enabled` without any glossary rows still works, it just means no
   automotive-terminology protection for that language yet.

### Editing the terminology glossary

`/admin/glossary` — add/edit entries per `(term_en, locale_code)`. Set
`do_not_translate = true` for acronyms/identifiers that must appear verbatim (PCM,
DTC, ECU, etc.); otherwise provide a `translated_term`. Only `reviewed`/`approved`
rows are actually injected into the translation prompt (`review_status = 'draft'`
entries are saved but not yet live) — this lets you draft a glossary pass without it
affecting production translations until you mark it reviewed.

### Managing currencies and rates

`/admin/currencies` — enable/disable currencies for the account preferences currency
picker, and set/update exchange rates in the rates table below it. Rates are static
and admin-entered (`source_label` records where the number came from — e.g.
"admin-entered" or a specific date/source you note); there is no live FX feed. Set
`expires_at` if a rate should stop being used after a certain date (an expired rate
falls back to showing USD, never a stale number). Updating a rate is instant — no
deploy required, it's read live by `getDisplayPriceEstimate()`.

### Known follow-up: Spanish's `ui_translation_completion_percent` is stale

Migration `0008` (which activated Spanish for AI output, Tier 2) was written when only
nav/footer/hero/home were translated, and its comment says so explicitly. Since then
(this slice), the full UI translation sweep for Spanish was completed — pricing,
account, preferences, DTC result chrome, search, errors, email signup, login, history,
and AI assistant chrome are all translated (187 keys, catalog parity verified). The
`languages` row for `es` still reflects the old, lower completion percentage because
no migration or admin action updated it after the sweep finished. **Recommended next
step:** an admin should open `/admin/languages/es/edit` and update
`ui_translation_completion_percent` to reflect the real current state — this is a data
edit through the existing admin screen, not a code change.

## Environment variables

See `.env.example` for the full list with placeholder values. The ones specific to
this system:

| Var | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes (server-only) | Powers both the AI diagnostic assistant and `translateDiagnosticText`. Missing key = every AI request fails, in every language, not just non-English ones. |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Used by `proxy.ts` for session refresh and by every RLS-gated read (languages, currencies, currency_rates public reads use the anon client where called client-side). |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (server-only) | Used by every admin action and every registry/glossary/currency-rate read in `src/lib/i18n/*` — these all go through the admin (service-role) client, bypassing RLS, since none of that data is user-scoped-sensitive but some (glossary) has no public policy at all. |
| `ADMIN_ALLOWED_EMAILS` | Yes | Gates every `/admin/**` route and Server Action. |
| `NEXT_PUBLIC_SITE_URL` | Yes | Used by `buildLocaleAlternates()` to construct absolute canonical/hreflang URLs. |

No new env vars were introduced by this slice specifically for currency/signup-locale
work — both features reuse the existing Supabase service-role client.

## Testing

- **Type checking / lint / build**: `npx tsc --noEmit`, `npm run lint`,
  `npm run build` — run after every substantive change; this project has caught real
  regressions (most notably the static-generation trap described in
  `LOCALIZATION_ARCHITECTURE.md`) purely by checking the build's route table for
  unexpected `ƒ` (dynamic) markers on routes that should be `●`/`○`.
- **Unit tests**: `npm run test` (Vitest, added this slice — no test runner existed
  before). Covers `src/lib/currency.ts`'s pure conversion/formatting functions and
  every function in `src/lib/i18n/entitlements.ts`. See "Why a Vitest alias for
  `server-only`" below if extending these.
- **AI translation live test**: `scripts/test-ai-translation.mjs` — see
  [`AI_TRANSLATION_LIVE_TEST.md`](AI_TRANSLATION_LIVE_TEST.md). Requires a real
  `ANTHROPIC_API_KEY`; **not run** in this environment (no key available). Makes real,
  billed API calls — don't add it to CI without deciding who owns that cost.
- **RLS / integration testing**: not automated — there is no test Supabase instance in
  this project. Manual verification approach used throughout this project: query the
  live (or a scratch) Supabase project directly via the SQL Editor to confirm a policy
  behaves as expected (e.g. `select * from languages` as the anon role should return
  all rows including disabled ones; `select * from terminology_glossary` as anon
  should return zero rows/an authorization error).

### Why a Vitest alias for `server-only`

Several modules in `src/lib/i18n/` and `src/lib/currency.ts` start with
`import "server-only"`, which throws when imported outside a Next.js server-component
bundling context (the package no-ops only under the `"react-server"` export
condition; plain Node — which is what Vitest runs under — gets the throwing branch).
`vitest.config.ts` aliases `server-only` to a no-op test stub
(`test/mocks/server-only.ts`) so these modules can be imported directly in tests
without touching their source. This is why `scripts/test-ai-translation.mjs` (which
isn't run through Vitest) instead duplicates the relevant prompt logic rather than
importing `src/lib/ai/assistant.ts` — see that script's own header comment.

## Deployment / rollback

No production deployment or Vercel redeploy was performed as part of this slice —
everything above has been verified locally (tsc/lint/build/unit tests) and against the
live Supabase project's already-applied migrations (`0001`–`0009`) only.

Before deploying this slice's code to production:

1. Apply migrations `0010` and `0011` (above) to the live Supabase project first — the
   email signup route will hard-fail on every submission if `0011` isn't applied
   before the new code goes live.
2. Confirm `ANTHROPIC_API_KEY` is set in the production environment (Vercel project
   settings) — it's required for the AI assistant to function at all, not just for
   translation.
3. Deploy through the existing connected Git workflow (push to the branch Vercel is
   tracking) — nothing about this slice changes the deployment mechanism itself.

**Rollback**: both new migrations are additive (new table, new nullable column) —
rolling back the application code does not require rolling back the schema. If a
schema rollback is ever needed: `drop table currency_rates;` and
`alter table email_signups drop column signup_locale;` are safe, isolated, and don't
cascade into any other table.

## Known limitations (operational)

- Currency rates require manual admin upkeep — there is no reminder system for a rate
  approaching its `expires_at`. An admin should periodically check `/admin/currencies`
  for rates that have gone stale.
- The AI translation live-test script has never been run against the real API. Until
  someone runs it with a real key, "AI translation works for Lao/Arabic/Chinese/Thai"
  is an untested claim for those four languages — only Spanish has been exercised
  live (during Slice 4 verification, English/Spanish AI response comparison).
- No monitoring/alerting exists for translation failures, elevated latency on
  non-English requests, or safety-review status changes — this would need real event
  instrumentation that doesn't exist in the app today.
