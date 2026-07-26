import type { RankedCause, RecommendedTest } from "@/lib/scan-diagnostics/schemas";
import type { TranslationProvider } from "@/lib/ai/translation-provider";

// Localizes a CANONICAL English scan report (scan_reports) into a target
// locale. English is the source of truth: the report is never re-diagnosed —
// only its natural-language prose is translated. Structure, ordering, the
// confidenceLevel enum, and safety warnings are preserved. Safety warnings are
// deliberately NOT translated here (they stay English until a reviewed
// per-locale safety pack exists — see CONTENT_LOCALIZATION_ARCHITECTURE.md).

export interface ScanReportTranslatable {
  rankedCauses: RankedCause[];
  recommendedTests: RecommendedTest[];
  missingInformation: string[];
}

// Flatten every translatable string into a deterministic order. The exact same
// traversal is used to reassemble, so translate→apply round-trips.
export function extractTranslatableStrings(input: ScanReportTranslatable): string[] {
  const out: string[] = [];
  for (const c of input.rankedCauses) {
    out.push(c.cause, c.rationale);
    out.push(...c.supportingEvidence, ...c.contradictingEvidence, ...c.confirmationTestsRequired);
  }
  for (const t of input.recommendedTests) {
    out.push(t.step, t.purpose, t.expectedResult);
  }
  out.push(...input.missingInformation);
  return out;
}

// Rebuild the structure with translated prose, consuming `translated` in the
// same order extractTranslatableStrings produced. Throws on length mismatch —
// the caller treats that as a failed translation (English fallback).
export function applyTranslatedStrings(
  input: ScanReportTranslatable,
  translated: string[],
): ScanReportTranslatable {
  const expected = extractTranslatableStrings(input).length;
  if (translated.length !== expected) {
    throw new Error(`translated-string count mismatch: expected ${expected}, got ${translated.length}`);
  }
  let i = 0;
  const next = () => translated[i++];
  const takeArray = (n: number) => Array.from({ length: n }, next);

  const rankedCauses: RankedCause[] = input.rankedCauses.map((c) => ({
    ...c,
    cause: next(),
    rationale: next(),
    supportingEvidence: takeArray(c.supportingEvidence.length),
    contradictingEvidence: takeArray(c.contradictingEvidence.length),
    confirmationTestsRequired: takeArray(c.confirmationTestsRequired.length),
  }));
  const recommendedTests: RecommendedTest[] = input.recommendedTests.map((t) => ({
    ...t,
    step: next(),
    purpose: next(),
    expectedResult: next(),
  }));
  const missingInformation = takeArray(input.missingInformation.length);
  return { rankedCauses, recommendedTests, missingInformation };
}

export interface LocalizedScanReport {
  localized: ScanReportTranslatable;
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

// Orchestrates a scan-report translation through the shared TranslationProvider:
// the translatable strings are serialized to JSON, translated as a unit (so the
// provider's token-preservation guard sees all tokens), then reassembled.
// Any structural failure (bad JSON, length mismatch) is treated the same as a
// provider failure: fall back to the English canonical.
export async function translateScanReport(params: {
  reportId: string;
  reportVersion: number;
  targetLocale: string;
  provider: TranslationProvider;
  canonical: ScanReportTranslatable;
  glossaryVersion: string;
  promptVersion: string;
}): Promise<LocalizedScanReport> {
  const strings = extractTranslatableStrings(params.canonical);
  const canonicalText = JSON.stringify(strings);

  const result = await params.provider.translateDiagnosticReport({
    canonicalReport: { id: params.reportId, version: params.reportVersion, text: canonicalText },
    targetLocale: params.targetLocale,
    sourceLocale: "en",
    glossaryVersion: params.glossaryVersion,
    promptVersion: params.promptVersion,
  });

  const englishFallback = (
    status: "fallback" | "failed",
    missingTokens: string[],
  ): LocalizedScanReport => ({
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

  // Provider already fell back (token-drop / error / English request).
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

  // Parse + validate the structured translation; any structural failure → English.
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.text);
  } catch {
    return englishFallback("failed", []);
  }
  if (!Array.isArray(parsed) || parsed.some((s) => typeof s !== "string")) {
    return englishFallback("failed", []);
  }
  let localized: ScanReportTranslatable;
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
