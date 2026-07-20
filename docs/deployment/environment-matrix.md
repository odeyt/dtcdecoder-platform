# Environment Variable Matrix

Source of truth: [src/lib/env.ts](../../src/lib/env.ts). No unused variables are listed — every entry below is read somewhere in the app.

| Variable | Purpose | Required/Optional | Secret? | Browser exposure | Local (`.env.local`) | Vercel Production | Vercel Preview |
|---|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Base URL used for auth redirects, sitemap, robots, Creem success URL | Optional (defaults to `http://localhost:3000`) | No | Allowed (public) | SET (`http://localhost:3000`) | SET (`https://dtcdecoder.vercel.app` — update to `https://dtcdecoder.com` once DNS live) | SET |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Required | No | Allowed (public) | SET | SET | SET |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable/anon key — protected by RLS, not secrecy | Required | No | Allowed (public by design) | SET | SET | SET |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses RLS — server-only admin client (`src/lib/supabase/admin.ts`) | Required | **Yes** | Prohibited | SET | **MISSING** | **MISSING** |
| `ADMIN_ALLOWED_EMAILS` | Comma-separated allowlist for `/admin` access | Required (empty = nobody is admin) | No (not secret, but server-only) | Prohibited | SET | SET | SET |
| `SUPABASE_STORAGE_BUCKET_FILES` | Private bucket name for paid downloads | Optional (defaults `product-files`) | No | Prohibited (server-only usage) | SET | SET | SET |
| `SUPABASE_STORAGE_BUCKET_PREVIEWS` | Public bucket name for thumbnails | Optional (defaults `product-previews`) | No | Prohibited (server-only usage) | SET | SET | SET |
| `NEXT_PUBLIC_BILLING_ENABLED` | Feature flag gating the checkout route | Optional (defaults falsy → disabled) | No | Allowed (public) | SET (`false`) | SET (`false`) | SET (`false`) |
| `CREEM_API_BASE_URL` | Creem API base (sandbox vs. production) | Optional (defaults `https://api.creem.io/v1`) | No | Prohibited (server-only usage) | SET (sandbox) | SET (sandbox) | SET (sandbox) |
| `CREEM_API_KEY` | Creem API authentication header | Required for checkout | **Yes** | Prohibited | PLACEHOLDER | **MISSING** | **MISSING** |
| `CREEM_WEBHOOK_SECRET` | HMAC key verifying webhook signatures | Required for checkout | **Yes** | Prohibited | PLACEHOLDER | **MISSING** | **MISSING** |
| `CREEM_SUCCESS_URL` | Redirect target after Creem checkout | Required for checkout | No | Prohibited (server-only usage) | SET | SET | SET |
| `CREEM_GENERIC_PRODUCT_ID` | Shared one-time-payment product ID | Required for checkout | Borderline (an ID, not a credential) — treated as secret out of caution | Prohibited | PLACEHOLDER | **MISSING** | **MISSING** |

## Validation of the public/secret boundary

- Every `NEXT_PUBLIC_`-prefixed variable is read only in code paths that are safe to expose (browser Supabase client, redirect URLs, feature flag) — confirmed by reading `src/lib/supabase/client.ts`, `proxy.ts`, `src/lib/env.ts`.
- Every non-`NEXT_PUBLIC_` variable is read only from files marked `import "server-only"` (`src/lib/supabase/admin.ts`, `src/lib/storage.ts`, `src/lib/orders.ts`, `src/lib/admin-auth.ts`, `src/lib/payments/creem.ts`) or from Route Handlers / Server Actions, which never ship to the client bundle.
- Verified empirically: grepped the Next.js client build output for the literal `SUPABASE_SERVICE_ROLE_KEY` value — **0 matches**.

## Missing-variable failure behavior

- Missing `SUPABASE_SERVICE_ROLE_KEY` / `CREEM_*`: throws `Missing required env var: X` only when the function that needs it is actually called (lazy `required()` in `env.ts`) — public browsing pages (`/`, `/catalog`, category pages, `/products/[slug]`) never touch these and load fine. Checkout, downloads, and admin writes will fail loudly (500) until set — this is correct, not silent.
- Missing `NEXT_PUBLIC_BILLING_ENABLED`: defaults to disabled, checkout route returns a clean `503 {"error":"Checkout is not available yet"}` — verified via local `curl` test.
