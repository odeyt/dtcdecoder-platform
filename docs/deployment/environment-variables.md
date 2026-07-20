# Environment variables

Use `.env.local` locally and Vercel Project > Settings > Environment Variables for hosted values. Never commit real values.

| Variable | Purpose/source | Environments | Secret | Browser |
|---|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Canonical origin | localhost / preview / `https://dtcdecoder.com` | No | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API URL | Separate target per environment | No | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable/anon key | Separate target per environment | No | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role/secret key | Separate target per environment | Yes | Never |
| `ADMIN_ALLOWED_EMAILS` | Comma-separated admin allowlist | Every environment | Sensitive | Never |
| `SUPABASE_STORAGE_BUCKET_FILES` | Private files bucket | Usually `product-files` | No | No |
| `SUPABASE_STORAGE_BUCKET_PREVIEWS` | Public thumbnails bucket | Usually `product-previews` | No | No |
| `NEXT_PUBLIC_BILLING_ENABLED` | Checkout feature switch | `false` until validated | No | Yes |
| `PAYMENT_PROVIDER` | Provider marker | `creem` when used | No | No |
| `CREEM_API_BASE_URL` | Sandbox/live API origin | Sandbox dev/preview; live with approval | No | Never |
| `CREEM_API_KEY` | Creem API credential | Separate sandbox/live | Yes | Never |
| `CREEM_WEBHOOK_SECRET` | Webhook signing secret | Separate per environment | Yes | Never |
| `CREEM_SUCCESS_URL` | Completion URL | Environment-specific | No | Never |
| `CREEM_GENERIC_PRODUCT_ID` | Creem product ID | Separate sandbox/live | Sensitive | Never |

Public variables are frozen into browser bundles at build time. Creem secrets are evaluated only by billing/webhook paths; the storefront can serve with billing disabled.

