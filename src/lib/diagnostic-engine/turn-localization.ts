// Production wiring for Diagnostic Engine turn translation — mirrors
// scan-diagnostics/report-localization.ts closely, reusing the exact same
// AnthropicTranslationProvider (fully generic over its canonical payload)
// and the same JSON-array translation prompt style.
import "server-only";
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { modelForTask } from "@/lib/ai-diagnostics/model-routing";
import { getAllowedOutputLocales, listGlossaryForLocale } from "@/lib/i18n/languages";
import { getLocaleInfo } from "@/lib/i18n/locale-codes";
import { AnthropicTranslationProvider, type ReportTranslateStep } from "@/lib/ai/translation-provider";
import { translateDiagnosticTurn, type DiagnosticTurnTranslatable } from "@/lib/diagnostic-engine/turn-translation";
import { resolveLocalizedTurn, type LocalizedTurnDeps, type ResolvedLocalizedTurn } from "@/lib/diagnostic-engine/localized-turn";
import type { SubscriptionPlan } from "@/lib/types";

const TURN_TRANSLATION_PROMPT_VERSION = "2026-08-diagnostic-engine-turn-v1";
const TURN_TRANSLATION_MAX_TOKENS = 4096;
const CANONICAL_TURN_VERSION = 1;

// A turn has no single persisted "report id" the way a scan report does —
// case memory is a live, evolving graph. The cache key is content-addressed:
// the same hypotheses/test-plan content (same evidence state) hits cache;
// content that actually changed produces a different key, never a stale
// translation silently served. Prefixed with caseId only for debuggability
// (the hash alone is what actually determines cache identity).
export function computeTurnCacheKey(caseId: string, canonical: DiagnosticTurnTranslatable): string {
  const hash = createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 16);
  return `${caseId}:${hash}`;
}

function buildJsonArrayTurnTranslationSystemPrompt(
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

  return `You are a precise technical translator for automotive diagnostic content. You will receive a JSON array of English strings extracted from a Guided Diagnosis turn (ranked hypotheses and a recommended test plan). Translate EACH string into ${outputLanguageName} (locale: ${outputLocale}) and return ONLY a JSON array of the same length, in the same order — no other text, no markdown fences.

Non-negotiable rules:
- The output array MUST have exactly the same number of elements as the input array, in the same order.
- Preserve DTC codes (e.g. P0420), VINs, part numbers, connector/pin names, wire colors, CAN High/CAN Low/LIN/FlexRay/MOST, voltages, resistance/pressure/torque/temperature values and their units, module acronyms (PCM, ECU, ABS, etc.), calibration IDs, and TSB numbers exactly as written in the source — never translate or alter them.
- Do not add, remove, reinterpret, re-rank, or reorder any diagnostic content. This is a translation task, not a new diagnosis.
- Write naturally in ${outputLanguageName}, not a stilted word-for-word rendering.${glossaryBlock}`;
}

// Deliberately does NOT call either ai-diagnostics/usage.ts's
// recordAiDiagnosticRun (its ai_diagnostic_runs/ai_diagnostic_usage tables
// have a hard `feature in ('chat','scan_report')` check constraint —
// migration 0016 — that a new "diagnostic_engine_turn" value would violate
// without its own migration) or diagnostic-engine/usage.ts's
// recordDiagnosticEngineUsage (that ledger tracks turnDailyLimit/
// turnMonthlyLimit consumption — see entitlements.ts — and this is a
// translation of an ALREADY-generated turn, not a new one; wiring into it
// without fully auditing its increment semantics risks double-counting a
// technician's turn quota, a real budget-guard concern this codebase takes
// seriously — docs/DIAGNOSTIC_ENGINE_SAFETY_NULL_AUDIT.md, budget-guard.ts).
// A lightweight console log gives basic observability without touching
// either safety-audited ledger; a real cost-ledger integration is a
// follow-up once the correct increment semantics are confirmed with
// whoever owns that budget guard.
function buildTurnTranslateStep(params: { userId: string; plan: SubscriptionPlan; caseId: string }): ReportTranslateStep {
  return async ({ englishText, targetLocale, glossaryVersion }) => {
    const client = new Anthropic({ apiKey: env.anthropicApiKey() });
    const localeInfo = getLocaleInfo(targetLocale);
    const glossary = await listGlossaryForLocale(targetLocale);
    const systemPrompt = buildJsonArrayTurnTranslationSystemPrompt(localeInfo?.englishName ?? targetLocale, targetLocale, glossary);
    const modelId = modelForTask("scanReportTranslation");
    const startedAt = Date.now();

    const message = await client.messages.create({
      model: modelId,
      max_tokens: TURN_TRANSLATION_MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: englishText }],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text : "";

    console.log(
      `[diagnostic-engine-turn-translation] case=${params.caseId} plan=${params.plan} locale=${targetLocale} ` +
        `model=${modelId} inputTokens=${message.usage.input_tokens} outputTokens=${message.usage.output_tokens} ` +
        `latencyMs=${Date.now() - startedAt}`,
    );

    void glossaryVersion;
    return text;
  };
}

function buildDeps(params: { userId: string; plan: SubscriptionPlan; caseId: string }): LocalizedTurnDeps {
  const admin = createAdminClient();

  return {
    async isLocaleAllowed(locale) {
      const allowed = await getAllowedOutputLocales(params.plan);
      return allowed.some((l) => l.locale_code === locale);
    },

    async loadCache(turnCacheKey, locale) {
      const { data, error } = await admin
        .from("diagnostic_engine_turn_localizations")
        .select("localized_payload, status")
        .eq("turn_cache_key", turnCacheKey)
        .eq("locale_code", locale)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { localized: data.localized_payload as DiagnosticTurnTranslatable, status: data.status };
    },

    async translate({ turnCacheKey, version, targetLocale, canonical }) {
      const glossary = await listGlossaryForLocale(targetLocale);
      const glossaryVersion = String(glossary.length);
      const provider = new AnthropicTranslationProvider(buildTurnTranslateStep(params));
      return translateDiagnosticTurn({
        turnCacheKey,
        turnVersion: version,
        targetLocale,
        provider,
        canonical,
        glossaryVersion,
        promptVersion: TURN_TRANSLATION_PROMPT_VERSION,
      });
    },

    async persist(row) {
      const { error } = await admin.from("diagnostic_engine_turn_localizations").upsert(
        {
          turn_cache_key: row.turnCacheKey,
          case_id: params.caseId,
          locale_code: row.localeCode,
          localized_payload: row.localized,
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
        { onConflict: "turn_cache_key,locale_code" },
      );
      if (error) throw error;
    },

    // Same rule as scan-report translation: translating an already-generated
    // turn never consumes the Diagnostic Engine's own per-turn usage ledger
    // — that slot was already spent generating the turn itself.
    async reserveUsage() {
      return true;
    },
    async releaseUsage() {},
  };
}

// The single entry point the turn API route calls after computing a turn's
// hypotheses/testPlan. English requests short-circuit inside
// resolveLocalizedTurn without touching the DB/provider — cheap and safe to
// call unconditionally.
export async function getOrCreateLocalizedTurn(
  userId: string,
  plan: SubscriptionPlan,
  caseId: string,
  canonical: DiagnosticTurnTranslatable,
  targetLocale: string,
): Promise<ResolvedLocalizedTurn> {
  const turnCacheKey = computeTurnCacheKey(caseId, canonical);
  const deps = buildDeps({ userId, plan, caseId });
  return resolveLocalizedTurn(deps, { turnCacheKey, version: CANONICAL_TURN_VERSION, targetLocale, canonical });
}
