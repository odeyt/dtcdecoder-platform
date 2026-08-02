// Ordinary (non-admin, Free-plan) authenticated user — Phase 8. Uses a
// fresh throwaway synthetic account per run (not a fixed E2E_FREE_USER_*
// pair), created via the Supabase Admin API and always deleted in a
// `finally` block. No provider call, no case, no usage row must ever be
// created for this account under DIAGNOSTIC_ENGINE_ROLLOUT_TIER=internal_only.
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { signInWithPassword, signOut } from "../helpers/auth";
import { postDiagnosticEngineTurn, createScanCase } from "../helpers/api";
import { syntheticEmail, syntheticRequestId } from "../helpers/synthetic-data";
import { createSyntheticUser, cleanupSyntheticUsers } from "../helpers/database-cleanup";

const hasSupabaseAdmin = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

test.describe("Ordinary authenticated (non-admin) user", () => {
  test.skip(!hasSupabaseAdmin, "Supabase admin credentials not configured — skipping (see docs/PLAYWRIGHT_AUTH_SETUP.md).");

  let userId: string | null = null;
  const email = syntheticEmail("ordinary");
  const password = `E2eOrd!${Math.random().toString(36).slice(2)}9`;

  test.beforeAll(async () => {
    userId = await createSyntheticUser(email, password);
  });

  test.afterAll(async () => {
    if (userId) await cleanupSyntheticUsers([userId]);
  });

  test("signs in, sees Free-plan account state, and public DTC lookup still works", async ({ page }) => {
    await signInWithPassword(page, email, password);
    await page.goto("/account");
    await expect(page.getByText("Free", { exact: true }).first()).toBeVisible();

    await page.goto("/dtc/P0420");
    await expect(page.getByText("P0420", { exact: false }).first()).toBeVisible();
  });

  test("direct Diagnostic Engine API call returns 404, creates no case/usage/run", async ({ page }) => {
    await signInWithPassword(page, email, password);

    // Playwright's bare `request` fixture is a separate APIRequestContext
    // with its own cookie jar — it never sees the session cookie
    // signInWithPassword just set on `page`. page.context().request shares
    // the same browser context (and its cookies), so these calls are
    // actually authenticated as the signed-in synthetic user.
    const request = page.context().request;
    const { status: caseStatus, caseId } = await createScanCase(request);
    expect(caseStatus).toBe(201);
    expect(caseId).toBeTruthy();

    const { status, body } = await postDiagnosticEngineTurn(request, caseId!, syntheticRequestId("ordinary-turn"));
    expect(status).toBe(404);
    expect(body).toMatchObject({ error: expect.any(String) });

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: runs } = await admin.from("diagnostic_engine_runs").select("id").eq("case_id", caseId!);
    expect(runs ?? []).toHaveLength(0);
    const { data: usage } = await admin.from("diagnostic_engine_usage").select("id").eq("user_id", userId!);
    expect(usage ?? []).toHaveLength(0);

    await signOut(page);
  });
});
