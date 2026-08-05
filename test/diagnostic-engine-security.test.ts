// Phase 2.1 Step 3 — automated cross-user / unauthenticated access tests
// against the actual /api/diagnostic-engine/v1/* route handlers (not just
// the underlying library functions), matching the pattern already
// established in test/diagnostics-create-from-intake.test.ts. Since this
// codebase's real security boundary for writes is application-layer
// ownership checks (not Postgres RLS — see docs/PHASE_2_1_RLS_SECURITY.md),
// these tests exercise exactly that boundary: an unauthenticated caller and
// a caller who doesn't own the case in question must both be rejected
// before any Diagnostic Engine module runs.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

let currentUser: { id: string; email: string } | null = { id: "user-1", email: "tech@example.com" };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
  }),
}));

// toSafeErrorResponse resolves the caller's locale (Supabase auth + the
// interface-locale cookie) before picking a translated error message —
// next/headers's cookies() throws outside a real request scope, so it needs
// a mock here same as every other route test that can hit an error path.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

// Real-route-level regression coverage for docs/DIAGNOSTIC_ENGINE_SAFETY_NULL_AUDIT.md
// — a fake provider standing in for AnthropicDiagnosticProvider, since the
// route instantiates it directly rather than accepting it as a parameter.
vi.mock("@/lib/scan-diagnostics/ai/anthropic-provider", () => ({
  AnthropicDiagnosticProvider: class {
    id = "fake-anthropic";
    async runDiagnosis(): Promise<never> {
      throw new Error("not used in these tests");
    }
    async runDiagnosticEngineTurn() {
      return {
        providerId: "fake-anthropic",
        modelId: "fake-model",
        promptVersion: "test-v1",
        output: {
          summary: "test summary",
          rankedCauses: [],
          recommendedTests: [],
          safetyWarnings: [],
          missingInformation: [],
        },
        tokens: { input: 100, output: 100 },
      };
    }
  },
  SCAN_REPORT_MODEL_ID: "fake-model",
  SCAN_REPORT_MAX_TOKENS: 4096,
}));

const { POST: turnPOST } = await import("@/app/api/diagnostic-engine/v1/cases/[caseId]/turn/route");
const { POST: answersPOST } = await import("@/app/api/diagnostic-engine/v1/cases/[caseId]/answers/route");
const {
  GET: repairGET,
  POST: repairPOST,
  PATCH: repairPATCH,
} = await import("@/app/api/diagnostic-engine/v1/cases/[caseId]/repair-verification/route");
const { recordQuestion } = await import("@/lib/diagnostic-engine/question");
const { QUESTION_BANK } = await import("@/lib/diagnostic-engine/question");

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

function makeRequest(body?: unknown) {
  return { json: async () => body ?? {} } as unknown as Parameters<typeof answersPOST>[0];
}

function paramsFor(caseId: string) {
  return { params: Promise.resolve({ caseId }) };
}

const FLAG_NAMES = ["PROBABILITY_ENGINE_ENABLED", "QUESTION_ENGINE_ENABLED", "REPAIR_VERIFICATION_ENABLED"];
function setFlags(on: string[]) {
  for (const name of FLAG_NAMES) {
    if (on.includes(name)) process.env[name] = "true";
    else delete process.env[name];
  }
}

// /turn is additionally gated by the rollout tier (default "disabled" —
// see feature-flags.ts). Tests that want to exercise ownership/auth
// specifically must first get PAST that gate, so it's set independently
// from the per-module flags above.
function setRolloutTier(tier: string | null) {
  if (tier) process.env.DIAGNOSTIC_ENGINE_ROLLOUT_TIER = tier;
  else delete process.env.DIAGNOSTIC_ENGINE_ROLLOUT_TIER;
}

function seedCase(caseId: string, ownerId: string) {
  fake().seed("scan_cases", [{ id: caseId, user_id: ownerId, status: "completed", complaint: "x", symptoms: [] }]);
}

let usageIdCounter = 0;

beforeEach(() => {
  fake().reset();
  currentUser = { id: "user-1", email: "tech@example.com" };
  setFlags([]);
  setRolloutTier(null);
  usageIdCounter = 0;
  fake().setRpcHandler("record_diagnostic_engine_usage", (args) => {
    usageIdCounter += 1;
    fake().seed("diagnostic_engine_usage", [
      {
        id: `usage-${usageIdCounter}`,
        user_id: args.p_user_id,
        request_id: args.p_request_id,
        feature: args.p_feature,
        plan: args.p_plan,
        access_level: args.p_access_level,
        created_at: new Date().toISOString(),
      },
    ]);
    return "recorded";
  });
});

afterEach(() => {
  setFlags([]);
  setRolloutTier(null);
});

