import type { RankedHypothesis, PlannedTest } from "@/lib/diagnostic-engine/types";
import type { TranslationProvider } from "@/lib/ai/translation-provider";

// Localizes a CANONICAL English Diagnostic Engine turn (hypotheses + test
// plan) into a target locale — mirrors report-translation.ts's exact
// pattern for scan reports. English is the source of truth: hypotheses are
// never re-ranked or re-reasoned, only their natural-language prose is
// translated. rank/confidenceLevel/evidenceStrength/supportingEvidenceIds/
// difficulty/risk/costLevel/relatedHypothesisRanks are preserved untouched —
// none of them are prose, and difficulty/risk/costLevel were already
// DERIVED from the English step text (test-planner.ts's keyword match)
// before this ever runs, so translating first would silently break that
// derivation. DriveSafetyClassification.reasoning is deliberately NOT part
// of this translatable shape at all — same "stays English until a
// reviewed per-locale safety pack exists" rule already applied to scan
// reports' safety_warnings (see CONTENT_LOCALIZATION_ARCHITECTURE.md).

export interface DiagnosticTurnTranslatable {
  hypotheses: RankedHypothesis[];
  testPlan: PlannedTest[];
}

// Same deterministic flatten/reassemble contract as
// report-translation.ts's extractTranslatableStrings/applyTranslatedStrings.
export function extractTranslatableStrings(input: DiagnosticTurnTranslatable): string[] {
  const out: string[] = [];
  for (const h of input.hypotheses) {
    out.push(h.hypothesis, h.reasoning);
    out.push(...h.missingEvidence, ...h.requiredTests);
  }
  for (const t of input.testPlan) {
    out.push(t.step, t.purpose, t.expectedResult);
  }
  return out;
}

export function applyTranslatedStrings(
  input: DiagnosticTurnTranslatable,
  translated: string[],
): DiagnosticTurnTranslatable {
  const expected = extractTranslatableStrings(input).length;
  if (translated.length !== expected) {
    throw new Error(`translated-string count mismatch: expected ${expected}, got ${translated.length}`);
  }
  let i = 0;
  const next = () => translated[i++];
  const takeArray = (n: number) => Array.from({ length: n }, next);

  const hypotheses: RankedHypothesis[] = input.hypotheses.map((h) => ({
    ...h,
    hypothesis: next(),
    reasoning: next(),
    missingEvidence: takeArray(h.missingEvidence.length),
    requiredTests: takeArray(h.requiredTests.length),
  }));
  const testPlan: PlannedTest[] = input.testPlan.map((t) => ({
    ...t,
    step: next(),
    purpose: next(),
    expectedResult: next(),
  }));
  return { hypotheses, testPlan };
}

export interface LocalizedDiagnosticTurn {
  localized: DiagnosticTurnTranslatable;
  resolvedLocale: string;
  status: "completed" | "fallback" | "failed";
  fallbackUsed: boolean;
  provider: string;
  model: string;
  glossaryVersion: string;
  promptVersion: string;
  translatedAt: string;
  latencyMs: number;
  missingTokens: string[];
}

// Orchestrates one turn's translation through the shared TranslationProvider
// — identical shape to translateScanReport, reusing the same provider
// interface (translateDiagnosticReport takes an opaque {id, version, text}
// canonical payload, so it's already generic over what's actually inside).
export async function translateDiagnosticTurn(params: {
  turnCacheKey: string;
  turnVersion: number;
  targetLocale: string;
  provider: TranslationProvider;
  canonical: DiagnosticTurnTranslatable;
  glossaryVersion: string;
  promptVersion: string;
}): Promise<LocalizedDiagnosticTurn> {
  const strings = extractTranslatableStrings(params.canonical);
  const canonicalText = JSON.stringify(strings);

  const result = await params.provider.translateDiagnosticReport({
    canonicalReport: { id: params.turnCacheKey, version: params.turnVersion, text: canonicalText },
    targetLocale: params.targetLocale,
    sourceLocale: "en",
    glossaryVersion: params.glossaryVersion,
    promptVersion: params.promptVersion,
  });

  const englishFallback = (status: "fallback" | "failed", missingTokens: string[]): LocalizedDiagnosticTurn => ({
    localized: params.canonical,
    resolvedLocale: "en",
    status,
    fallbackUsed: true,
    provider: result.provider,
    model: result.model,
    glossaryVersion: params.glossaryVersion,
    promptVersion: params.promptVersion,
    translatedAt: result.translatedAt,
    latencyMs: result.latencyMs,
    missingTokens,
  });

  if (result.fallbackUsed || result.resolvedLocale === "en") {
    if (params.targetLocale === "en") {
      return {
        localized: params.canonical,
        resolvedLocale: "en",
        status: "completed",
        fallbackUsed: false,
        provider: result.provider,
        model: result.model,
        glossaryVersion: params.glossaryVersion,
        promptVersion: params.promptVersion,
        translatedAt: result.translatedAt,
        latencyMs: result.latencyMs,
        missingTokens: [],
      };
    }
    return englishFallback(result.status === "failed" ? "failed" : "fallback", result.missingTokens);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.text);
  } catch {
    return englishFallback("failed", []);
  }
  if (!Array.isArray(parsed) || parsed.some((s) => typeof s !== "string")) {
    return englishFallback("failed", []);
  }
  let localized: DiagnosticTurnTranslatable;
  try {
    localized = applyTranslatedStrings(params.canonical, parsed as string[]);
  } catch {
    return englishFallback("failed", []);
  }

  return {
    localized,
    resolvedLocale: params.targetLocale,
    status: "completed",
    fallbackUsed: false,
    provider: result.provider,
    model: result.model,
    glossaryVersion: params.glossaryVersion,
    promptVersion: params.promptVersion,
    translatedAt: result.translatedAt,
    latencyMs: result.latencyMs,
    missingTokens: [],
  };
}
