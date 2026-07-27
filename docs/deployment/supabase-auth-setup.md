# Supabase Authentication Setup

## Confirmed from code (not guessed)

- Magic-link request: [src/components/MagicLinkForm.tsx](../../src/components/MagicLinkForm.tsx) calls `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/account/auth/callback` } })`.
- Callback route: **`/account/auth/callback`** — [src/app/(app)/account/auth/callback/route.ts](../../src/app/(app)/account/auth/callback/route.ts). Exchanges the code for a session, links any guest orders matching that email, then redirects to `next` (if a safe same-origin path was supplied) or `/account` (or `/account/login?error=auth` on failure).
- **Password sign-in** (added 2026-07-27, by explicit owner instruction — overrides the original magic-link-only decision, see `CLAUDE.md`): [src/components/PasswordLoginForm.tsx](../../src/components/PasswordLoginForm.tsx) calls `supabase.auth.signInWithPassword({ email, password })`. Presented on `/account/login` as an opt-in alternative behind a toggle ([src/components/LoginForms.tsx](../../src/components/LoginForms.tsx)) — magic-link remains the default.
- **Forgot / reset password**: [src/components/ForgotPasswordForm.tsx](../../src/components/ForgotPasswordForm.tsx) (`/account/forgot-password`) calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: "<origin>/account/reset-password" })`. [src/components/ResetPasswordForm.tsx](../../src/components/ResetPasswordForm.tsx) (`/account/reset-password`) waits for the `PASSWORD_RECOVERY` auth event (or an already-present session) before allowing `supabase.auth.updateUser({ password })` — a visitor without a valid/unexpired reset link never gets a session and sees an explanatory message instead of a broken form.
- **Set/change password while signed in**: [src/components/ChangePasswordForm.tsx](../../src/components/ChangePasswordForm.tsx), rendered on the main `/account` page. Every account created before 2026-07-27 only has magic-link access — this is how those users establish a password for the first time. Calls `supabase.auth.updateUser({ password })` directly, authorized by the live session (no current-password re-entry).
- Protected route group: `src/app/(app)/account/(protected)/layout.tsx` — redirects to `/account/login` if unauthenticated. `/account/login`, `/account/auth/callback`, `/account/forgot-password`, and `/account/reset-password` are siblings outside the `(protected)` group, so they're never caught in that redirect.
- Admin gate: `src/app/admin/layout.tsx` — redirects unauthenticated users to `/account/login`, and non-admin authenticated users to `/`.
- Session refresh: `proxy.ts` (Next.js 16's renamed `middleware.ts`) refreshes the Supabase session cookie on every request except static assets.
- Logout: [src/components/SignOutButton.tsx](../../src/components/SignOutButton.tsx) (added 2026-07-27) — calls `supabase.auth.signOut()`, rendered in `SiteNav.tsx` next to the account email in both desktop and mobile nav.

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

`/account/reset-password` (the password-reset redirect target) is already covered by these same per-origin `/**` wildcards — no additional Redirect URL entry is needed for it.

Password sign-in itself uses the same **Email** auth provider magic-link already relies on (Supabase doesn't have a separate on/off toggle for "password" vs "OTP" within that provider) — if OTP sign-in already works today, password sign-in should work with no further dashboard change. Not independently confirmed with a live password sign-in test yet.

## Status

**Not yet confirmed** — this requires you to open the Supabase dashboard yourself; I don't have a path to it. Once set, magic-link emails will correctly redirect back to whichever environment (local, preview, or `dtcdecoder.com`) the user started from.
