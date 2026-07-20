# DTCDecoder — Current State Audit

Generated during the production-deployment push on 2026-07-21. Reflects the state of the `main` branch at commit `de84f7c`.

## 1. What is complete

- Full storefront (`/`, `/catalog`, `/wiring-diagrams`, `/software-tools`, `/products/[slug]`), guest-checkout flow, magic-link auth, protected `/account`, admin product CRUD (`/admin`), signed-URL download route, Creem checkout + webhook routes, `sitemap.ts` / `robots.ts`.
- Database schema and storage-bucket migrations exist and (per owner-run SQL Editor sessions) have been applied to the real `dtcdecoder` Supabase project — confirmed independently in this audit by a live local run against that project (see [supabase-verification.md](supabase-verification.md)).
- `npm run lint` — clean.
- `npx tsc --noEmit` — clean (strict mode intact).
- `npm run build` — succeeds, all 17 routes compile.
- Local dev smoke test against the real Supabase project — all public/protected/API routes behave correctly (see [local-smoke-test.md](local-smoke-test.md)).
- Git: `main` pushed to `origin/main` (GitHub: `odeyt/dtcdecoder-platform`), working tree clean apart from this deployment work.
- Vercel project `dtcdecoder` exists under team `redlined1-s-projects`, linked to the GitHub repo, auto-deploying on push.
- Vercel CLI authenticated (`thammo01-7973`); GitHub CLI authenticated (`odeyt`).
- 9 of 13 environment variables are set in Vercel (Production/Preview/Development): `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ADMIN_ALLOWED_EMAILS`, `SUPABASE_STORAGE_BUCKET_FILES`, `SUPABASE_STORAGE_BUCKET_PREVIEWS`, `NEXT_PUBLIC_BILLING_ENABLED`, `CREEM_API_BASE_URL`, `CREEM_SUCCESS_URL`.
- `dtcdecoder.com` and `www.dtcdecoder.com` added to the Vercel project (DNS not yet pointed — see below).

## 2. What is incomplete

- **4 secret environment variables are not yet set in Vercel**: `SUPABASE_SERVICE_ROLE_KEY`, `CREEM_API_KEY`, `CREEM_WEBHOOK_SECRET`, `CREEM_GENERIC_PRODUCT_ID`. Locally, `SUPABASE_SERVICE_ROLE_KEY` is configured in `.env.local`; the 3 Creem values are still placeholders locally too.
- The last Vercel production deployment was built **before** any env vars were set, so it currently 500s. It needs a fresh deploy to pick up the 9 vars now present (`NEXT_PUBLIC_*` vars are inlined at build time and won't update from a dashboard edit alone).
- `dtcdecoder.com` DNS at Namecheap still points at the registrar's default nameservers, not Vercel — domain is added to the Vercel project but not resolving there yet.
- No Creem webhook has been created in the Creem dashboard yet (needed to get a real `CREEM_WEBHOOK_SECRET`).
- Supabase Auth **URL Configuration** (Site URL + Redirect URLs) has not been confirmed as pointing at the right values for local/preview/production — see [supabase-auth-setup.md](supabase-auth-setup.md).
- No products exist yet in the `dtcdecoder` Supabase project (catalog pages correctly render an empty state).
- No admin test account / test product has been created yet (Phase 18 of the deployment spec).

## 3. What is configured

See [environment-matrix.md](environment-matrix.md) for the full per-variable breakdown.

## 4. What is missing

- `SUPABASE_SERVICE_ROLE_KEY`, `CREEM_API_KEY`, `CREEM_WEBHOOK_SECRET`, `CREEM_GENERIC_PRODUCT_ID` in Vercel (all three environments).
- DNS `A` records for `dtcdecoder.com` and `www.dtcdecoder.com` at Namecheap.
- A Creem webhook endpoint registration pointing at `/api/webhooks/creem`.

## 5. What blocks production

1. Missing Vercel secrets → any route touching `SUPABASE_SERVICE_ROLE_KEY` (downloads, admin writes, order writes) will 500 until at least that one is set. Public storefront browsing does **not** depend on it (verified — see smoke test).
2. Stale production build → even the 9 already-configured vars aren't live until a redeploy happens.
3. DNS not pointed at Vercel → `dtcdecoder.com` won't resolve to the app until Namecheap records are updated.

Billing (Creem) is intentionally **not** a hard blocker — `NEXT_PUBLIC_BILLING_ENABLED=false` gates the checkout route to a safe 503 without those secrets, by design (see [creem-readiness.md](creem-readiness.md)).

## 6. What requires owner action

- Add `SUPABASE_SERVICE_ROLE_KEY` to Vercel (Supabase → Settings → API Keys → `service_role` secret).
- Add `CREEM_API_KEY`, `CREEM_WEBHOOK_SECRET`, `CREEM_GENERIC_PRODUCT_ID` to Vercel once Creem sandbox/test setup is ready.
- Add DNS `A` records at Namecheap for `dtcdecoder.com` and `www`.
- Confirm/update Supabase Auth URL Configuration.
- Decide when to flip `NEXT_PUBLIC_BILLING_ENABLED` to `true` (explicit approval required — never done automatically).

## 7. What can be completed automatically

- Documentation (this set of files).
- Redeploying once the 9 already-set vars need to go live.
- Re-verifying the live site after each owner action lands.
- Committing/pushing documentation changes.

## Command results (Phase 8)

| Check | Result |
|---|---|
| `npm install` | OK — 368 packages, up to date |
| `npm audit` | 2 moderate — transitive `postcss` inside Next.js's bundled toolchain (XSS in CSS stringify, not reachable from this app's code paths). Fixing requires downgrading Next.js to `9.3.3` (`--force`), which is a regression — not applied. Documented, not blocking. |
| `npm run lint` | Clean |
| `npx tsc --noEmit` | Clean |
| `npm run build` | Success — 17 routes |
| `npm run test` | No test script defined in `package.json` |
