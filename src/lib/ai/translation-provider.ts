import { verifyTokenPreservation } from "@/lib/ai/token-preservation";
import { modelForTask } from "@/lib/ai-diagnostics/model-routing";

// Every JSON-array translation prompt in this app instructs the model to
// return ONLY the array, no markdown fences — models don't reliably comply
// (confirmed live: Claude wrapped a DTC translation response in ```json
// fences despite the instruction, which broke every caller's JSON.parse).
// Strip a fence that wraps the ENTIRE response defensively rather than
// trust prompt compliance; only matches a fence spanning the whole trimmed
// string, so a legitimate ``` appearing inside translated prose content is
// never touched.
function stripMarkdownJsonFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  return match ? match[1].trim() : trimmed;
}

// Provider abstraction for translating a CANONICAL English diagnostic report
// into a target locale. This is the non-streaming, stored-report path (distinct
// from the streaming AI-assistant chat). English is the source of truth: the
// report is never re-diagnosed per language, only translated.
//
// The translate step is injected so the fallback/validation/metadata logic is
// unit-testable without a live provider key. The production wiring passes a
// function backed by the existing glossary-protected Anthropic translation.

export type SupportedLocale = string;

export interface CanonicalDiagnosticReport {
  id: string;
  /** Monotonic version of the canonical record; part of the cache key. */
  version: number;
  /** Canonical English report text (canonical_locale is always 'en'). */
  text: string;
}

export type ReportTranslationStatus = "completed" | "fallback" | "failed";

export interface LocalizedDiagnosticReport {
  reportId: string;
  sourceLocale: "en";
  requestedLocale: SupportedLocale;
  /** The locale actually served — equals requestedLocale on success, 'en' on fallback. */
  resolvedLocale: SupportedLocale;
  text: string;
  provider: string;
  model: string;
  glossaryVersion: string;
  promptVersion: string;
  status: ReportTranslationStatus;
  fallbackUsed: boolean;
  /** Protected tokens the translation dropped/altered (empty on success). */
  missingTokens: string[];
  translatedAt: string;
  latencyMs: number;
}

export interface TranslateReportInput {
  canonicalReport: CanonicalDiagnosticReport;
  targetLocale: SupportedLocale;
  sourceLocale: "en";
  glossaryVersion: string;
  promptVersion: string;
}

export interface TranslationProvider {
  readonly id: string;
  readonly model: string;
  translateDiagnosticReport(input: TranslateReportInput): Promise<LocalizedDiagnosticReport>;
}

// The injected translation step: translate fixed English into the target
// locale, returning the translated string. Throwing signals a provider failure
// (timeout, API error) — the provider converts that into an English fallback.
export type ReportTranslateStep = (input: {
  englishText: string;
  targetLocale: SupportedLocale;
  glossaryVersion: string;
}) => Promise<string>;

// NOTE: this class is not currently instantiated by any route or
// orchestrator — scan-report translation (docs/DYNAMIC_REPORT_TRANSLATION.md)
// is built here and unit-tested, but nothing wires it into the live
// case-detail flow yet. Routing its model is still correct/harmless to do
// now (see model-routing.ts "scanReportTranslation"), just not yet
// observable anywhere.
export class AnthropicTranslationProvider implements TranslationProvider {
  readonly id = "anthropic";
  readonly model = modelForTask("scanReportTranslation");

  constructor(
    private readonly translate: ReportTranslateStep,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  async translateDiagnosticReport(input: TranslateReportInput): Promise<LocalizedDiagnosticReport> {
    const startedAt = this.clock();
    const canonical = input.canonicalReport.text;

    const base = {
      reportId: input.canonicalReport.id,
      sourceLocale: "en" as const,
      requestedLocale: input.targetLocale,
      provider: this.id,
      model: this.model,
      glossaryVersion: input.glossaryVersion,
      promptVersion: input.promptVersion,
    };

    const englishResult = (
      status: ReportTranslationStatus,
      fallbackUsed: boolean,
      missingTokens: string[],
    ): LocalizedDiagnosticReport => ({
      ...base,
      resolvedLocale: "en",
      text: canonical,
      status,
      fallbackUsed,
      missingTokens,
      translatedAt: new Date(this.clock()).toISOString(),
      latencyMs: this.clock() - startedAt,
    });

    // English (or same-locale) request: serve the canonical directly — this is
    // the source, not a fallback.
    if (input.targetLocale === "en" || input.targetLocale === input.sourceLocale) {
      return englishResult("completed", false, []);
    }

    let translated: string;
    try {
      const raw = await this.translate({
        englishText: canonical,
        targetLocale: input.targetLocale,
        glossaryVersion: input.glossaryVersion,
      });
      translated = stripMarkdownJsonFence(raw);
    } catch {
      // Provider failure → English canonical, marked failed. Caller must NOT
      // consume paid translation quota for this outcome.
      return englishResult("failed", true, []);
    }

    // Reject a translation that dropped or altered any protected technical
    // token (DTC code, VIN, acronym, measurement…) — serve English instead.
    const check = verifyTokenPreservation(canonical, translated);
    if (!check.ok) {
      return englishResult("fallback", true, check.missing);
    }

    return {
      ...base,
      resolvedLocale: input.targetLocale,
      text: translated,
      status: "completed",
      fallbackUsed: false,
      missingTokens: [],
      translatedAt: new Date(this.clock()).toISOString(),
      latencyMs: this.clock() - startedAt,
    };
  }
}

// Deterministic cache key for a localized report. Any change to the canonical
// report, its version, the glossary, the prompt, the provider, or the model
// must produce a different key (spec caching rules).
export function localizedReportCacheKey(input: {
  canonicalReportId: string;
  reportVersion: number;
  targetLocale: SupportedLocale;
  glossaryVersion: string;
  promptVersion: string;
  provider: string;
  model: string;
}): string {
  return [
    input.canonicalReportId,
    `v${input.reportVersion}`,
    input.targetLocale,
    `g${input.glossaryVersion}`,
    `p${input.promptVersion}`,
    input.provider,
    input.model,
  ].join("|");
}
