// Manual storage-state bootstrap for the internal-owner suite
// (docs/PLAYWRIGHT_AUTH_SETUP.md). Not wired into the default project
// dependency chain — deterministic/mocked tests never need a real session,
// and running this automatically on every CI job would require internal
// owner credentials to exist everywhere. Run explicitly before the
// internal-owner suite:
//
//   npx playwright test tests/e2e/setup/auth.setup.ts --project=chromium
//
// Requires E2E_INTERNAL_USER_EMAIL / E2E_INTERNAL_USER_PASSWORD — an
// account whose email the owner has already added to Production's
// ADMIN_ALLOWED_EMAILS themselves. This script never reads or modifies
// that allowlist. Skips (does not fail) when the credentials aren't set,
// so it's safe to leave in a suite that also runs without them.
import { test as setup } from "@playwright/test";
import path from "path";
import { signInWithPassword } from "../helpers/auth";
import { internalOwnerCredentials } from "../fixtures/test-users";

// Plain __dirname, not import.meta.url — Playwright transpiles test files
// to CommonJS by default in this repo (no "type": "module" in
// package.json), where import.meta is unavailable.
export const INTERNAL_OWNER_STORAGE_STATE = path.join(__dirname, "../.auth/internal-owner.json");

setup("bootstrap internal-owner storage state", async ({ page }) => {
  const creds = internalOwnerCredentials();
  setup.skip(!creds, "E2E_INTERNAL_USER_EMAIL / E2E_INTERNAL_USER_PASSWORD not set — skipping auth bootstrap.");
  if (!creds) return;

  await signInWithPassword(page, creds.email, creds.password);
  await page.context().storageState({ path: INTERNAL_OWNER_STORAGE_STATE });
});
