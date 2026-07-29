# Playwright Authentication Setup

## Why password-only

This app supports magic-link and password sign-in. **Magic-link cannot be
automated in this environment**: Outlook/Microsoft 365 Safe Links
pre-scans and consumes the one-time verification token before a human or
script can use it — confirmed empirically during real production owner
testing this session (the link came back `error=auth` every time). Every
automated E2E account must have a **password already set**.

## Env vars

| Var | Used by | Notes |
|---|---|---|
| `E2E_BASE_URL` | all suites | Overrides the target's default base URL |
| `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_URL` | `auth/ordinary-user.spec.ts`, `setup/cleanup.setup.ts` | Needed to create/delete throwaway synthetic accounts via the Admin API |
| `E2E_INTERNAL_USER_EMAIL` / `E2E_INTERNAL_USER_PASSWORD` | `setup/auth.setup.ts`, internal-owner suite | Must be an account whose email is **already** in Production's `ADMIN_ALLOWED_EMAILS` — this suite never reads or writes that allowlist |
| `E2E_FREE_USER_EMAIL` / `E2E_FREE_USER_PASSWORD` | reserved, unused today | Ordinary-user tests provision a throwaway account per run instead; kept for a future fixed-account wiring |
| `RUN_PRODUCTION_INTERNAL_E2E` | gate | Must be exactly `"true"` or internal/provider suites skip |

**Never commit any of these.** Store them in CI secrets and a local
`.env.local`-style file outside Git (this repo's `.gitignore` already
excludes `.env*`).

## Ordinary (non-admin) user

No setup needed — `tests/e2e/auth/ordinary-user.spec.ts` creates a fresh
account via `createSyntheticUser()` in a `beforeAll`, signs in with a
generated password, and deletes it in `afterAll`. Requires
`SUPABASE_SERVICE_ROLE_KEY` in the environment.

## Internal owner — manual storage-state bootstrap

This is the "manual storage-state bootstrap" path referenced by Phase 5's
own instructions, since automating a first-time password login for the
*real* owner account isn't something this tooling should do without the
owner explicitly running it themselves.

1. Confirm `E2E_INTERNAL_USER_EMAIL` already has a password set on
   dtcdecoder.com and its email is already in Production's
   `ADMIN_ALLOWED_EMAILS`.
2. Set `E2E_INTERNAL_USER_EMAIL` / `E2E_INTERNAL_USER_PASSWORD` in your shell.
3. Run:
   ```bash
   npx playwright test tests/e2e/setup/auth.setup.ts --project=chromium
   ```
4. This writes `tests/e2e/.auth/internal-owner.json` (gitignored — never
   commit it, never attach it as a CI artifact).
5. Run the internal-owner / provider-reliability suites — they
   automatically pick up that file via `test.use({ storageState: ... })`.

Re-run step 3 whenever the session expires (Supabase sessions are
long-lived but not infinite).

## What this suite will never do

- Read, print, or replace `ADMIN_ALLOWED_EMAILS`.
- Print a cookie, token, or session value to any log or artifact.
- Attach `tests/e2e/.auth/*.json` as a CI artifact.
- Authenticate as admin via any client-supplied role/email/header — every
  eligibility check this suite tests against is the real, unmodified
  server-side `isDiagnosticEngineRolloutAllowed(email, isAdmin)` path.
