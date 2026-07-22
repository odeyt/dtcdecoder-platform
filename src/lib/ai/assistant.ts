import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { PAID_PLANS, type PaidPlan } from "@/lib/pricing";
import type { DtcCode, TerminologyGlossaryEntry } from "@/lib/types";

export const FREE_DAILY_QUERY_LIMIT = 5;

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

export class RateLimitExceededError extends Error {}

export async function getSystemPrompt(): Promise<string> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("admin_settings")
    .select("value")
    .eq("key", "ai_system_prompt")
    .maybeSingle();

  return (data?.value || DEFAULT_SYSTEM_PROMPT) + SAFETY_SUFFIX;
}

// Free plan: gated by query count, checked atomically before the request
// (the count is known upfront, so pre-flight check-and-increment is exact).
// Paid plans: gated by a monthly token budget instead — since actual token
// spend for THIS request isn't known until the response finishes streaming,
// this only checks the month-to-date total already on record; the request
// itself is recorded afterward via recordTokenUsage().
export async function checkRateLimit(
  userId: string,
  plan: "free" | "pro" | "workshop",
): Promise<void> {
  const supabase = createAdminClient();

  if (plan === "free") {
    const { data, error } = await supabase.rpc("increment_ai_usage", {
      p_user_id: userId,
    });
    if (error) throw error;
    if (typeof data === "number" && data > FREE_DAILY_QUERY_LIMIT) {
      throw new RateLimitExceededError(
        "You've hit today's Free plan AI query limit. Upgrade to Pro for a much larger monthly allowance.",
      );
    }
    return;
  }

  const { data, error } = await supabase.rpc("get_monthly_ai_tokens", {
    p_user_id: userId,
  });
  if (error) throw error;

  const limit = PAID_PLANS[plan as PaidPlan].monthlyTokenLimit;
  if (typeof data === "number" && data >= limit) {
    throw new RateLimitExceededError(
      `You've used this month's AI token allowance for the ${PAID_PLANS[plan as PaidPlan].label} plan. It resets at the start of next month.`,
    );
  }
}

// Recorded after the Claude response completes, for paid plans only — Free
// plan usage is already fully accounted for by the pre-flight query counter.
export async function recordTokenUsage(
  userId: string,
  plan: "free" | "pro" | "workshop",
  totalTokens: number,
): Promise<void> {
  if (plan === "free") return;
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("increment_ai_tokens", {
    p_user_id: userId,
    p_tokens: totalTokens,
  });
  if (error) throw error;
}

export interface UsageSummary {
  used: number;
  limit: number;
  unit: "queries" | "tokens";
}

// Real, current usage — used by the account page's UsageMeter. Never a
// placeholder; reads the same counters checkRateLimit() enforces against.
export async function getUsageSummary(
  userId: string,
  plan: "free" | "pro" | "workshop",
): Promise<UsageSummary> {
  const supabase = createAdminClient();

  if (plan === "free") {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("ai_usage")
      .select("query_count")
      .eq("user_id", userId)
      .eq("usage_date", today)
      .maybeSingle();
    if (error) throw error;
    return { used: data?.query_count ?? 0, limit: FREE_DAILY_QUERY_LIMIT, unit: "queries" };
  }

  const { data, error } = await supabase.rpc("get_monthly_ai_tokens", {
    p_user_id: userId,
  });
  if (error) throw error;
  return {
    used: typeof data === "number" ? data : 0,
    limit: PAID_PLANS[plan as PaidPlan].monthlyTokenLimit,
    unit: "tokens",
  };
}

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

export async function streamAssistantResponse(
  userMessage: string,
  groundingRows: DtcCode[],
) {
  const client = new Anthropic({ apiKey: env.anthropicApiKey() });
  const systemPrompt = (await getSystemPrompt()) + buildGroundingContext(groundingRows);

  return client.messages.stream({
    model: "claude-sonnet-5",
    max_tokens: 2048,
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
export async function translateDiagnosticText(
  englishText: string,
  outputLocale: string,
  outputLanguageName: string,
  glossary: TerminologyGlossaryEntry[],
) {
  const client = new Anthropic({ apiKey: env.anthropicApiKey() });
  const systemPrompt = buildTranslationSystemPrompt(outputLanguageName, outputLocale, glossary);

  return client.messages.stream({
    model: "claude-sonnet-5",
    max_tokens: 2048,
    system: systemPrompt,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    messages: [{ role: "user", content: englishText }],
  });
}
