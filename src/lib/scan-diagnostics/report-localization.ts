// Production wiring for the previously-dormant scan-report translation
// system (docs/DYNAMIC_REPORT_TRANSLATION.md) — instantiates
// resolveLocalizedReport with real Supabase/Anthropic-backed dependencies.
// Called from report-access.ts for a "full" access-level report whose case
// requested a non-English report_language (see migration 0026).
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { modelForTask } from "@/lib/ai-diagnostics/model-routing";
import { recordAiDiagnosticRun } from "@/lib/ai-diagnostics/usage";
import { computeActualCostMicros } from "@/lib/ai-diagnostics/cost";
import { DIAGNOSTIC_CREDIT_WEIGHTS } from "@/lib/pricing";
import { getAllowedOutputLocales, listGlossaryForLocale } from "@/lib/i18n/languages";
import { getLocaleInfo } from "@/lib/i18n/locale-codes";
import { AnthropicTranslationProvider, type ReportTranslateStep } from "@/lib/ai/translation-provider";
import { translateScanReport, type ScanReportTranslatable } from "@/lib/scan-diagnostics/report-translation";
import {
  resolveLocalizedReport,
  type LocalizedReportDeps,
  type ResolvedLocalizedReport,
} from "@/lib/scan-diagnostics/localized-report";
import type { SubscriptionPlan } from "@/lib/types";

// A single scan report is generated once per case (see scan_reports_case_id_idx,
// migration 0013) and never re-versioned in place, so a constant version is a
// correct cache-key component today; revisit if a "regenerate report" flow is
// ever built.
const CANONICAL_REPORT_VERSION = 1;
const SCAN_REPORT_TRANSLATION_PROMPT_VERSION = "2026-07-scan-translation-v1";
const SCAN_REPORT_TRANSLATION_MAX_TOKENS = 4096;

function buildJsonArrayTranslationSystemPrompt(
  outputLanguageName: string,
  outputLocale: string,
  glossary: Awaited<ReturnType<typeof listGlossaryForLocale>>,
): string {
  const glossaryBlock = glossary.length
    ? "\n\nApproved terminology for this language — use these exact renderings; anything marked verbatim must be copied unchanged, not translated:\n" +
      glossary
        .map((g) =>
          g.do_not_translate
            ? `- "${g.term_en}" → keep exactly as "${g.term_en}" (do not translate)`
            : `- "${g.term_en}" → "${g.translated_term}"`,
        )
        .join("\n")
    : "";

  return `You are a precise technical translator for automotive diagnostic content. You will receive a JSON array of English strings extracted from a structured diagnostic report. Translate EACH string into ${outputLanguageName} (locale: ${outputLocale}) and return ONLY a JSON array of the same length, in the same order — no other text, no markdown fences.

Non-negotiable rules:
- The output array MUST have exactly the same number of elements as the input array, in the same order.
- Preserve DTC codes (e.g. P0420), VINs, part numbers, connector/pin names, wire colors, CAN High/CAN Low/LIN/FlexRay/MOST, voltages, resistance/pressure/torque/temperature values and their units, module acronyms (PCM, ECU, ABS, etc.), calibration IDs, and TSB numbers exactly as written in the source — never translate or alter them.
- Do not add, remove, reinterpret, or reorder any diagnostic content. This is a translation task, not a new diagnosis.
- Write naturally in ${outputLanguageName}, not a stilted word-for-word rendering.${glossaryBlock}`;
}

