# Production Certification — DTCDecoder

Audit date basis: local repo state at commit `d2d4c7f` (`feature/dtc-ai-platform-rebuild`),
after migrations `0001`–`0011` applied to the live Supabase production project. This
report reflects a **code and local-environment audit** — no production deployment or
live-site verification was performed (see Deployment, below).

## Subsystem status

| Subsystem | Status | Notes |
|---|---|---|
| Security (route/admin protection) | **PASS** | See detail below — verified, not assumed. |
| Localization (architecture, catalogs, entitlements) | **PASS** | Catalog parity 190/190 keys verified live; entitlements unit-tested (16 assertions, all pass). |
| Localization (AI translation, cross-language) | **BLOCKED** | No `ANTHROPIC_API_KEY` available — see [`AI_TRANSLATION_RESULTS.md`](AI_TRANSLATION_RESULTS.md). Untested for Lao/Arabic/Chinese/Thai; only English/Spanish were exercised live in an earlier slice. |
| Billing (Creem) | **WARNING** | Feature-flagged off (`NEXT_PUBLIC_BILLING_ENABLED=false` locally) — inert, not broken. But 4 required product-ID env vars (`CREEM_PRO_PRODUCT_ID`, `CREEM_WORKSHOP_PRODUCT_ID`, `CREEM_PRO_YEARLY_PRODUCT_ID`, `CREEM_WORKSHOP_YEARLY_PRODUCT_ID`) are missing from `.env.local` and referenced directly (non-optionally) by `src/lib/payments/creem.ts`. Turning billing on without setting these will hard-fail every checkout attempt. |
| AI (assistant availability) | **BLOCKED** | `ANTHROPIC_API_KEY` missing — the AI assistant cannot function at all (not just translation) without it. This is the same blocker as above, not two separate ones. |
| SEO | **PASS** | `generateMetadata` + `buildLocaleAlternates` wired on every public page; hreflang correctly gated to `enabled && seo_enabled` locales (today: English + x-default only, by design). |
| Performance / Bundle health | **PASS** | Largest static chunk ~247KB, total shared JS ~1MB — no red flags. Static/dynamic route split unchanged from prior slices (`[locale]` root stays SSG; genuinely dynamic routes stay dynamic). No bundle analyzer configured for a deeper per-route breakdown — this is a coarse check, not a full performance audit (no Lighthouse run). |
| Accessibility | **NOT AUDITED** | No accessibility tooling (axe, Lighthouse CI, pa11y) exists in this project, and no manual a11y pass was performed in this session. This is an honest gap, not a passing or failing grade — don't infer either from silence. |
| Testing | **WARNING** | `tsc`/`lint`/`build`/unit tests (19 assertions) all pass. No integration or end-to-end tests exist — there's no test Supabase instance in this project, so RLS/integration behavior is verified by manual SQL Editor queries, not automated. This is a documented, known gap (see [`LOCALIZATION_OPERATIONS.md`](LOCALIZATION_OPERATIONS.md)), not a regression. |
| Deployment | **NOT PERFORMED** | No `vercel deploy` or production push happened in this session. Local commit `d2d4c7f` is pushed to `origin/feature/dtc-ai-platform-rebuild`, but that is not the same as a production deployment being live and verified. |
| Environment | **BLOCKED** | `ANTHROPIC_API_KEY` absent from local `.env.local`. **Vercel's actual production environment was not checked** — this session has no tool access to Vercel's env var dashboard; the Vercel CLI is installed and authenticated (`thammo01-7973`) but the local repo isn't linked to a project, and reading production env vars wasn't attempted to avoid an unplanned Vercel project link. **You must confirm directly in the Vercel dashboard whether `ANTHROPIC_API_KEY` is already set in production** — it may be, even though it's missing locally. |
| Database | **PASS** | Migrations `0001`–`0011` all applied and verified against the live Supabase production project (`dtcdecoder`) — `currency_rates` table and `email_signups.signup_locale` column both confirmed present via `information_schema.columns` queries run by you in the SQL Editor. |

## Security detail (route / admin protection) — verified, not assumed

Every `/admin/**` page is gated by `src/app/(app)/admin/layout.tsx`, which calls
`requireAdmin()` (redirects unauthenticated users to `/account/login`, non-admin
emails to `/`) before rendering any nested page. Several individual admin pages
(languages, glossary, currencies) additionally call `requireAdmin()` directly —
harmless redundancy, defense in depth, not a gap. Every admin Server Action
(`src/app/(app)/admin/actions/**`) also calls `requireAdmin()` independently, which
matters because actions are reachable directly by a POST, not only through the
protected page's UI.

