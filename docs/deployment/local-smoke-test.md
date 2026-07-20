# Local Smoke Test

Run against `npm run dev` with real Supabase credentials (`.env.local`, project `dtcdecoder`), billing disabled, Creem secrets still placeholder.

| Route/action | Result |
|---|---|
| `/` | 200, correct title/content, no console errors |
| `/catalog` | 200, "No products published yet" (correct empty state — real DB query succeeded) |
| `/wiring-diagrams` | 200, correct empty state |
| `/software-tools` | 200, correct empty state |
| `/account/login` | 200, magic-link form renders |
| `/account` (unauthenticated) | Redirects to `/account/login` — protected route group working |
| `/admin` (unauthenticated) | Redirects to `/account/login` — admin gate working |
| `/robots.txt` | Correct — disallows `/account/`, `/admin/`, `/api/`, points at `/sitemap.xml` |
| `/sitemap.xml` | Correct — static routes present, product routes would append once published |
| Unknown route | Proper Next.js 404 page |
| `POST /api/checkout` (billing disabled) | `503 {"error":"Checkout is not available yet"}` — no crash |
| `GET /api/downloads/:id` (unauthenticated) | `401 {"error":"Not signed in"}` — no crash, no leak |
| Service-role key in client bundle | Grepped `.next/static` for the literal secret value — **0 matches** |
| Browser console | No errors on any of the above |

Not tested locally (require real email delivery / real Creem sandbox, deferred to preview/production stage once secrets are configured): magic-link email round-trip, `/account/auth/callback` with a real code, full checkout → webhook → download flow, `/products/[slug]` (no products exist yet to test against), admin product creation UI.

`/products/[slug]` and admin CRUD screens were reviewed by reading the code rather than clicking through, since there's no product to exercise them against yet — will be exercised for real once the Phase 18 test product is created.