// Real Anthropic call for the JSON-array translate step AnthropicTranslationProvider
// expects. Cost is logged (operationType "additional_language", matching the
// chat-translation pattern in src/app/api/ai/assistant/route.ts) but no separate
// usage slot is reserved — translating an already-generated, already-paid-for
// report is a cost-observability concern only, never a second report-count gate.
function buildScanReportTranslateStep(params: {
  userId: string;
  plan: SubscriptionPlan;
  reportId: string;
}): ReportTranslateStep {
  return async ({ englishText, targetLocale, glossaryVersion }) => {
    const client = new Anthropic({ apiKey: env.anthropicApiKey() });
    const localeInfo = getLocaleInfo(targetLocale);
    const glossary = await listGlossaryForLocale(targetLocale);
    const systemPrompt = buildJsonArrayTranslationSystemPrompt(
      localeInfo?.englishName ?? targetLocale,
      targetLocale,
      glossary,
    );
    const modelId = modelForTask("scanReportTranslation");
    const startedAt = Date.now();

    const message = await client.messages.create({
      model: modelId,
      max_tokens: SCAN_REPORT_TRANSLATION_MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: englishText }],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text : "";

    const cost = computeActualCostMicros({
      modelId,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    });
    await recordAiDiagnosticRun({
      userId: params.userId,
      requestId: params.reportId,
      feature: "scan_report",
      plan: params.plan,
      providerId: "anthropic",
      modelId,
      status: "completed",
      accessLevelRequested: "full",
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      reportId: params.reportId,
      operationType: "additional_language",
      creditsConsumed: DIAGNOSTIC_CREDIT_WEIGHTS.additionalLanguage,
      estimatedInputCostMicros: cost.inputCostMicros,
      estimatedOutputCostMicros: cost.outputCostMicros,
      estimatedTotalCostMicros: cost.totalCostMicros,
      latencyMs: Date.now() - startedAt,
    }).catch((err) => console.error("[scan-report-translation] failed to record cost run", err));

    void glossaryVersion; // part of the injected-step contract; version is computed by the caller below
    return text;
  };
}

function toTranslatable(row: {
  ranked_causes: unknown;
  recommended_tests: unknown;
  missing_information: string[];
}): ScanReportTranslatable {
  return {
    rankedCauses: row.ranked_causes as ScanReportTranslatable["rankedCauses"],
    recommendedTests: row.recommended_tests as ScanReportTranslatable["recommendedTests"],
    missingInformation: row.missing_information,
  };
}

function buildDeps(params: { userId: string; plan: SubscriptionPlan }): LocalizedReportDeps {
  const admin = createAdminClient();

  return {
    async isLocaleAllowed(locale) {
      const allowed = await getAllowedOutputLocales(params.plan);
      return allowed.some((l) => l.locale_code === locale);
    },

    async loadCache(reportId, locale) {
      const { data, error } = await admin
        .from("scan_report_localizations")
        .select("localized_payload, status")
        .eq("report_id", reportId)
        .eq("locale_code", locale)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { localized: data.localized_payload as ScanReportTranslatable, status: data.status };
    },

    async loadCanonical(reportId) {
      const { data, error } = await admin
        .from("scan_reports")
        .select("ranked_causes, recommended_tests, missing_information")
        .eq("id", reportId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { canonical: toTranslatable(data), version: CANONICAL_REPORT_VERSION };
    },

    async translate({ reportId, version, targetLocale, canonical }) {
      const glossary = await listGlossaryForLocale(targetLocale);
      const glossaryVersion = String(glossary.length);
      const provider = new AnthropicTranslationProvider(
        buildScanReportTranslateStep({ userId: params.userId, plan: params.plan, reportId }),
      );
      return translateScanReport({
        reportId,
        reportVersion: version,
        targetLocale,
        provider,
        canonical,
        glossaryVersion,
        promptVersion: SCAN_REPORT_TRANSLATION_PROMPT_VERSION,
      });
    },

    async persist(row) {
      const { error } = await admin.from("scan_report_localizations").upsert(
        {
          report_id: row.reportId,
          locale_code: row.localeCode,
          localized_payload: row.localized,
          requested_locale: row.localeCode,
          resolved_locale: row.meta.resolvedLocale,
          status: row.meta.status,
          fallback_used: row.meta.fallbackUsed,
          provider: row.meta.provider,
          model: row.meta.model,
          glossary_version: Number(row.meta.glossaryVersion) || null,
          prompt_version: row.meta.promptVersion,
          translated_at: row.meta.translatedAt,
          latency_ms: row.meta.latencyMs,
        },
        { onConflict: "report_id,locale_code" },
      );
      if (error) throw error;
    },

    // Translating an already-generated report never consumes the report-count
    // usage ledger (that slot was already committed when the report itself
    // was generated) — see the module doc comment above. Always "reserved".
    async reserveUsage() {
      return true;
    },
    async releaseUsage() {},
  };
}

// The single entry point report-access.ts calls. English requests short-
// circuit inside resolveLocalizedReport without touching the DB/provider at
// all (see localized-report.ts) — cheap and safe to call unconditionally.
export async function getOrCreateLocalizedReport(
  userId: string,
  plan: SubscriptionPlan,
  reportId: string,
  targetLocale: string,
): Promise<ResolvedLocalizedReport> {
  const deps = buildDeps({ userId, plan });
  return resolveLocalizedReport(deps, { reportId, targetLocale });
}
