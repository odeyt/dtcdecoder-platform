import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import type { DtcCode } from "@/lib/types";

const FREE_DAILY_QUERY_LIMIT = 5;

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

export class RateLimitExceededError extends Error {
  constructor() {
    super("Daily AI query limit reached for the Free plan.");
  }
}

export async function getSystemPrompt(): Promise<string> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("admin_settings")
    .select("value")
    .eq("key", "ai_system_prompt")
    .maybeSingle();

  return (data?.value || DEFAULT_SYSTEM_PROMPT) + SAFETY_SUFFIX;
}

// Free plan: capped via an atomic Postgres increment (no read-then-write
// race). Pro/Workshop: unlimited, no counter touched.
export async function enforceRateLimit(
  userId: string,
  plan: "free" | "pro" | "workshop",
): Promise<void> {
  if (plan !== "free") return;

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("increment_ai_usage", {
    p_user_id: userId,
  });

  if (error) throw error;
  if (typeof data === "number" && data > FREE_DAILY_QUERY_LIMIT) {
    throw new RateLimitExceededError();
  }
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
