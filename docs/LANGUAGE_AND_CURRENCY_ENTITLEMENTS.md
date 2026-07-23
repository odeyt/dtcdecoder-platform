# Language & Currency Entitlements

The free/paid boundary for everything multilingual, and where each rule is enforced in
code. Every row below is checked server-side at the actual mutation point, not just
reflected in the UI — a disabled `<option>` or hidden button is never the real gate.

## Plan matrix

| Capability | Free | Pro | Workshop | Enforced by |
|---|:---:|:---:|:---:|---|
| Switch interface language (temporary, unsaved, cookie-based) | ✅ | ✅ | ✅ | `canSelectDefaultLanguage` — always `true`; costs nothing extra, it's static UI copy |
| **Save** interface language as an account preference | ❌ | ✅ | ✅ | `canSaveLanguagePreferences` |
| AI diagnostic output in a non-English language | ❌ (English only) | ✅ | ✅ | `canSelectAiReportLanguage`, re-checked in the AI route before honoring `outputLocale` |
| Save a non-English AI report language as a preference | ❌ | ✅ | ✅ | `canSaveAiReportLocale` |
| Bilingual reports (English + one other language) | ❌ | ✅ | ✅ | `canUseBilingualReports` |
| Secondary report language field | ❌ | ✅ | ✅ | `canSelectSecondaryLanguage` |
| Multilingual reports (3+ languages) | ❌ | ❌ | ✅ | `canUseMultilingualReports` |
| Max simultaneous report languages (English counts as one slot) | 0 | 2 | 3 | `maxReportLanguages` |
| Report modes available | `single` | `single`, `bilingual` | `single`, `bilingual`, `multilingual` | `allowedReportModes` / `canUseReportMode` |
| Save a preferred **display currency** (non-USD) | ❌ (USD only) | ✅ | ✅ | `canSelectDisplayCurrency` |
| Export a localized report (PDF, etc.) | ❌ | ❌ | ❌ | `canExportLocalizedReports` — hardcoded `false` for every plan; **no export feature exists in the app at all yet**, this isn't a paywall, it's an honest "not built" |

All of the above live in
[`src/lib/i18n/entitlements.ts`](../src/lib/i18n/entitlements.ts), mirroring the
config-object pattern already used for billing plans in `src/lib/pricing.ts`.

## Why "temporary switch" vs. "saved preference" are different gates

Every visitor — signed in or not, free or paid — can switch the interface language for
their current session via a cookie (`dtc_interface_locale`,
`APP_LOCALE_COOKIE_NAME` in `src/lib/i18n/app-shell-locale.ts`). This lets a free user
*preview* what a language looks like without paying for anything. What's actually
gated behind Pro/Workshop is **persistence** — a saved, cross-device
`user_preferences.interface_locale` — and AI output in a non-English language, which
costs a real second Claude call per query. The account preferences page
(`AccountPreferencesForm`) shows every enabled language regardless of plan (so a free
user sees the full catalog, including paid-only rows marked "— Pro/Workshop"), but the
save action re-validates entitlement server-side before writing anything.

## Currency

Saving a non-USD **display** currency preference is Pro/Workshop-only — this is a
display-formatting feature, not a cost-driven one like AI translation, but it's still
gated per the product's stated free/paid boundary. Free users always see USD. This
gate governs *saving a preference*; the underlying `getDisplayPriceEstimate()` function
itself has no plan awareness — it's pure display math, callable from any context.

Checkout is **always** USD through Creem for every plan — there is no currency
entitlement that changes what's actually charged, only what's *displayed* as an
estimate before checkout.

## Support tiers (admin-controlled activation, not a paywall)

Every one of the 54 registered languages has a `support_tier` (1–4) in the `languages`
table — this is an *operational* readiness signal, separate from the plan entitlements
above:

| Tier | Meaning | Who sees it |
|---|---|---|
| 1 | Fully verified — UI + AI output + safety review complete | Public, indexed (`seo_enabled`) |
| 2 | AI-supported — AI translation pipeline works and is tested, but UI translation and/or safety review incomplete | Paid preview only |
| 3 | Experimental — registered, partially built | Not shown publicly |
| 4 | Disabled/registered — seeded in the DB, zero translation work done | Not selectable anywhere |

Current real state (see [`LOCALIZATION_OPERATIONS.md`](LOCALIZATION_OPERATIONS.md) for
how to check/change this): English is Tier 1, fully live. Spanish is Tier 2 — AI
diagnostic translation is built and wired (migration `0008`), and the full UI
translation sweep is now complete (this slice), but `public_available`/`seo_enabled`
remain `false` until a real safety review of AI-generated (not just admin-authored)
Spanish output has actually been done — see the note in `LOCALIZATION_OPERATIONS.md`
about updating Spanish's `ui_translation_completion_percent` to reflect that the sweep
finished after migration `0008` was written. Every other language is Tier 4: seeded,
disabled, ready to activate with zero code changes once its own translation work
lands.

A language moving up a tier is **always** an admin data change
(`/admin/languages`), never a code deploy — that's the entire point of the registry
existing instead of a hardcoded language list.
