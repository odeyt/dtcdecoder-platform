// Gemini scaffold — interface/adapter location only, per the orchestrator
// spec's explicit instruction: "Do not make Gemini part of the default
// production path... keep disabled by default." No Gemini SDK is installed
// (deliberately — adding one now would be dead-weight attack surface for a
// provider this repo never calls yet, and the spec forbids inventing SDK
// methods without verifying them against an installed version). This class
// exists only so the registry (registry.ts) has a real DiagnosticAIProvider
// to type-check against; it is NEVER instantiated or invoked while
// GEMINI_PROVIDER_ENABLED is false (the only supported value today), and
// nothing here reads GEMINI_API_KEY, so a missing/absent key can never
// surface as an error on an ordinary (Gemini-disabled) diagnostic request.
//
// Future scope (see docs/MULTI_MODEL_ORCHESTRATOR.md "Gemini rollout
// stage"): scanner screenshots, wiring diagrams, oscilloscope captures,
// component photos, PDF visual interpretation, OCR correction,
// multilingual report interpretation, contradiction resolution, and
// small-sample quality-control audits — all multimodal/verification roles,
// never a replacement for the OpenAI/Anthropic text-reasoning primary or
// reviewer roles.
import "server-only";
import type { CanonicalDiagnosticInput } from "@/lib/scan-diagnostics/schemas";
import type { DiagnosticAIProvider, DiagnosticAIProviderResult } from "@/lib/scan-diagnostics/ai/provider";

export class GeminiNotEnabledError extends Error {
  constructor() {
    super("Gemini provider is disabled (GEMINI_PROVIDER_ENABLED is not true). This call should never happen.");
    this.name = "GeminiNotEnabledError";
  }
}

export class GeminiDiagnosticProvider implements DiagnosticAIProvider {
  readonly id = "gemini-multimodal";

  // Real text-only diagnosis is never Gemini's role in this app (see
  // registry.ts — Gemini is never selected as primary or reviewer); this
  // exists solely to satisfy the DiagnosticAIProvider interface. Throws
  // unconditionally rather than silently returning a stub result, so a
  // future registry bug that accidentally selected Gemini here would fail
  // loudly instead of returning fabricated diagnostic content.
  async runDiagnosis(_input: CanonicalDiagnosticInput): Promise<DiagnosticAIProviderResult> {
    throw new GeminiNotEnabledError();
  }

  // Documents the intended future entry point (Phase 21/rollout-stage-E)
  // without implementing it — no SDK call, no model id, no pricing
  // assumption. Wire this up only once the primary/reviewer pipeline is
  // stable in production and a real @google/genai (or successor) dependency
  // has been added and version-verified, per the "never invent SDK methods"
  // instruction.
  async verifyMultimodal(_input: { imagePaths: string[]; question: string }): Promise<never> {
    throw new GeminiNotEnabledError();
  }
}
