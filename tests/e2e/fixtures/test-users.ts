// Named test-account credentials, sourced from environment variables only —
// never hardcoded (Phase 5). Ordinary-user tests create a fresh throwaway
// account per run via database-cleanup.ts's createSyntheticUser() instead
// of using a fixed E2E_FREE_USER_* pair, since a free account has no
// meaningful state to reuse across runs. The internal/owner pair IS a
// fixed, already-provisioned account (its email must already be in
// Production's ADMIN_ALLOWED_EMAILS — this suite never adds or reads that
// list) and is only used when explicitly opted in.
export interface TestUserCredentials {
  email: string;
  password: string;
}

export function internalOwnerCredentials(): TestUserCredentials | null {
  const email = process.env.E2E_INTERNAL_USER_EMAIL;
  const password = process.env.E2E_INTERNAL_USER_PASSWORD;
  if (!email || !password) return null;
  return { email, password };
}

// Present for parity with docs/PLAYWRIGHT_AUTH_SETUP.md's documented env
// vars; unused today because ordinary-user tests provision a throwaway
// account instead (see comment above) — kept so a fixed non-admin account
// can be wired in later without touching test files, and so the
// documented variable name has one real reference point.
export function freeUserCredentialsFromEnv(): TestUserCredentials | null {
  const email = process.env.E2E_FREE_USER_EMAIL;
  const password = process.env.E2E_FREE_USER_PASSWORD;
  if (!email || !password) return null;
  return { email, password };
}
