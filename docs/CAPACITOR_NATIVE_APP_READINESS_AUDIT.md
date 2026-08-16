# Capacitor / Native App Readiness Audit

**Date:** 2026-08-16
**Question:** Is DTCDecoder ready to be wrapped with Capacitor and shipped as a native Android/iOS app?
**Answer:** Not yet. Android is realistically a few weeks of focused work away. iOS has a business-model blocker (payments) that needs a decision before any engineering starts.

This audit is a point-in-time code + policy review. App Store / Play Store policy specifics shift over time — verify current guidelines against Apple's and Google's own developer docs before submitting, rather than relying solely on this document.

## Why this isn't a typical "static export → Capacitor" job

There is no Capacitor dependency in `package.json` and no `output: "export"` in `next.config.ts` — and there can't easily be one. DTCDecoder is a fully server-rendered Next.js 16 app:

- Dynamic API routes (`src/app/api/**`)
- `src/proxy.ts` (Edge middleware) handling Supabase auth-cookie refresh and locale rewriting
- Server actions and Supabase SSR cookies
- AI report generation and Creem webhook processing that must run server-side

None of that survives a static bundle. The realistic pattern here is **Capacitor as a thin native shell pointed at the live `https://dtcdecoder.com`** (a WebView wrapper, not an offline-bundled export) — a legitimate, common approach for apps like this, but it changes what "readiness" means: less about whether the code is portable, more about whether the stores accept a wrapped website and whether auth/payments survive being wrapped.

## Blockers, ranked

### 1. Apple App Store Guideline 3.1.1 (In-App Purchase) — likely hard blocker for iOS

`src/lib/payments/creem.ts` redirects to a Creem-hosted `checkout_url` — an external payment page — for both one-time report purchases and subscriptions (`createCheckout`, `createSubscriptionCheckout`, etc. all return `data.checkout_url`). Apple requires digital goods consumed inside an app to go through StoreKit/IAP (Apple's 30% cut) unless a narrow exemption applies (reader apps, physical goods, B2B) — this doesn't qualify.

This isn't a code tweak. It's either:
- Building a parallel IAP integration for iOS (StoreKit, receipt validation, subscription APIs — a project of its own), or
- A business decision to not sell inside the iOS app at all (e.g., "manage your account on the web" framing, similar to how some SaaS apps scope their iOS app down).

Confirm current guidelines directly against Apple's developer docs before committing engineering time here.

### 2. Apple Guideline 4.2 (Minimum Functionality) — real risk

Apple rejects apps that are "simply a website wrapped in a WebView with no meaningful native functionality." As it stands, wrapping DTCDecoder today would ship with zero native capability: no push notifications, no native camera integration, no biometric unlock, no widgets.

The AI report-generation flow is async and can take a noticeable amount of time — a strong, non-cosmetic fit for push notifications ("your report is ready"). That alone would meaningfully help satisfy 4.2, and is a good first native feature to build.

### 3. Magic-link auth won't reliably reopen the app

`src/app/(app)/account/auth/callback/route.ts` completes sign-in via a plain `https://dtcdecoder.com/...` redirect (`supabase.auth.exchangeCodeForSession(code)` then `NextResponse.redirect`). Without Universal Links (iOS) / App Links (Android) configured, tapping that link from Mail/Gmail opens the system browser, not the wrapped app — so the user ends up signed in in Safari/Chrome, not inside the app (separate cookie/session store).

Password sign-in (already shipped — see `CLAUDE.md` hard constraint #3) sidesteps this entirely and should be the default entry point inside the native shell. Magic-link can still work if Universal/App Links are configured (`apple-app-site-association`, `assetlinks.json`, a Capacitor deep-link plugin), but that's additional native configuration not yet in place.

### 4. File upload for VIN/DTC scans is a plain `<input type="file">`

`src/components/ScanCaseUploadForm.tsx` uses a standard file input. This works inside both WKWebView and Android WebView, but the UX is noticeably worse than native (extra permission dialogs, no direct camera launch, format quirks on iOS Safari-based capture). Swapping to Capacitor's Camera plugin fixes the UX and doubles as a genuine native feature for point 2 above.

### 5. PWA install UI becomes dead weight (cleanup, not a blocker)

The `/install` page and the `beforeinstallprompt`-driven install button (`src/lib/pwa/install-prompt-store.ts`, `InstallPrompt`, `InstallAppButton`) are meaningless once the app is actually wrapped as a native app — there's no browser chrome to install from. Should be conditionally hidden via Capacitor's `Capacitor.isNativePlatform()` check once the native shell exists, rather than assumed away. Same applies to the service worker's offline-page caching (`public/sw.js`) — fine to keep for the plain mobile-web/PWA audience, just needs to coexist with (not assume it's the only client of) the app.

## What's already in good shape

- **Mobile responsiveness** has real, recently-verified coverage: the mobile-390px overflow fix (`src/app/globals.css`'s `.container-app`, fixed 2026-08-16) and `tests/e2e/smoke/workbench-redesign.spec.ts` asserting no horizontal overflow at desktop/tablet/mobile viewports. Playwright already runs `mobile-chrome` (Pixel 7) and `mobile-safari` (iPhone 14) projects (`playwright.config.ts`).
- **Security headers** (`next.config.ts`'s CSP, `frame-ancestors 'none'`, etc.) won't interfere with being the top-level page in a WebView — those headers govern being *framed by* other origins, not being loaded as the top-level page itself.
- **Supabase's cookie-based session model** works as-is inside a WebView; no rearchitecture needed there.
- **Password-based auth** (already shipped) is the right entry point for a wrapped app and needs no extra work.

## Recommended sequence if proceeding

1. **Android first.** Lower store-policy risk (Google Play's minimum-functionality scrutiny is less strict in practice than Apple's 4.2, and several jurisdictions now permit external payment links under regulatory settlements — still evolving, verify current Play Payments Policy before relying on it). Scaffold Capacitor pointed at the live URL, add App Links + push notifications + native camera capture, submit.
2. **iOS second, gated on a payments decision.** Get a definitive read — internally or via a pre-submission consult — on whether Creem checkout survives App Review as-is, whether report/subscription purchases need StoreKit, or whether the iOS app needs to be scoped down to exclude in-app purchasing entirely. That's a product/legal call, not an engineering one, and should be resolved before Capacitor work starts on the iOS side.

## Summary checklist

| Area | Status | Action needed |
|---|---|---|
| Static export / bundlable build | N/A — server-rendered by design | None — use live-URL WebView pattern instead |
| iOS payments (Guideline 3.1.1) | Blocker | Product/legal decision: StoreKit integration vs. scope iOS app to exclude purchases |
| iOS minimum functionality (Guideline 4.2) | At risk | Add push notifications + native camera before submitting |
| Magic-link deep linking | Gap | Configure Universal Links / App Links, or default to password sign-in in-app |
| VIN/DTC photo upload UX | Works, not native | Swap to Capacitor Camera plugin |
| PWA install UI in native shell | Cleanup item | Gate behind `Capacitor.isNativePlatform()` |
| Mobile responsiveness | Ready | None — recently verified across 3 viewports |
| Security headers | Ready | None — doesn't affect WebView top-level loads |
| Auth session model | Ready | None — cookie-based, works as-is |
