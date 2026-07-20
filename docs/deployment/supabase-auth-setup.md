# Supabase Authentication Setup

## Confirmed from code (not guessed)

- Magic-link request: [src/components/MagicLinkForm.tsx](../../src/components/MagicLinkForm.tsx) calls `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/account/auth/callback` } })`.
- Callback route: **`/account/auth/callback`** — [src/app/account/auth/callback/route.ts](../../src/app/account/auth/callback/route.ts). Exchanges the code for a session, links any guest orders matching that email, then redirects to `/account` (or `/account/login?error=auth` on failure).
- Protected route group: `src/app/account/(protected)/layout.tsx` — redirects to `/account/login` if unauthenticated. `/account/login` and `/account/auth/callback` are siblings outside the `(protected)` group, so they're never caught in that redirect.
- Admin gate: `src/app/admin/layout.tsx` — redirects unauthenticated users to `/account/login`, and non-admin authenticated users to `/`.
- Session refresh: `proxy.ts` (Next.js 16's renamed `middleware.ts`) refreshes the Supabase session cookie on every request except static assets.
- Logout: not found as a dedicated route/button in the current codebase — only sign-in exists. **Gap, not a security issue**: no way for a signed-in user to explicitly sign out from the UI yet. Worth adding if you want it, but out of scope for this deployment pass (existing session cookies expire naturally per Supabase's token TTL).

## Required Supabase dashboard configuration (owner action)

Navigate to: **Supabase → `dtcdecoder` project → Authentication → URL Configuration**.

**Site URL** (production, once DNS is live):
```
https://dtcdecoder.com
```

**Redirect URLs** — add all of these (Supabase matches by prefix/wildcard):
```
http://localhost:3000/**
https://dtcdecoder.vercel.app/**
https://dtcdecoder.com/**
https://www.dtcdecoder.com/**
```

The narrowest correct pattern would be listing `/account/auth/callback` specifically, but Supabase's redirect allow-list only supports prefix/wildcard matching, not path-exact entries combined with a wildcard elsewhere — so the `/**` per-origin pattern above is the standard, narrowest-available approach (still origin-scoped, not open to arbitrary external hosts).

## Status

**Not yet confirmed** — this requires you to open the Supabase dashboard yourself; I don't have a path to it. Once set, magic-link emails will correctly redirect back to whichever environment (local, preview, or `dtcdecoder.com`) the user started from.
