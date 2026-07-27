// Adapter interface every AI diagnostic-reasoning provider implements.
// Only AnthropicDiagnosticProvider exists today (this repo has no OpenAI or
// Gemini integration anywhere) — this interface exists so a verifier/
// reviewer provider can be added later without reshaping the analyze
// route or the consensus engine, which is already written to operate over
// 1..N results.
import type { CanonicalDiagnosticInput, DiagnosticAiOutput } from "@/lib/scan-diagnostics/schemas";
import type { DiagnosticReview } from "@/lib/scan-diagnostics/ai/review-schema";

export interface DiagnosticAIProviderResult {
  providerId: string;
  modelId: string;
  promptVersion: string;
  output: DiagnosticAiOutput;
  tokens: { input: number; output: number };
}

export interface DiagnosticAIProvider {
  readonly id: string;
  runDiagnosis(input: CanonicalDiagnosticInput): Promise<DiagnosticAIProviderResult>;
  // Optional — the Phase 2 Diagnostic Engine's own turn call
  // (src/lib/diagnostic-engine/orchestrator.ts), given a single fully
  // rendered prompt string (see diagnostic-engine/prompt-builder.ts)
  // instead of a CanonicalDiagnosticInput. Optional so this interface
  // change is purely additive — a provider that doesn't support the
  // Diagnostic Engine yet (OpenAI/Gemini scaffolds) is not forced to
  // implement it, and nothing about Phase 1's scan-report flow changes.
  runDiagnosticEngineTurn?(prompt: string): Promise<DiagnosticAIProviderResult>;
}

// A distinct, additive interface (not a method added to DiagnosticAIProvider
// above) because a review's output shape (DiagnosticReview) is entirely
// different from a primary assessment's — a provider CAN implement both
// (AnthropicDiagnosticProvider does: primary today, reviewer when the
// orchestrator selects it as such) without either role's shape leaking
// into the other. Only Anthropic implements this today; OpenAI/Gemini do
// not review in this app (see registry.ts).
export interface DiagnosticReviewer {
  readonly id: string;
  review(
    primary: DiagnosticAIProviderResult,
    input: CanonicalDiagnosticInput,
  ): Promise<{ review: DiagnosticReview; tokens: { input: number; output: number } }>;
}
