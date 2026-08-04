// Model-routing config — docs/PRICING_AND_AI_COST_AUDIT.md §6.4/§9.3: route
// each AI sub-task independently rather than calling the same (most
// expensive) model for everything just because one integration exists.
//
// This app has exactly two model tiers wired in: Claude Sonnet 5 (the
// stronger reasoning model, for the diagnosis itself) and Claude Haiku 4.5
// (the economical tier, for lower-reasoning sub-tasks like translating
// already-generated text). "claude-haiku-4-5" is the same undated-alias
// convention already used for "claude-sonnet-5" throughout this codebase.
import "server-only";

export const CLAUDE_SONNET_5 = "claude-sonnet-5";
export const CLAUDE_HAIKU_4_5 = "claude-haiku-4-5";

// The full sub-task vocabulary from the spec's MODEL ROUTING section. Only
// the tasks marked "wired" below have an actual call site in this
// codebase today — the rest are named here so the routing config has a
// real place to grow into when/if those sub-tasks are ever built, not
// because they already run. Do NOT treat an entry's presence here as
// evidence the feature exists; check MODEL_ROUTES' comment for each.
export type AiTaskType =
  | "chatGeneration" // wired — src/lib/ai/assistant.ts streamAssistantResponse
  | "chatTranslation" // wired — src/lib/ai/assistant.ts translateDiagnosticText
  | "scanMainAnalysis" // wired — src/lib/scan-diagnostics/ai/anthropic-provider.ts
  | "scanImageExtraction" // wired — src/lib/scan-diagnostics/ai/vision-extraction.ts (photo/screenshot upload)
  | "scanReportTranslation" // reserved — src/lib/ai/translation-provider.ts AnthropicTranslationProvider references this route, but the class is never instantiated by any route/orchestrator (dormant, pre-existing)
  | "languageDetection" // reserved — no call site; language is client-selected today, never detected
  | "symptomNormalization" // reserved — no call site; symptoms are used as-entered
  | "dtcClassification" // reserved — DTC category classification (src/lib/scan-diagnostics/parsers/category-classification.ts) is deterministic pattern matching today, not an AI call
  | "independentSafetyReview" // reserved — safety review (src/lib/scan-diagnostics/safety-rules.ts) is a deterministic rules engine today, not a second AI call
  | "complexEscalation"; // reserved — no escalation path exists; every request uses the same route today

export const MODEL_ROUTES: Record<AiTaskType, string> = {
  chatGeneration: CLAUDE_SONNET_5,
  chatTranslation: CLAUDE_HAIKU_4_5,
  scanMainAnalysis: CLAUDE_SONNET_5,
  // Reading DTC codes/VIN characters accurately off a phone photo (and
  // correctly flagging what's unclear rather than guessing) needs the
  // stronger reasoning tier, not the economical one.
  scanImageExtraction: CLAUDE_SONNET_5,
  scanReportTranslation: CLAUDE_HAIKU_4_5,
  // The four reserved tasks below route to the economical tier by default —
  // matches the spec's own guidance ("language detection: economical/
  // local", "symptom normalization: economical", "DTC classification:
  // economical structured-output", "independent safety review: separate
  // economical model") — but nothing calls modelForTask() with these keys
  // yet, so changing them has no live effect until a real call site exists.
  languageDetection: CLAUDE_HAIKU_4_5,
  symptomNormalization: CLAUDE_HAIKU_4_5,
  dtcClassification: CLAUDE_HAIKU_4_5,
  independentSafetyReview: CLAUDE_HAIKU_4_5,
  // Escalation is the one task that should route to something stronger, not
  // cheaper, when it's ever justified — reserved at Sonnet (already the
  // strongest tier integrated) rather than a hypothetical premium-above-
  // Sonnet tier that doesn't exist in this app.
  complexEscalation: CLAUDE_SONNET_5,
};

export function modelForTask(task: AiTaskType): string {
  return MODEL_ROUTES[task];
}
