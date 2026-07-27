// Provider selection, entirely driven by server-only env flags — the ONLY
// place in the app that decides which vendor SDK backs "primary" or
// "reviewer." Nothing else should instantiate a provider class directly
// (the analyze route/orchestrator call these functions instead), so
// flipping a flag changes routing in exactly one place.
//
// Defaults (nothing configured): getPrimaryProvider() → Anthropic,
// getReviewerProvider() → null (the orchestrator itself is disabled by
// default — see diagnostic-orchestrator.ts — so this module's outputs are
// only ever consulted when AI_ORCHESTRATOR_ENABLED=true), getMultimodalProvider() → null.
import "server-only";
import { env } from "@/lib/env";
import { AnthropicDiagnosticProvider } from "@/lib/scan-diagnostics/ai/anthropic-provider";
import { OpenAiDiagnosticProvider } from "@/lib/scan-diagnostics/ai/openai-provider";
import { GeminiDiagnosticProvider } from "@/lib/scan-diagnostics/ai/gemini-provider";
import type { DiagnosticAIProvider, DiagnosticReviewer } from "@/lib/scan-diagnostics/ai/provider";

export function getPrimaryProvider(): DiagnosticAIProvider {
  return env.openaiPrimaryEnabled() ? new OpenAiDiagnosticProvider() : new AnthropicDiagnosticProvider();
}

export function getReviewerProvider(): DiagnosticReviewer | null {
  if (!env.anthropicReviewEnabled()) return null;
  // AI_REVIEW_PROVIDER is fixed at "anthropic" in this app (see
  // .env.example) — there is no second reviewer implementation, so this
  // isn't a second flag-driven branch, just the one reviewer this repo has.
  return new AnthropicDiagnosticProvider();
}

// Always null while GEMINI_PROVIDER_ENABLED is false (the only supported
// value today) — callers must treat a null return as "no multimodal
// verification available," never retry, never surface a missing-key error.
export function getMultimodalProvider(): DiagnosticAIProvider | null {
  return env.geminiProviderEnabled() ? new GeminiDiagnosticProvider() : null;
}
