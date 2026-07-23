// Adapter interface every AI diagnostic-reasoning provider implements.
// Only AnthropicDiagnosticProvider exists today (this repo has no OpenAI or
// Gemini integration anywhere) — this interface exists so a verifier/
// reviewer provider can be added later without reshaping the analyze
// route or the consensus engine, which is already written to operate over
// 1..N results.
import type { CanonicalDiagnosticInput, DiagnosticAiOutput } from "@/lib/scan-diagnostics/schemas";

export interface DiagnosticAIProviderResult {
  providerId: string;
  modelId: string;
  output: DiagnosticAiOutput;
  tokens: { input: number; output: number };
}

export interface DiagnosticAIProvider {
  readonly id: string;
  runDiagnosis(input: CanonicalDiagnosticInput): Promise<DiagnosticAIProviderResult>;
}
