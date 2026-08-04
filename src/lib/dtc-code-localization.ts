// Production wiring for DTC code page translation — instantiates
// resolveLocalizedDtcCode with real Supabase/Anthropic-backed dependencies.
// Called from the two DTC page components for a published code whose
// requested locale isn't English (see migration 0049).
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { modelForTask } from "@/lib/ai-diagnostics/model-routing";
import { isAiOutputEnabledLocale, listGlossaryForLocale } from "@/lib/i18n/languages";
import { getLocaleInfo } from "@/lib/i18n/locale-codes";
import { AnthropicTranslationProvider, type ReportTranslateStep } from "@/lib/ai/translation-provider";
import { translateDtcCode, type DtcCodeTranslatable } from "@/lib/dtc-translation";
import {
  resolveLocalizedDtcCode,
  type LocalizedDtcCodeDeps,
  type ResolvedLocalizedDtcCode,
} from "@/lib/localized-dtc-code";
import type { DtcCode } from "@/lib/types";

// A dtc_codes row is admin-edited, not regenerated per request — a constant
// version is correct today; revisit if in-place content edits ever need to
// invalidate an existing cached translation (they currently don't).
const CANONICAL_DTC_VERSION = 1;
const DTC_TRANSLATION_PROMPT_VERSION = "2026-08-dtc-translation-v1";
const DTC_TRANSLATION_MAX_TOKENS = 4096;

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

  return `You are a precise technical translator for automotive diagnostic trouble code (DTC) reference content. You will receive a JSON array of English strings extracted from a curated DTC reference page (title, description, symptoms, causes, diagnostic steps, FAQ). Translate EACH string into ${outputLanguageName} (locale: ${outputLocale}) and return ONLY a JSON array of the same length, in the same order — no other text, no markdown fences.

Non-negotiable rules:
- The output array MUST have exactly the same number of elements as the input array, in the same order.
- Preserve DTC codes (e.g. P0420), part numbers, connector/pin names, wire colors, CAN High/CAN Low/LIN/FlexRay/MOST, voltages, resistance/pressure/torque/temperature values and their units, module acronyms (PCM, ECU, ABS, etc.), calibration IDs, and TSB numbers exactly as written in the source — never translate or alter them.
- If any of those preserved terms (a DTC code, an acronym like ECU or PCM, a measurement, a VIN) appears more than once across the input strings, it must appear the SAME number of times in your output, written exactly the same way every time. Do not replace a repeated term with a pronoun or referential phrase ("this code", "it", "the module") even where that would read more naturally — repeat the literal term instead.
- Do not add, remove, reinterpret, or reorder any content. This is a translation task, not new reference content.
- Write naturally in ${outputLanguageName}, not a stilted word-for-word rendering.${glossaryBlock}`;
}

function buildDtcTranslateStep(): ReportTranslateStep {
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
      max_tokens: DTC_TRANSLATION_MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: englishText }],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text : "";

    // Cost observability only — not recordAiDiagnosticRun (its `feature`
    // column has a hard DB check-constraint of 'chat'/'scan_report' only,
    // migration 0016), and correctly so: this content is free/public, never
    // billed against a user's plan, so it has no natural usage-ledger home.
    // Same deliberate gap as the Diagnostic Engine turn-translation feature
    // (see docs/AI_LANGUAGE_LOCALIZATION.md).
    console.log("[dtc-translation]", {
      targetLocale,
      model: modelId,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      latencyMs: Date.now() - startedAt,
      // Enough to diagnose a JSON.parse failure (markdown fences, a
      // conversational preamble, truncation) without dumping full
      // potentially-large translated prose into logs.
      textHead: text.slice(0, 120),
      textTail: text.slice(-120),
      textLength: text.length,
    });

    void glossaryVersion;
    return text;
  };
}

function toTranslatable(dtc: {
  title: string;
  meta_description: string | null;
  meaning: string;
  symptoms: string[];
  causes: string[];
  diagnostic_steps: string[];
  common_mistakes: string | null;
  faq: { q: string; a: string }[];
}): DtcCodeTranslatable {
  return {
    title: dtc.title,
    metaDescription: dtc.meta_description,
    meaning: dtc.meaning,
    symptoms: dtc.symptoms,
    causes: dtc.causes,
    diagnosticSteps: dtc.diagnostic_steps,
    commonMistakes: dtc.common_mistakes,
    faq: dtc.faq,
  };
}

function buildDeps(): LocalizedDtcCodeDeps {
  const admin = createAdminClient();

  return {
    async isLocaleAllowed(locale) {
      return isAiOutputEnabledLocale(locale);
    },

    async loadCache(dtcCodeId, locale) {
      const { data, error } = await admin
        .from("dtc_code_localizations")
        .select("localized_payload, status")
        .eq("dtc_code_id", dtcCodeId)
        .eq("locale_code", locale)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { localized: data.localized_payload as DtcCodeTranslatable, status: data.status };
    },

    async loadCanonical(dtcCodeId) {
      const { data, error } = await admin
        .from("dtc_codes")
        .select("title, meta_description, meaning, symptoms, causes, diagnostic_steps, common_mistakes, faq")
        .eq("id", dtcCodeId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { canonical: toTranslatable(data), version: CANONICAL_DTC_VERSION };
    },

    async translate({ dtcCodeId, version, targetLocale, canonical }) {
      const glossary = await listGlossaryForLocale(targetLocale);
      const glossaryVersion = String(glossary.length);
      const provider = new AnthropicTranslationProvider(buildDtcTranslateStep());
      const result = await translateDtcCode({
        dtcCodeId,
        dtcCodeVersion: version,
        targetLocale,
        provider,
        canonical,
        glossaryVersion,
        promptVersion: DTC_TRANSLATION_PROMPT_VERSION,
      });
      if (result.status !== "completed") {
        // Diagnostic visibility only — this doesn't change behavior, just
        // makes an otherwise-silent English fallback (no DB row written,
        // see resolveLocalizedDtcCode) explainable from logs alone.
        console.log("[dtc-translation] non-completed result", {
          dtcCodeId,
          targetLocale,
          status: result.status,
          missingTokens: result.missingTokens,
        });
      }
      return result;
    },

    async persist(row) {
      const { error } = await admin.from("dtc_code_localizations").upsert(
        {
          dtc_code_id: row.dtcCodeId,
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
        { onConflict: "dtc_code_id,locale_code" },
      );
      if (error) throw error;
    },
  };
}

// The single entry point the two DTC page components call. English requests
// short-circuit inside resolveLocalizedDtcCode without touching the DB/
// provider at all — cheap and safe to call unconditionally.
export async function getOrCreateLocalizedDtcCode(
  dtcCodeId: string,
  targetLocale: string,
): Promise<ResolvedLocalizedDtcCode> {
  const deps = buildDeps();
  return resolveLocalizedDtcCode(deps, { dtcCodeId, targetLocale });
}

// Applies a resolved localization onto a copy of the canonical DtcCode row —
// every structured/enum/proper-noun field and drive_recommendation are
// preserved from the canonical row untouched; only the translatable prose
// fields are swapped.
export function applyLocalizedDtcCode(dtc: DtcCode, localized: DtcCodeTranslatable): DtcCode {
  return {
    ...dtc,
    title: localized.title,
    meta_description: localized.metaDescription,
    meaning: localized.meaning,
    symptoms: localized.symptoms,
    causes: localized.causes,
    diagnostic_steps: localized.diagnosticSteps,
    common_mistakes: localized.commonMistakes,
    faq: localized.faq,
  };
}
