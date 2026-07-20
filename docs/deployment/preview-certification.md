# Preview / Production Certification

This project's Vercel↔GitHub integration deploys `main` directly to Production (there is no separate long-lived preview environment for this repo beyond per-branch/PR previews, which was exercised earlier in this session for the `chore/env-example-cleanup` branch and passed). This certification was therefore run directly against `https://dtcdecoder.vercel.app` before DNS cutover to `dtcdecoder.com`.

## Incident found and fixed during this pass

The initial redeploy (triggered by pushing docs to `main`) came back with `GET / → 500` on every route. Runtime logs (`vercel logs`) showed:

```
TypeError: fetch failed
Caused by: Error: getaddrinfo ENOTFOUND sysbwmiguyxwzufwxwxpq.supabase.co
```

Root cause: the Supabase project ref I set in `NEXT_PUBLIC_SUPABASE_URL` on Vercel was mistranscribed from a dashboard screenshot (`...wxwxpq` instead of the correct `...wxwpq`) — an extra character. The owner's separately-populated local `.env.local` had the correct value (confirmed working in the local smoke test), which is how the discrepancy was caught. Corrected across all three Vercel environments and redeployed.

## Verified after the fix (live on `https://dtcdecoder.vercel.app`)

| Check | Result |
|---|---|
| `/` | 200, correct content, no console errors |
| `/catalog` | 200, correct empty state |
| `/wiring-diagrams` | 200, correct empty state |
| `/software-tools` | 200, correct empty state |
| `/account/login` | 200, magic-link form |
| `/robots.txt` | Correct, uses `https://dtcdecoder.vercel.app` as configured site URL |
| `/sitemap.xml` | Correct static routes |
| `POST /api/checkout` (billing disabled) | `503 {"error":"Checkout is not available yet"}` |
| `GET /api/downloads/:id` (unauthenticated) | `401 {"error":"Not signed in"}` |

Not yet re-verified on this specific deployment (already covered locally against the same real database in [local-smoke-test.md](local-smoke-test.md), no reason to expect divergence, but not re-clicked here): `/account` and `/admin` redirect behavior, 404 handling, mobile viewport.

## Verdict

**Passes.** No build failures, no runtime errors beyond the one incident (found and fixed within this same pass), no auth failures, no admin exposure, no RLS issue, no private-file exposure, no service-role leakage. Clear to proceed to domain cutover.