describe("POST /turn — authentication and ownership", () => {
  it("rejects an unauthenticated caller with 401 before touching the engine", async () => {
    setFlags(["PROBABILITY_ENGINE_ENABLED"]);
    setRolloutTier("all_paid_users");
    seedCase("case-1", "user-1");
    currentUser = null;

    const res = await turnPOST(makeRequest({ requestId: "req-1" }), paramsFor("case-1"));
    expect(res.status).toBe(401);
    expect(fake().dump("diagnostic_evidence")).toHaveLength(0);
  });

  it("404s a case owned by a different user, never touching that case's data", async () => {
    setFlags(["PROBABILITY_ENGINE_ENABLED"]);
    setRolloutTier("all_paid_users");
    seedCase("case-1", "someone-else");
    currentUser = { id: "user-1", email: "attacker@example.com" };

    const res = await turnPOST(makeRequest({ requestId: "req-1" }), paramsFor("case-1"));
    expect(res.status).toBe(404);
    expect(fake().dump("diagnostic_evidence")).toHaveLength(0);
  });

  it("404s (feature disabled) when PROBABILITY_ENGINE_ENABLED is off, regardless of ownership", async () => {
    setRolloutTier("all_paid_users");
    seedCase("case-1", "user-1");
    const res = await turnPOST(makeRequest({ requestId: "req-1" }), paramsFor("case-1"));
    expect(res.status).toBe(404);
  });

  it("404s the rightful owner too when the rollout tier is left at its default (disabled)", async () => {
    setFlags(["PROBABILITY_ENGINE_ENABLED"]);
    seedCase("case-1", "user-1");
    // No setRolloutTier call — must default to "disabled".
    const res = await turnPOST(makeRequest({ requestId: "req-1" }), paramsFor("case-1"));
    expect(res.status).toBe(404);
  });

  it("404s a non-allowlisted caller when the rollout tier is internal_only", async () => {
    setFlags(["PROBABILITY_ENGINE_ENABLED"]);
    setRolloutTier("internal_only");
    seedCase("case-1", "user-1");
    currentUser = { id: "user-1", email: "not-an-admin@example.com" };

    const res = await turnPOST(makeRequest({ requestId: "req-1" }), paramsFor("case-1"));
    expect(res.status).toBe(404);
  });

  // docs/DIAGNOSTIC_ENGINE_SAFETY_NULL_AUDIT.md — proves the fix through the
  // REAL HTTP route handler, not just the orchestrator function directly.
  it("a successful turn through the real route never returns safety: null in its JSON body", async () => {
    setFlags(["PROBABILITY_ENGINE_ENABLED"]);
    setRolloutTier("all_paid_users");
    seedCase("case-1", "user-1");

    const res = await turnPOST(makeRequest({ requestId: "req-1" }), paramsFor("case-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.safety).not.toBeNull();
    expect(typeof body.safety.status).toBe("string");
  });
});

describe("POST /answers — authentication and ownership", () => {
  it("rejects an unauthenticated caller with 401", async () => {
    setFlags(["QUESTION_ENGINE_ENABLED"]);
    seedCase("case-1", "user-1");
    currentUser = null;

    const res = await answersPOST(
      makeRequest({ questionId: "00000000-0000-0000-0000-000000000000", fieldKey: "complaint", answerText: "x" }),
      paramsFor("case-1"),
    );
    expect(res.status).toBe(401);
  });

  it("404s an answer submitted against a case owned by a different user", async () => {
    setFlags(["QUESTION_ENGINE_ENABLED"]);
    seedCase("case-1", "someone-else");
    currentUser = { id: "user-1", email: "attacker@example.com" };

    const res = await answersPOST(
      makeRequest({ questionId: "00000000-0000-0000-0000-000000000000", fieldKey: "complaint", answerText: "x" }),
      paramsFor("case-1"),
    );
    expect(res.status).toBe(404);
    expect(fake().dump("diagnostic_answers")).toHaveLength(0);
  });

  it("rejects an answer whose questionId belongs to a case the caller does own a DIFFERENT case in, via the real route", async () => {
    setFlags(["QUESTION_ENGINE_ENABLED"]);
    seedCase("case-mine", "user-1");
    seedCase("case-other", "user-2");
    const otherQuestion = await recordQuestion("case-other", QUESTION_BANK[0]);

    const res = await answersPOST(
      makeRequest({ questionId: otherQuestion.id, fieldKey: otherQuestion.fieldKey, answerText: "x" }),
      paramsFor("case-mine"),
    );
    expect(res.status).toBe(404);
    expect(fake().dump("diagnostic_answers")).toHaveLength(0);
  });
});

describe("GET/POST/PATCH /repair-verification — authentication and ownership", () => {
  it("rejects unauthenticated callers on all three methods", async () => {
    setFlags(["REPAIR_VERIFICATION_ENABLED"]);
    seedCase("case-1", "user-1");
    currentUser = null;

    expect((await repairGET(makeRequest(), paramsFor("case-1"))).status).toBe(401);
    expect((await repairPOST(makeRequest(), paramsFor("case-1"))).status).toBe(401);
    expect((await repairPATCH(makeRequest({ item: "x", completed: true }), paramsFor("case-1"))).status).toBe(401);
  });

  it("404s all three methods for a case owned by a different user", async () => {
    setFlags(["REPAIR_VERIFICATION_ENABLED"]);
    seedCase("case-1", "someone-else");
    currentUser = { id: "user-1", email: "attacker@example.com" };

    expect((await repairGET(makeRequest(), paramsFor("case-1"))).status).toBe(404);
    expect((await repairPOST(makeRequest(), paramsFor("case-1"))).status).toBe(404);
    expect((await repairPATCH(makeRequest({ item: "x", completed: true }), paramsFor("case-1"))).status).toBe(404);
    expect(fake().dump("repair_verifications")).toHaveLength(0);
  });
});
