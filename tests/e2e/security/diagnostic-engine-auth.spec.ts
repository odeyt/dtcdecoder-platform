// Server-side authorization boundary for the Diagnostic Engine (Phase 7/8).
// Asserts against the real route responses directly — never against UI
// visibility (a disabled button proves nothing about the API).
import { test, expect } from "@playwright/test";
import { postDiagnosticEngineTurn } from "../helpers/api";
import { syntheticRequestId } from "../helpers/synthetic-data";

const NONEXISTENT_CASE_ID = "00000000-0000-0000-0000-000000000000";

test.describe("Diagnostic Engine API — anonymous access", () => {
  test("anonymous turn request is rejected with 401 and a generic message", async ({ request }) => {
    const { status, body } = await postDiagnosticEngineTurn(request, NONEXISTENT_CASE_ID, syntheticRequestId("anon"));
    expect(status).toBe(401);
    expect(body).toMatchObject({ error: expect.any(String) });
    // No internal configuration (budgets, model IDs, rollout tier) should
    // ever appear in an unauthenticated error response.
    const serialized = JSON.stringify(body).toLowerCase();
    expect(serialized).not.toMatch(/budget|claude-|rollout_tier|kill_switch/);
  });
});
