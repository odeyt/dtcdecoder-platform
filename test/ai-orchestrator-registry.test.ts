import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPrimaryProvider, getReviewerProvider, getMultimodalProvider } from "@/lib/scan-diagnostics/ai/registry";
import { AnthropicDiagnosticProvider } from "@/lib/scan-diagnostics/ai/anthropic-provider";
import { OpenAiDiagnosticProvider } from "@/lib/scan-diagnostics/ai/openai-provider";
import { GeminiDiagnosticProvider } from "@/lib/scan-diagnostics/ai/gemini-provider";

const ENV_KEYS = ["OPENAI_PRIMARY_ENABLED", "ANTHROPIC_REVIEW_ENABLED", "GEMINI_PROVIDER_ENABLED"] as const;
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

describe("provider registry — env-flag-driven selection only", () => {
  it("getPrimaryProvider defaults to Anthropic when OPENAI_PRIMARY_ENABLED is unset", () => {
    delete process.env.OPENAI_PRIMARY_ENABLED;
    expect(getPrimaryProvider()).toBeInstanceOf(AnthropicDiagnosticProvider);
  });

  it("getPrimaryProvider returns OpenAI only when OPENAI_PRIMARY_ENABLED=true", () => {
    process.env.OPENAI_PRIMARY_ENABLED = "true";
    expect(getPrimaryProvider()).toBeInstanceOf(OpenAiDiagnosticProvider);
  });

  it("getReviewerProvider defaults to Anthropic (opt-out, not opt-in)", () => {
    delete process.env.ANTHROPIC_REVIEW_ENABLED;
    expect(getReviewerProvider()).toBeInstanceOf(AnthropicDiagnosticProvider);
  });

  it("getReviewerProvider returns null when ANTHROPIC_REVIEW_ENABLED=false", () => {
    process.env.ANTHROPIC_REVIEW_ENABLED = "false";
    expect(getReviewerProvider()).toBeNull();
  });

  it("getMultimodalProvider is null unless GEMINI_PROVIDER_ENABLED=true, and never throws for a missing key", () => {
    delete process.env.GEMINI_PROVIDER_ENABLED;
    expect(getMultimodalProvider()).toBeNull();

    process.env.GEMINI_PROVIDER_ENABLED = "true";
    expect(getMultimodalProvider()).toBeInstanceOf(GeminiDiagnosticProvider);
  });
});
