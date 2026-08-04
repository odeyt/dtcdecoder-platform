import type { TranslationProvider } from "@/lib/ai/translation-provider";

// Localizes a CANONICAL English dtc_codes row into a target locale. The
// canonical row is never modified; each locale gets a separate cache row
// (dtc_code_localizations). Only translatable prose is stored translated —
// drive_recommendation is deliberately excluded (stays English; see the
// migration's comment) and every structured/enum/proper-noun field (code,
// make, model, engine_code, severity, difficulty, related_makes, urls, ...)
// comes from the canonical row untouched.

export interface DtcFaqEntryTranslatable {
  q: string;
  a: string;
}

export interface DtcCodeTranslatable {
  title: string;
  metaDescription: string | null;
  meaning: string;
  symptoms: string[];
  causes: string[];
  diagnosticSteps: string[];
  commonMistakes: string | null;
  faq: DtcFaqEntryTranslatable[];
}

// Flatten every translatable string into a deterministic order, skipping
// absent optional fields entirely (not translating a placeholder for a null
// value). applyTranslatedStrings performs the exact same traversal to
// reassemble, so translate -> apply round-trips regardless of which
// optional fields were present.
export function extractTranslatableStrings(input: DtcCodeTranslatable): string[] {
  const out: string[] = [];
  out.push(input.title);
  if (input.metaDescription) out.push(input.metaDescription);
  out.push(input.meaning);
  out.push(...input.symptoms);
  out.push(...input.causes);
  out.push(...input.diagnosticSteps);
  if (input.commonMistakes) out.push(input.commonMistakes);
  for (const entry of input.faq) out.push(entry.q, entry.a);
  return out;
}

export function applyTranslatedStrings(
  input: DtcCodeTranslatable,
  translated: string[],
): DtcCodeTranslatable {
  const expected = extractTranslatableStrings(input).length;
  if (translated.length !== expected) {
    throw new Error(`translated-string count mismatch: expected ${expected}, got ${translated.length}`);
  }
  let i = 0;
  const next = () => translated[i++];
  const takeArray = (n: number) => Array.from({ length: n }, next);

  const title = next();
  const metaDescription = input.metaDescription ? next() : null;
  const meaning = next();
  const symptoms = takeArray(input.symptoms.length);
  const causes = takeArray(input.causes.length);
  const diagnosticSteps = takeArray(input.diagnosticSteps.length);
  const commonMistakes = input.commonMistakes ? next() : null;
  const faq = input.faq.map(() => ({ q: next(), a: next() }));

  return { title, metaDescription, meaning, symptoms, causes, diagnosticSteps, commonMistakes, faq };
}

export interface LocalizedDtcCode {
  localized: DtcCodeTranslatable;
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

// Orchestrates a DTC code translation through the shared TranslationProvider —
// identical shape to translateScanReport, reusing the same provider
// interface and token-preservation guard rather than a parallel one.
export async function translateDtcCode(params: {
  dtcCodeId: string;
  dtcCodeVersion: number;
  targetLocale: string;
  provider: TranslationProvider;
  canonical: DtcCodeTranslatable;
  glossaryVersion: string;
  promptVersion: string;
}): Promise<LocalizedDtcCode> {
  const strings = extractTranslatableStrings(params.canonical);
  const canonicalText = JSON.stringify(strings);

  const result = await params.provider.translateDiagnosticReport({
    canonicalReport: { id: params.dtcCodeId, version: params.dtcCodeVersion, text: canonicalText },
    targetLocale: params.targetLocale,
    sourceLocale: "en",
    glossaryVersion: params.glossaryVersion,
    promptVersion: params.promptVersion,
  });

  const englishFallback = (
    status: "fallback" | "failed",
    missingTokens: string[],
  ): LocalizedDtcCode => ({
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
  let localized: DtcCodeTranslatable;
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
