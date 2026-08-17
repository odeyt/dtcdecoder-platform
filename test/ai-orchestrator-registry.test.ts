import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPrimaryProvider, getReviewerProvider, getMultimodalProvider } from "@/lib/scan-diagnostics/ai/registry";
import { OpenAiDiagnosticProvider } from "@/lib/scan-diagnostics/ai/openai-provider";
import { GeminiDiagnosticProvider } from "@/lib/scan-diagnostics/ai/gemini-provider";

const ENV_KEYS = ["OPENAI_PRIMARY_ENABLED", "GEMINI_PROVIDER_ENABLED"] as const;
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

// OpenAI is the sole AI provider today (Anthropic fully retired — see
// docs/MULTI_MODEL_ORCHESTRATOR.md history) — getPrimaryProvider() always
// returns OpenAiDiagnosticProvider regardless of OPENAI_PRIMARY_ENABLED,
// and getReviewerProvider() always returns null, since the only reviewer
// implementation this app ever had was Anthropic's.
describe("provider registry — OpenAI-only", () => {
  it("getPrimaryProvider always returns OpenAiDiagnosticProvider", () => {
    delete process.env.OPENAI_PRIMARY_ENABLED;
    expect(getPrimaryProvider()).toBeInstanceOf(OpenAiDiagnosticProvider);

    process.env.OPENAI_PRIMARY_ENABLED = "true";
    expect(getPrimaryProvider()).toBeInstanceOf(OpenAiDiagnosticProvider);
  });

  it("getReviewerProvider always returns null — no reviewer implementation exists", () => {
    expect(getReviewerProvider()).toBeNull();
  });

  it("getMultimodalProvider is null unless GEMINI_PROVIDER_ENABLED=true, and never throws for a missing key", () => {
    delete process.env.GEMINI_PROVIDER_ENABLED;
    expect(getMultimodalProvider()).toBeNull();

    process.env.GEMINI_PROVIDER_ENABLED = "true";
    expect(getMultimodalProvider()).toBeInstanceOf(GeminiDiagnosticProvider);
  });
});
