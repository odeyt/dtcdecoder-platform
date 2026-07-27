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
