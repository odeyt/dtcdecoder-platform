# Vercel Environment Variables

Full per-variable breakdown with purpose/secrecy: [environment-matrix.md](environment-matrix.md). This doc is the Vercel-specific status snapshot.

## Set (Production, Preview, Development — all three)

`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ADMIN_ALLOWED_EMAILS`, `SUPABASE_STORAGE_BUCKET_FILES`, `SUPABASE_STORAGE_BUCKET_PREVIEWS`, `NEXT_PUBLIC_BILLING_ENABLED` (`false`), `CREEM_API_BASE_URL` (sandbox), `CREEM_SUCCESS_URL`.

`NEXT_PUBLIC_SUPABASE_URL` was initially set to a mistranscribed project ref and caused a production 500 — found and corrected during this pass (see [preview-certification.md](preview-certification.md)).

## Missing — owner must add directly in the Vercel dashboard

Project Settings → Environment Variables → Add, checking Production/Preview/Development as appropriate:

- `SUPABASE_SERVICE_ROLE_KEY` — Supabase → Settings → API Keys → `service_role` secret
- `CREEM_API_KEY` — Creem dashboard → API keys (sandbox key first)
- `CREEM_WEBHOOK_SECRET` — Creem dashboard → Webhooks (create one pointing at `/api/webhooks/creem` first)
- `CREEM_GENERIC_PRODUCT_ID` — Creem dashboard → your one generic one-time-payment product

These were intentionally never passed through this session — true secrets shouldn't flow through an AI assistant's context when a direct dashboard path exists.

## Preview vs. Production values that will differ once the domain goes live

`NEXT_PUBLIC_SITE_URL` and `CREEM_SUCCESS_URL` currently point at `https://dtcdecoder.vercel.app`. Once `dtcdecoder.com` DNS is confirmed live, both should be updated to the `dtcdecoder.com` equivalents in **Production** only (leave Preview pointing at the `.vercel.app` URL, since preview deployments get their own ephemeral URLs anyway and don't need the apex domain).
