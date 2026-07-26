import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/subscriptions";
import { findGroundingDtcCodes } from "@/lib/ai/grounding";
import { recordSearchHistory, updateSearchHistoryAiResponse } from "@/lib/search-history";
import { canSelectAiReportLanguage } from "@/lib/i18n/entitlements";
import { isAiOutputEnabledLocale, listGlossaryForLocale } from "@/lib/i18n/languages";
import { getLocaleInfo } from "@/lib/i18n/locale-codes";
import { streamAssistantResponse, translateDiagnosticText, estimateChatInputTokens } from "@/lib/ai/assistant";
import { verifyTokenPreservation } from "@/lib/ai/token-preservation";
import { CHAT_FULL_MAX_TOKENS } from "@/lib/ai-diagnostics/redaction";
import {
  recordAiDiagnosticUsage,
  releaseAiDiagnosticUsage,
  recordAiDiagnosticRun,
  AiDiagnosticLimitExceededError,
} from "@/lib/ai-diagnostics/usage";
import { estimateCostMicros, computeActualCostMicros, guardCostCeiling, CostCeilingExceededError } from "@/lib/ai-diagnostics/cost";
import { DIAGNOSTIC_CREDIT_WEIGHTS } from "@/lib/pricing";

const CHAT_MODEL_ID = "claude-sonnet-5";

const requestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  outputLocale: z.string().trim().toLowerCase().min(2).max(10).optional(),
  // Client-generated per-send id — the idempotency key for usage recording,
  // so a client retry of the same send (e.g. after a network hiccup) never
  // double-charges the daily/monthly allowance. Never trusted for anything
  // beyond deduplication (plan/entitlement always come from the server).
  requestId: z.string().trim().min(1).max(100),
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

  let accessLevel;
  try {
    accessLevel = await recordAiDiagnosticUsage({
      userId: user.id,
      requestId: parsed.data.requestId,
      feature: "chat",
      plan,
    });
  } catch (err) {
    if (err instanceof AiDiagnosticLimitExceededError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: err.code,
            message: err.message,
            basicLookupAvailable: err.basicLookupAvailable,
            upgradeRequired: err.upgradeRequired,
            resetAt: err.resetAt,
          },
        },
        { status: 429 },
      );
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

  // Pre-flight cost estimate + hard-ceiling guard, run AFTER the report-
  // count slot is reserved above but BEFORE the AI provider is ever
  // called — a request estimated over COST_GUARDS.hardCeilingUsd is
  // rejected here instead of being sent to Anthropic. The reservation made
  // above must still be released on this path, exactly like a genuine
  // provider failure, so a rejected request never consumes an allowance.
  const estimatedInputTokens = await estimateChatInputTokens(parsed.data.message, groundingRows);
  const costEstimate = estimateCostMicros({
    modelId: CHAT_MODEL_ID,
    estimatedInputTokens,
    estimatedOutputTokens: CHAT_FULL_MAX_TOKENS,
  });
  try {
    guardCostCeiling(costEstimate);
  } catch (err) {
    if (err instanceof CostCeilingExceededError) {
      await releaseAiDiagnosticUsage(user.id, parsed.data.requestId).catch((releaseErr) =>
        console.error("[ai-assistant] failed to release usage reservation after cost-ceiling rejection", releaseErr),
      );
      await recordAiDiagnosticRun({
        userId: user.id,
        requestId: parsed.data.requestId,
        feature: "chat",
        plan,
        providerId: "anthropic",
        modelId: CHAT_MODEL_ID,
        status: "failed",
        accessLevelRequested: accessLevel,
        errorMessage: err.message,
        estimatedTotalCostMicros: costEstimate.totalCostMicros,
      });
      return NextResponse.json(
        { error: "This request is too large to process right now. Try a shorter question." },
        { status: 413 },
      );
    }
    throw err;
  }

  const requestStartedAt = Date.now();
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
        let totalInputTokens = englishFinal.usage.input_tokens;
        let totalOutputTokens = englishFinal.usage.output_tokens;
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
          totalInputTokens += translateFinal.usage.input_tokens;
          totalOutputTokens += translateFinal.usage.output_tokens;
        }

        // Post-translation protected-token check (observability). The
        // translation was already streamed to the client, so this cannot
        // retract it — it flags any diagnosis whose translation dropped or
        // altered a DTC code, VIN, acronym, or measurement so the glossary/
        // prompt can be corrected. The reject-and-fall-back-to-English
        // enforcement applies to the stored localized-report path (see
        // docs/DYNAMIC_REPORT_TRANSLATION.md).
        if (outputLocale && translatedText) {
          const preservation = verifyTokenPreservation(englishText, translatedText);
          if (!preservation.ok) {
            console.warn(
              `[ai-assistant] translation to ${outputLocale} dropped/altered protected tokens: ${preservation.missing.join(", ")}`,
            );
          }
        }

        // Cost/observability log only — never gates anything, never
        // exposed to the customer. The usage SLOT was already reserved
        // before this stream started (see recordAiDiagnosticUsage above);
        // reaching here means the generation succeeded, so the reservation
        // stands as the consumed slot and nothing further needs recording
        // for enforcement purposes. Cost here is computed from the real
        // token usage the provider reported (englishFinal/translateFinal),
        // not the pre-flight estimate — the estimate only ever gates.
        const actualCost = computeActualCostMicros({
          modelId: CHAT_MODEL_ID,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
        });
        await recordAiDiagnosticRun({
          userId: user.id,
          requestId: parsed.data.requestId,
          feature: "chat",
          plan,
          providerId: "anthropic",
          modelId: CHAT_MODEL_ID,
          status: "completed",
          accessLevelRequested: accessLevel,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          creditsConsumed: DIAGNOSTIC_CREDIT_WEIGHTS.standardReport,
          estimatedInputCostMicros: actualCost.inputCostMicros,
          estimatedOutputCostMicros: actualCost.outputCostMicros,
          estimatedTotalCostMicros: actualCost.totalCostMicros,
          latencyMs: Date.now() - requestStartedAt,
        });

        if (searchHistoryId) {
          await updateSearchHistoryAiResponse(searchHistoryId, englishText, translatedText).catch(
            (err) => console.error("Failed to persist AI response text", err),
          );
        }
      } catch (err) {
        console.error("AI assistant stream failed", err);

        // Generation failed partway through the stream — release the
        // reserved slot so this attempt never consumed a free preview or a
        // paid report allowance, mirroring the scan-diagnostics orchestrator's
        // failure handling.
        await releaseAiDiagnosticUsage(user.id, parsed.data.requestId).catch((releaseErr) =>
          console.error("[ai-assistant] failed to release usage reservation after stream failure", releaseErr),
        );
        await recordAiDiagnosticRun({
          userId: user.id,
          requestId: parsed.data.requestId,
          feature: "chat",
          plan,
          providerId: "anthropic",
          modelId: CHAT_MODEL_ID,
          status: "failed",
          accessLevelRequested: accessLevel,
          errorMessage: err instanceof Error ? err.message : "Unknown error",
          latencyMs: Date.now() - requestStartedAt,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
