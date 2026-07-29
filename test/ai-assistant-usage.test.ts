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

const { streamAssistantResponse, translateDiagnosticText, estimateChatInputTokens } = await import(
  "@/lib/ai/assistant"
);
const { CHAT_FULL_MAX_TOKENS } = await import("@/lib/ai-diagnostics/redaction");
const { CLAUDE_SONNET_5, CLAUDE_HAIKU_4_5 } = await import("@/lib/ai-diagnostics/model-routing");

describe("streamAssistantResponse", () => {
  it("always generates at the full token budget, with no preview/reduced mode", async () => {
    capturedStreamArgs = null;
    await streamAssistantResponse("What causes P0420?", []);

    const args = capturedStreamArgs as Record<string, unknown> | null;
    expect(args).not.toBeNull();
    expect(args!.max_tokens).toBe(CHAT_FULL_MAX_TOKENS);
    expect(String(args!.system)).not.toMatch(/FREE-TIER PREVIEW MODE/);
  });

  it("routes to the main-generation model (Sonnet), not the economical tier", async () => {
    capturedStreamArgs = null;
    await streamAssistantResponse("What causes P0420?", []);
    expect(capturedStreamArgs!.model).toBe(CLAUDE_SONNET_5);
  });
});

describe("translateDiagnosticText", () => {
  it("routes to the economical model tier (Haiku), not the main-generation model", async () => {
    capturedStreamArgs = null;
    await translateDiagnosticText("Likely a vacuum leak.", "es", "Spanish", []);
    expect(capturedStreamArgs!.model).toBe(CLAUDE_HAIKU_4_5);
    expect(capturedStreamArgs!.model).not.toBe(CLAUDE_SONNET_5);
  });
});

describe("estimateChatInputTokens", () => {
  it("grows with a longer user message", async () => {
    const short = await estimateChatInputTokens("P0420?", []);
    const long = await estimateChatInputTokens("P0420?".repeat(1000), []);
    expect(long).toBeGreaterThan(short);
  });

  it("grows with more grounding rows appended to the system prompt", async () => {
    const noGrounding = await estimateChatInputTokens("What causes P0420?", []);
    const withGrounding = await estimateChatInputTokens("What causes P0420?", [
      {
        id: "dtc-1",
        code: "P0420",
        make: null,
        model: null,
        engine_code: null,
        slug: "p0420",
        title: "Catalyst efficiency",
        meta_description: null,
        meaning: "Catalyst below threshold",
        symptoms: [],
        causes: ["Worn catalytic converter"],
        diagnostic_steps: ["Check oxygen sensors"],
        common_mistakes: null,
        difficulty: "moderate",
        severity: "moderate",
        drive_recommendation: null,
        related_makes: [],
        faq: [],
        pdf_url: null,
        youtube_url: null,
        search_count: 0,
        is_published: true,
        normalized_code: "P0420",
        family: "P",
        code_type: "generic",
        generic_definition: true,
        manufacturer_specific: false,
        reserved_code: false,
        source_type: "original",
        source_name: null,
        source_url: null,
        source_license: null,
        source_version: null,
        source_hash: null,
        review_status: "approved",
        reviewed_by: null,
        reviewed_at: null,
        active: true,
        created_at: new Date(0).toISOString(),
        updated_at: new Date(0).toISOString(),
      },
    ]);
    expect(withGrounding).toBeGreaterThan(noGrounding);
  });
});