Every `/account/**` page that shows account-specific data lives inside
`src/app/(app)/account/(protected)/`, gated by its own layout
(`(protected)/layout.tsx`), which redirects signed-out visitors to `/account/login`.
`/account/login` and `/account/auth/callback` are deliberately outside that route
group and unaffected by the redirect.

*(An earlier pass of this same audit briefly suspected several admin pages were
unprotected, based on a flawed shell check that failed to find
`src/app/(app)/admin/layout.tsx`. Reading the file directly showed the guard exists
and works correctly — noting this here because a security finding that turns out
false is worth being explicit about, not quietly dropping.)*

## RLS assumptions (spot-checked against migration source, not re-queried this pass)

- `languages` / `currencies` / `currency_rates`: public read (`using (true)`) —
  intentional, so locked-feature UI can render disabled rows; all writes go through
  service-role admin actions, no client insert/update policy exists.
- `terminology_glossary`: **no policy at all** — service-role only, never
  public-readable.
- `user_preferences` / `diagnostic_reports` / `diagnostic_report_localizations`:
  owner-read only (`auth.uid() = user_id`, or a join to the owning report); no
  client-side write policy on any of them.
- `email_signups`: not RLS-audited in this pass (out of scope for the multilingual
  migrations reviewed) — recommend a follow-up check if this hasn't been reviewed
  since the table was created.

## Free vs. paid behavior — audited against actual code, not the requested spec

The request for this audit assumed a free tier of "3 daily searches, 10 monthly
searches" with AI "locked." **That is not what's implemented.** The real, live limits
(`src/lib/ai/assistant.ts`):

- **DTC code lookup** (`/[locale]/dtc/[code]`, `/[locale]/[make]/[slug]`): public,
  anonymous, unlimited — no rate limit code touches these pages at all.
- **AI assistant**: requires sign-in (`401` if no user, regardless of plan) — there is
  no anonymous AI usage tier. Free-plan signed-in users get **5 AI queries per day**
  (`FREE_DAILY_QUERY_LIMIT = 5`), English output only (`canSelectAiReportLanguage`
  false for free). There is no separate monthly cap for free users — only the daily
  counter.
- **Pro/Workshop**: monthly *token* budget (not a query count), higher/no daily cap,
  non-English AI output, bilingual/multilingual reports per
  [`LANGUAGE_AND_CURRENCY_ENTITLEMENTS.md`](LANGUAGE_AND_CURRENCY_ENTITLEMENTS.md).

If the "3 daily / 10 monthly" numbers reflect a desired *change* to the free tier,
that's a real product decision (touches `FREE_DAILY_QUERY_LIMIT`, adds a new monthly
counter, adds a Supabase RPC) that hasn't been requested or built — flagging rather
than silently changing live rate-limit behavior, consistent with this project's
standing rule not to alter rate limits without explicit confirmation.

The request also asked to verify "OpenAI," "Gemini review," "Confidence," "Agreement,"
"Safety [score]," and "Export" for paid users. **None of these exist in the
implementation** — this is a single-Claude pipeline by deliberate, explicit decision
made earlier in this project (to avoid fabricating multi-model consensus metrics that
don't reflect anything real), and there is no report-export feature anywhere in the
app (`canExportLocalizedReports` is hardcoded `false` for every plan). These are
reported as **N/A**, not PASS or FAIL — marking them PASS would be certifying a
capability that doesn't exist.

## Exact blockers

1. **`ANTHROPIC_API_KEY` is not set locally**, and this session cannot confirm whether
   it's set in Vercel's production environment (no tool access to check). The AI
   assistant — the product's core feature — cannot function without it, in any
   language. **Action: confirm/set this in the Vercel dashboard before deploying.**
2. **AI translation cross-language accuracy is unverified** for Lao, Arabic, Chinese
   (Simplified), and Thai — directly downstream of blocker #1. Run
   `scripts/test-ai-translation.mjs` once a key is available and update
   `AI_TRANSLATION_RESULTS.md` with real results.
3. **No production deployment has been performed or verified** this session. Code is
   committed and pushed to the feature branch only.

**Warning (not a hard blocker, but should be resolved before enabling billing):**

4. Four Creem product-ID env vars are missing locally and referenced non-optionally by
   checkout code; currently inert only because billing is feature-flagged off.

## Verdict

# NOT PRODUCTION READY

Blocked on: missing `ANTHROPIC_API_KEY` (local; production status unconfirmed),
unverified AI translation for 4 of 5 non-English test languages, and no production
deployment has been performed. Database and code-level checks (tsc/lint/build/unit
tests, route protection, RLS assumptions, SEO metadata, bundle health) all pass.
