// Provider selection, entirely driven by server-only env flags — the ONLY
// place in the app that decides which vendor SDK backs "primary" or
// "reviewer." Nothing else should instantiate a provider class directly
// (the analyze route/orchestrator call these functions instead), so
// flipping a flag changes routing in exactly one place.
//
// OpenAI is the sole provider today — Anthropic was fully retired (see
// docs/MULTI_MODEL_ORCHESTRATOR.md history). getPrimaryProvider() always
// returns OpenAiDiagnosticProvider; getReviewerProvider() always returns
// null, since the only reviewer implementation this app ever had was
// Anthropic's — there is no OpenAI reviewer, and building one (an AI
// critiquing its own sibling model's output) is a real feature decision,
// not part of a provider swap. getMultimodalProvider() → null, unchanged.
import "server-only";
import { env } from "@/lib/env";
import { OpenAiDiagnosticProvider } from "@/lib/scan-diagnostics/ai/openai-provider";
import { GeminiDiagnosticProvider } from "@/lib/scan-diagnostics/ai/gemini-provider";
import type { DiagnosticAIProvider, DiagnosticReviewer } from "@/lib/scan-diagnostics/ai/provider";

export function getPrimaryProvider(): DiagnosticAIProvider {
  return new OpenAiDiagnosticProvider();
}

export function getReviewerProvider(): DiagnosticReviewer | null {
  return null;
}

// Always null while GEMINI_PROVIDER_ENABLED is false (the only supported
// value today) — callers must treat a null return as "no multimodal
// verification available," never retry, never surface a missing-key error.
export function getMultimodalProvider(): DiagnosticAIProvider | null {
  return env.geminiProviderEnabled() ? new GeminiDiagnosticProvider() : null;
}
