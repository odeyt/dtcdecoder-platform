// Shared `test` extension providing a real, signed-in `page` (Phase 10
// correction — found by actually running the mocked-provider tests, not
// by reading the source): DtcTechnicianShell gates its whole guided-mode
// UI behind a real client-side `supabase.auth.getUser()` check before
// GuidedDiagnosisPanel ever renders, and this project's Supabase client
// uses @supabase/ssr's cookie-based sessions — there is no localStorage
// token to fake, and cookies carry a server-signed JWT that can't be
// forged. Mocking the /turn and /cases network responses is not enough on
// its own; these UI tests need a genuinely authenticated (synthetic,
// throwaway) session underneath the mocks.
import { test as base, expect, type Page } from "@playwright/test";
import { signInWithPassword } from "../helpers/auth";
import { syntheticEmail } from "../helpers/synthetic-data";
import { createSyntheticUser, cleanupSyntheticUsers } from "../helpers/database-cleanup";

export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    const hasAdmin = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!hasAdmin) {
      base.skip(true, "Supabase admin credentials not configured — skipping (see docs/PLAYWRIGHT_AUTH_SETUP.md).");
      await use(page);
      return;
    }

    const email = syntheticEmail("mocked-ui");
    const password = `E2eUi!${Math.random().toString(36).slice(2)}9`;
    const userId = await createSyntheticUser(email, password);

    try {
      await signInWithPassword(page, email, password);
      await use(page);
    } finally {
      if (userId) await cleanupSyntheticUsers([userId]);
    }
  },
});

export { expect };
