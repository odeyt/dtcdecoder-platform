# Rollback Plan

## Git rollback

```
git log --oneline
git revert <commit>       # preferred — never force-push, never rewrite history
```

`main` is protected by the standing rule against force-pushing or resetting history. If a bad commit reaches `origin/main`, revert forward with a new commit rather than rewriting.

## Vercel rollback

1. Vercel dashboard → `dtcdecoder` project → **Deployments**.
2. Find the last known-good deployment (check its commit SHA against `git log`).
3. Use **Instant Rollback** (visible on the Overview tab) or the `...` menu → **Promote to Production** on that deployment.
4. Alternatively, via CLI: `vercel rollback <deployment-url>`.

## Supabase rollback

- **Never** reverse a migration destructively (no `drop table`, no `db reset` against the real project).
- If a migration needs correcting, write a new, reviewed migration file that fixes forward (e.g. `0003_fix_x.sql`), and apply it the same way — SQL Editor or `supabase db push` once CLI auth is set up.
- Use Supabase's built-in Point-in-Time Recovery / daily backups (Settings → Add-ons, if enabled on the `d1group` org's plan) only if actual data needs restoring — this is a last resort, not a routine rollback path.

## DNS rollback

Before this audit changed anything, `dtcdecoder.com` at Namecheap was on the registrar's default nameservers (`dns1.registrar-servers.com` / `dns2.registrar-servers.com`) with whatever default parking records Namecheap sets — no custom records were recorded as pre-existing at audit time. If the new `A` records (`@` → `76.76.21.21`, `www` → `76.76.21.21`) need to be reverted, simply delete them in Namecheap's Advanced DNS panel; this restores Namecheap's default parking behavior. No MX or email-related records were touched or need restoring — none existed for this domain at audit time.

## Billing rollback

If `NEXT_PUBLIC_BILLING_ENABLED` is ever flipped to `true` and needs to be reverted quickly: set it back to `false` in Vercel (all environments) and redeploy — the checkout route immediately returns to its safe `503` state. No payment data is lost; orders already marked `paid` remain paid.

