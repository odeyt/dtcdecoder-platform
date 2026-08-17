// Model-routing config — docs/PRICING_AND_AI_COST_AUDIT.md §6.4/§9.3: route
// each AI sub-task independently rather than calling the same (most
// expensive) model for everything just because one integration exists.
//
// This app has exactly two OpenAI model tiers wired in: OPENAI_PRIMARY_MODEL
// (the stronger reasoning model, for diagnosis/vision/diagnostic-engine
// reasoning) and OPENAI_TRANSLATION_MODEL (the economical tier, for
// lower-reasoning sub-tasks like translating already-generated text).
// Neither is hardcoded to a specific model id — both are required env
// config (see .env.example) so this file never embeds a guess at OpenAI's
// current model lineup.
import "server-only";
import { env } from "@/lib/env";

export class OpenAiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAiConfigurationError";
  }
}

// The full sub-task vocabulary from the spec's MODEL ROUTING section. Only
// the tasks marked "wired" below have an actual call site in this
// codebase today — the rest are named here so the routing config has a
// real place to grow into when/if those sub-tasks are ever built, not
// because they already run. Do NOT treat an entry's presence here as
// evidence the feature exists; check MODEL_ROUTES' comment for each.
export type AiTaskType =
  | "chatGeneration" // wired — src/lib/ai/assistant.ts streamAssistantResponse
  | "chatTranslation" // wired — src/lib/ai/assistant.ts translateDiagnosticText
  | "scanMainAnalysis" // wired — src/lib/scan-diagnostics/ai/openai-provider.ts
  | "scanImageExtraction" // wired — src/lib/scan-diagnostics/ai/vision-extraction.ts (photo/screenshot upload)
  | "scanReportTranslation" // reserved — src/lib/ai/translation-provider.ts references this route, but the class is never instantiated by any route/orchestrator (dormant, pre-existing)
  | "languageDetection" // reserved — no call site; language is client-selected today, never detected
  | "symptomNormalization" // reserved — no call site; symptoms are used as-entered
  | "dtcClassification" // reserved — DTC category classification (src/lib/scan-diagnostics/parsers/category-classification.ts) is deterministic pattern matching today, not an AI call
  | "independentSafetyReview" // reserved — safety review (src/lib/scan-diagnostics/safety-rules.ts) is a deterministic rules engine today, not a second AI call
  | "complexEscalation"; // reserved — no escalation path exists; every request uses the same route today

// Resolved once at module load (env vars are process-level/static per
// deployment, not per-request) — matches the pre-existing pattern this
// table already used for hardcoded literals. Exported unchanged as a
// Record<AiTaskType, string> (not a function map) since
// src/app/(app)/admin/profitability/page.tsx reads MODEL_ROUTES directly
// via Object.entries() expecting plain string values.
const OPENAI_STRONG_MODEL = env.openaiPrimaryModelOptional() ?? "";
const OPENAI_ECONOMICAL_MODEL = env.openaiTranslationModelOptional() ?? "";

export const MODEL_ROUTES: Record<AiTaskType, string> = {
  chatGeneration: OPENAI_STRONG_MODEL,
  chatTranslation: OPENAI_ECONOMICAL_MODEL,
  scanMainAnalysis: OPENAI_STRONG_MODEL,
  // Reading DTC codes/VIN characters accurately off a phone photo (and
  // correctly flagging what's unclear rather than guessing) needs the
  // stronger reasoning tier, not the economical one.
  scanImageExtraction: OPENAI_STRONG_MODEL,
  scanReportTranslation: OPENAI_ECONOMICAL_MODEL,
  // The four reserved tasks below route to the economical tier by default —
  // matches the spec's own guidance ("language detection: economical/
  // local", "symptom normalization: economical", "DTC classification:
  // economical structured-output", "independent safety review: separate
  // economical model") — but nothing calls modelForTask() with these keys
  // yet, so changing them has no live effect until a real call site exists.
  languageDetection: OPENAI_ECONOMICAL_MODEL,
  symptomNormalization: OPENAI_ECONOMICAL_MODEL,
  dtcClassification: OPENAI_ECONOMICAL_MODEL,
  independentSafetyReview: OPENAI_ECONOMICAL_MODEL,
  // Escalation is the one task that should route to something stronger, not
  // cheaper, when it's ever justified — reserved at the strong tier
  // (already the strongest tier integrated) rather than a hypothetical
  // premium-above-strong tier that doesn't exist in this app.
  complexEscalation: OPENAI_STRONG_MODEL,
};

export function modelForTask(task: AiTaskType): string {
  return MODEL_ROUTES[task];
}

// Every live call site should call this, not modelForTask() directly — an
// unconfigured tier must fail loudly and specifically at the point of use
// (the same "fail closed with a clear message" convention every other
// required env value in this app already follows), never silently send an
// empty-string model id to the OpenAI API.
export function requireModelForTask(task: AiTaskType): string {
  const model = modelForTask(task);
  if (!model) {
    const envVar = task === "chatGeneration" || task === "scanMainAnalysis" || task === "scanImageExtraction" || task === "complexEscalation"
      ? "OPENAI_PRIMARY_MODEL"
      : "OPENAI_TRANSLATION_MODEL";
    throw new OpenAiConfigurationError(`No OpenAI model configured for task "${task}" — set ${envVar}.`);
  }
  return model;
}
