# Domain Activation — dtcdecoder.com

## Status: not yet live — DNS not pointed at Vercel

`dtcdecoder.com` and `www.dtcdecoder.com` are both added to the `dtcdecoder` Vercel project (`vercel domains add`), but Namecheap is still serving its own default nameservers (`dns1`/`dns2.registrar-servers.com`), not pointing at Vercel. This matches the "Bad Request" error you saw earlier when visiting the apex domain directly — DNS was already touching Vercel's edge in some partial way but the domain wasn't attached to any project yet, and still isn't fully configured.

## Pre-existing DNS (recorded before any change, for rollback)

Default Namecheap nameservers (`dns1.registrar-servers.com`, `dns2.registrar-servers.com`) with whatever default parking configuration Namecheap applies — no custom `A`/`CNAME`/`MX`/`TXT` records were identified as pre-existing for this domain at the time of this audit. No email (MX) records exist to preserve.

## Exact records to add (owner action — Namecheap dashboard)

**Namecheap → Domain List → `dtcdecoder.com` → Manage → Advanced DNS → Add New Record**, twice:

| Type | Host | Value | TTL |
|---|---|---|---|
| A Record | `@` | `76.76.21.21` | Automatic |
| A Record | `www` | `76.76.21.21` | Automatic |

These are the exact records Vercel's own `vercel domains inspect` returned — not guessed. Remove any conflicting default `@`/`www` records Namecheap's parking page may have added first.

## After adding the records

1. Propagation is typically minutes to a few hours (Namecheap default TTL).
2. Vercel auto-verifies and issues an SSL certificate once it sees the record — you'll get an email.
3. Come back and I'll re-run `vercel domains inspect dtcdecoder.com` to confirm, then verify the live site over HTTPS, confirm `www.dtcdecoder.com` redirects to the apex (`dtcdecoder.com` is the canonical URL per `NEXT_PUBLIC_SITE_URL`), and update `NEXT_PUBLIC_SITE_URL` + `CREEM_SUCCESS_URL` in Vercel Production to `https://dtcdecoder.com`.
4. After that, Supabase Auth URL Configuration needs the production redirect URLs added — see [supabase-auth-setup.md](supabase-auth-setup.md).

## Not done

No DNS records were changed by this audit — Namecheap access wasn't available in this session. No MX or other unrelated records were touched (none exist to touch).
