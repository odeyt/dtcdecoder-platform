# DTC Decoder pre-deployment audit

Audited 2026-07-20 without recording secret values.

| Item | Result |
|---|---|
| Branch / commits | Renamed from `master` to `main`; baseline `425f444 Initial commit from Create Next App` |
| Working tree | Substantial pre-existing uncommitted application work; preserved |
| Remote | None configured |
| Package manager | npm (`package-lock.json`) |
| Runtime | Next.js 16.2.10 App Router; local Node 26.1.0 |
| Environment | `.env.example` only; no `.env.local` present |
| Supabase | `0001_init.sql`, `0002_storage_buckets.sql`; project not linked or migrated |
| Vercel/domain | No `.vercel` linkage or `vercel.json`; DNS/project unverified |
| Auth/admin | Magic link; callback `/account/auth/callback`; protected account; server-side admin allowlist and mutation checks |
| Billing | Checkout, order-status, download, and Creem webhook routes; billing disabled by default |
| Scripts | `dev`, `build`, `start`, `lint`; no test script |

Tracked-file scanning found no likely secret. ESLint, strict TypeScript, and the production build passed. Blockers: GitHub remote/authentication, confirmed Supabase project and migrations, Vercel linkage/environment values, preview QA, and exact Vercel DNS records.
