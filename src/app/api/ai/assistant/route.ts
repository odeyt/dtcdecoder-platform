import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/subscriptions";
import { findGroundingDtcCodes } from "@/lib/ai/grounding";
import { recordSearchHistory, updateSearchHistoryAiResponse } from "@/lib/search-history";
import { canSelectAiReportLanguage } from "@/lib/i18n/entitlements";
import { isAiOutputEnabledLocale, listGlossaryForLocale } from "@/lib/i18n/languages";
import { getLocaleInfo } from "@/lib/i18n/locale-codes";
import {
  checkRateLimit,
  recordTokenUsage,
  streamAssistantResponse,
  translateDiagnosticText,
  RateLimitExceededError,
} from "@/lib/ai/assistant";

const requestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  outputLocale: z.string().trim().toLowerCase().min(2).max(10).optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Sign in to use the AI diagnostic assistant" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const plan = await getEffectivePlan(user.id, user.email ?? null);

  try {
    await checkRateLimit(user.id, plan);
  } catch (err) {
    if (err instanceof RateLimitExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }

  // outputLocale is validated server-side on every request, never trusted
  // from client UI state alone: both the plan entitlement and the
  // language's real ai_output_enabled registry flag are re-checked here.
  let outputLocale: string | null = null;
  const requestedLocale = parsed.data.outputLocale;
  if (requestedLocale && requestedLocale !== "en") {
    if (!canSelectAiReportLanguage(plan)) {
      return NextResponse.json(
        { error: "Upgrade to Pro or Workshop to get AI answers in another language." },
        { status: 403 },
      );
    }
    const enabled = await isAiOutputEnabledLocale(requestedLocale);
    if (!enabled) {
      return NextResponse.json(
        { error: "That language isn't available for AI answers yet." },
        { status: 400 },
      );
    }
    outputLocale = requestedLocale;
  }

  const groundingRows = await findGroundingDtcCodes(parsed.data.message);

  let searchHistoryId: string | null = null;
  try {
    searchHistoryId = await recordSearchHistory(
      user.id,
      "ai",
      parsed.data.message,
      groundingRows[0]?.id ?? null,
    );
  } catch (err) {
    console.error("Failed to record AI search history", err);
  }

  const englishStream = await streamAssistantResponse(parsed.data.message, groundingRows);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const englishChunks: string[] = [];

        // Always generate in English first — streamed directly to the
        // client when that's the requested output, otherwise consumed
        // silently here so the translation call below has fixed source
        // text. Never generate independently in the target language: that
        // would let the English chat answer and a later translation drift
        // into two different conclusions over the same grounding data.
        for await (const event of englishStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            englishChunks.push(event.delta.text);
            if (!outputLocale) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
        }
        const englishText = englishChunks.join("");
        const englishFinal = await englishStream.finalMessage();
        let totalTokens = englishFinal.usage.input_tokens + englishFinal.usage.output_tokens;
        let translatedText: string | null = null;

        if (outputLocale) {
          const localeInfo = getLocaleInfo(outputLocale);
          const glossary = await listGlossaryForLocale(outputLocale);
          const translateStream = await translateDiagnosticText(
            englishText,
            outputLocale,
            localeInfo?.englishName ?? outputLocale,
            glossary,
          );

          const translatedChunks: string[] = [];
          for await (const event of translateStream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              translatedChunks.push(event.delta.text);
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          translatedText = translatedChunks.join("");

          const translateFinal = await translateStream.finalMessage();
          totalTokens += translateFinal.usage.input_tokens + translateFinal.usage.output_tokens;
        }

        // Record actual token spend (both calls, when translation ran) for
        // paid-plan monthly budget enforcement — only knowable once every
        // stream involved has fully completed.
        await recordTokenUsage(user.id, plan, totalTokens);

        if (searchHistoryId) {
          await updateSearchHistoryAiResponse(searchHistoryId, englishText, translatedText).catch(
            (err) => console.error("Failed to persist AI response text", err),
          );
        }
      } catch (err) {
        console.error("AI assistant stream failed", err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
