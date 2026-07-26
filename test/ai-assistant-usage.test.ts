import { describe, expect, it, vi } from "vitest";

// streamAssistantResponse's usage/entitlement enforcement lives in the
// shared src/lib/ai-diagnostics/usage.ts module (see
// test/ai-diagnostics-usage.test.ts) — the Free plan's AI diagnostic
// preview allowance is 0, so recordAiDiagnosticUsage always rejects a Free
// request before streamAssistantResponse is ever called (see
// src/app/api/ai/assistant/route.ts). There is no reduced-generation
// "preview" mode left to test here — this file just pins that every
// (necessarily paid) call generates at the one full token budget.

let capturedStreamArgs: Record<string, unknown> | null = null;

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class FakeAnthropic {
      messages = {
        stream: (args: Record<string, unknown>) => {
          capturedStreamArgs = args;
          return (async function* () {})();
        },
      };
    },
  };
});

vi.mock("@/lib/env", () => ({
  env: { anthropicApiKey: () => "fake-key" },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  }),
}));

const { streamAssistantResponse } = await import("@/lib/ai/assistant");
const { CHAT_FULL_MAX_TOKENS } = await import("@/lib/ai-diagnostics/redaction");

describe("streamAssistantResponse", () => {
  it("always generates at the full token budget, with no preview/reduced mode", async () => {
    capturedStreamArgs = null;
    await streamAssistantResponse("What causes P0420?", []);

    const args = capturedStreamArgs as Record<string, unknown> | null;
    expect(args).not.toBeNull();
    expect(args!.max_tokens).toBe(CHAT_FULL_MAX_TOKENS);
    expect(String(args!.system)).not.toMatch(/FREE-TIER PREVIEW MODE/);
  });
});
