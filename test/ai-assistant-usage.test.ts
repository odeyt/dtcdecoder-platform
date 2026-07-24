import { describe, expect, it, vi } from "vitest";

// streamAssistantResponse's usage/entitlement enforcement itself now lives
// in the shared src/lib/ai-diagnostics/usage.ts module (see
// test/ai-diagnostics-usage.test.ts for its dedicated tests, and
// test/ai-diagnostics-redaction.test.ts for the preview system-prompt
// addendum content). This file covers the one piece of NEW behavior that
// lives in assistant.ts itself: that a free-tier ("preview") request is
// generated within a strictly smaller token budget and a constrained
// system prompt, never the full-cost/full-detail generation, matching this
// repo's precedent of mocking the Supabase admin client (not the AI
// provider boundary) for orchestration-level tests.

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
const { CHAT_PREVIEW_MAX_TOKENS, CHAT_FULL_MAX_TOKENS } = await import("@/lib/ai-diagnostics/redaction");

describe("streamAssistantResponse — access-level-scoped generation", () => {
  it("preview (free tier): uses the smaller token budget and appends the preview-constrained system prompt", async () => {
    capturedStreamArgs = null;
    await streamAssistantResponse("What causes P0420?", [], "preview");

    const args = capturedStreamArgs as Record<string, unknown> | null;
    expect(args).not.toBeNull();
    expect(args!.max_tokens).toBe(CHAT_PREVIEW_MAX_TOKENS);
    expect(String(args!.system)).toMatch(/FREE-TIER PREVIEW MODE/);
  });

  it("full (paid tier): uses the full token budget and does NOT include the preview constraint", async () => {
    capturedStreamArgs = null;
    await streamAssistantResponse("What causes P0420?", [], "full");

    const args = capturedStreamArgs as Record<string, unknown> | null;
    expect(args).not.toBeNull();
    expect(args!.max_tokens).toBe(CHAT_FULL_MAX_TOKENS);
    expect(String(args!.system)).not.toMatch(/FREE-TIER PREVIEW MODE/);
  });

  it("the preview budget is strictly smaller than the full budget", () => {
    expect(CHAT_PREVIEW_MAX_TOKENS).toBeLessThan(CHAT_FULL_MAX_TOKENS);
  });
});
