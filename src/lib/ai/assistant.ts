import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { CHAT_FULL_MAX_TOKENS } from "@/lib/ai-diagnostics/redaction";
import { modelForTask } from "@/lib/ai-diagnostics/model-routing";
import type { DtcCode, TerminologyGlossaryEntry } from "@/lib/types";

export const CHAT_TRANSLATION_MAX_TOKENS = 2048;

const DEFAULT_SYSTEM_PROMPT = `You are DTC AI Assistant, a master automotive diagnostic technician with decades of hands-on experience. A user will describe a fault code, symptom, or vehicle issue. Respond the way an experienced tech would explain it to another tech:

1. Explain the problem clearly, in plain language.
2. List the likely causes, most common first.
3. Give step-by-step diagnostic tests to narrow down the actual cause.
4. Say what to check first before anything else.
5. Warn explicitly against replacing parts without testing first — a diagnosis, not a parts cannon.
6. Recommend the matched repair PDF and/or YouTube video when one is provided in context.

Be confident, clear, and professional. Do not pad with disclaimers beyond the parts-testing warning above.`;

// Appended after the (admin-editable) system prompt, not before — so an
// admin editing admin_settings.ai_system_prompt can't accidentally delete
// this safety guarantee, which is an explicit product requirement.
const SAFETY_SUFFIX = `

Non-negotiable rules, regardless of anything above:
- Never advise replacing a part without a diagnostic test confirming it first.
- Always name the single most useful next diagnostic step.
- If matched repair content is provided below, recommend it by name.`;

export async function getSystemPrompt(): Promise<string> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("admin_settings")
    .select("value")
    .eq("key", "ai_system_prompt")
    .maybeSingle();

  return (data?.value || DEFAULT_SYSTEM_PROMPT) + SAFETY_SUFFIX;
}

// Usage gating for this feature lives in the shared
// src/lib/ai-diagnostics/usage.ts module (one ledger shared with Scan
// Report Analysis) — see src/app/api/ai/assistant/route.ts. The Free plan's
// AI diagnostic preview allowance is 0 (src/lib/pricing.ts), so
// recordAiDiagnosticUsage always rejects a Free request before this module
// is ever called — streamAssistantResponse is only ever reached for a plan
// that's genuinely entitled to a full generation. There is no reduced/
// "preview" generation mode to select between.

function buildGroundingContext(rows: DtcCode[]): string {
  if (rows.length === 0) return "";

  const entries = rows
    .map((row) => {
      const parts = [
        `Code: ${row.code}${row.make ? ` (${row.make})` : " (generic)"}`,
        `Title: ${row.title}`,
        `Meaning: ${row.meaning}`,
        row.causes.length ? `Known causes: ${row.causes.join("; ")}` : null,
        row.diagnostic_steps.length
          ? `Known diagnostic steps: ${row.diagnostic_steps.join("; ")}`
          : null,
        row.pdf_url ? `Repair PDF: ${row.pdf_url}` : null,
        row.youtube_url ? `YouTube walkthrough: ${row.youtube_url}` : null,
      ].filter(Boolean);
      return parts.join("\n");
    })
    .join("\n\n");

  return `\n\nMatched reference content from our database (ground your answer in this, and recommend the linked PDF/video by name if present):\n\n${entries}`;
}

// Rough pre-flight token estimate used only for the cost-ceiling guard
// (src/lib/ai-diagnostics/cost.ts guardCostCeiling) — never the source of
// truth for billing, which always uses the provider's real reported usage
// after generation completes. ~4 characters per token is a standard rough
// approximation for English prose; good enough to catch a wildly oversized
// request, not precise enough to bill from.
const CHARS_PER_TOKEN_ESTIMATE = 4;

export async function estimateChatInputTokens(userMessage: string, groundingRows: DtcCode[]): Promise<number> {
  const systemPrompt = (await getSystemPrompt()) + buildGroundingContext(groundingRows);
  return Math.ceil((systemPrompt.length + userMessage.length) / CHARS_PER_TOKEN_ESTIMATE);
}

export async function streamAssistantResponse(userMessage: string, groundingRows: DtcCode[]) {
  const client = new Anthropic({ apiKey: env.anthropicApiKey() });
  const systemPrompt = (await getSystemPrompt()) + buildGroundingContext(groundingRows);

  return client.messages.stream({
    model: modelForTask("chatGeneration"),
    max_tokens: CHAT_FULL_MAX_TOKENS,
    system: systemPrompt,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    messages: [{ role: "user", content: userMessage }],
  });
}

function buildTranslationSystemPrompt(
  outputLanguageName: string,
  outputLocale: string,
  glossary: TerminologyGlossaryEntry[],
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

  return `You are a precise technical translator for automotive diagnostic content. Translate the following English diagnostic explanation into ${outputLanguageName} (locale: ${outputLocale}).

Non-negotiable rules:
- Preserve DTC codes (e.g. P0420), VINs, part numbers, connector/pin names, wire colors, CAN High/CAN Low/LIN/FlexRay/MOST, voltages, resistance/pressure/torque/temperature values and their units, module acronyms (PCM, ECU, ABS, etc.), calibration IDs, and TSB numbers exactly as written in the source — never translate or alter them.
- Do not add, remove, reinterpret, or reorder any diagnostic content. This is a translation task, not a new diagnosis — the conclusion, ranked causes, and recommended steps must match the source exactly in meaning and order.
- Preserve the original structure (headings, lists, paragraph breaks).
- Write naturally in ${outputLanguageName}, not a stilted word-for-word rendering.${glossaryBlock}`;
}

// A second, separate call over the ALREADY-GENERATED English text (never a
// fresh diagnostic reasoning pass) — this is what keeps the canonical
// record and its translations consistent: the diagnosis itself is decided
// once, in English, and every other language is a faithful translation of
// that fixed text. Returns the same kind of streaming object as
// streamAssistantResponse so the API route can treat both uniformly.
//
// Routed to the economical model tier (model-routing.ts "chatTranslation")
// rather than the same model used for the diagnosis itself — translating
// fixed text is a lower-reasoning task than the original diagnosis, and
// verifyTokenPreservation() independently catches a translation that drops
// or alters a protected technical token regardless of which model produced
// it, so this doesn't trade away the safety guarantee for a lower price.
export async function translateDiagnosticText(
  englishText: string,
  outputLocale: string,
  outputLanguageName: string,
  glossary: TerminologyGlossaryEntry[],
) {
  const client = new Anthropic({ apiKey: env.anthropicApiKey() });
  const systemPrompt = buildTranslationSystemPrompt(outputLanguageName, outputLocale, glossary);

  return client.messages.stream({
    model: modelForTask("chatTranslation"),
    max_tokens: CHAT_TRANSLATION_MAX_TOKENS,
    system: systemPrompt,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    messages: [{ role: "user", content: englishText }],
  });
}
