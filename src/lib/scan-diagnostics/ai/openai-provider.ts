// OpenAI implementation of the shared DiagnosticAIProvider interface — the
// sole AI provider for scan-report diagnosis and the Diagnostic Engine's
// turn reasoning (docs/MULTI_MODEL_ORCHESTRATOR.md's provider-agnostic
// interface predates the OpenAI-only migration; the orchestrator scaffold
// itself stays but is dormant, AI_ORCHESTRATOR_ENABLED default false).
// Shares the exact same vehicle-facts/DTC-evidence prompt and output
// schema across both call sites (shared-prompt.ts, schemas.ts) so a shared
// prompt version stays traceable to one exact set of instructions.
import "server-only";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { env } from "@/lib/env";
import { findKnownDtcContext } from "@/lib/scan-diagnostics/dtc-grounding";
import { DiagnosticAiOutputSchema, type CanonicalDiagnosticInput } from "@/lib/scan-diagnostics/schemas";
import { AiResponseValidationError } from "@/lib/scan-diagnostics/api-errors";
import {
  DEFAULT_SYSTEM_PROMPT,
  OPENAI_SAFETY_SUFFIX,
  buildUserPrompt,
  DTCDECODER_DIAGNOSTIC_PROMPT_VERSION,
  DIAGNOSTIC_ENGINE_SYSTEM_ADDENDUM,
} from "@/lib/scan-diagnostics/ai/shared-prompt";
import { modelForTask } from "@/lib/ai-diagnostics/model-routing";
import { getRequestLimits } from "@/lib/ai-diagnostics/orchestrator-config";
import type { DiagnosticAIProvider, DiagnosticAIProviderResult } from "@/lib/scan-diagnostics/ai/provider";

// Exported so the analyze orchestrator's pre-flight cost estimate
// (src/lib/scan-diagnostics/analyze.ts) and the Diagnostic Engine
// orchestrator's own pre-flight estimate use the SAME routed model and
// worst-case output budget this provider actually requests, instead of a
// second, possibly stale copy of either.
export const SCAN_REPORT_MODEL_ID = modelForTask("scanMainAnalysis");
export const SCAN_REPORT_MAX_TOKENS = getRequestLimits().maxPrimaryOutputTokens;

// Thrown when the required env config for this app's sole AI provider is
// incomplete — a configuration mistake, distinct from a transient provider
// outage (see isRetryableOpenAiError below, which governs whether the
// configured fallback MODEL — not a different provider — is worth trying).
export class OpenAiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAiConfigurationError";
  }
}

function requireOpenAiModel(): string {
  const model = env.openaiPrimaryModelOptional();
  if (!model) {
    throw new OpenAiConfigurationError("OPENAI_PRIMARY_MODEL is not configured.");
  }
  return model;
}

// Errors the OpenAI SDK's own built-in retry policy already treats as
// non-retryable (auth/validation/quota) are re-thrown as-is here — this
// function exists only so the orchestrator's fallback logic (analyze.ts /
// diagnostic-orchestrator.ts) can distinguish "OpenAI said no, try the
// fallback model or fall back to Anthropic" from "OpenAI is unreachable,"
// without inspecting SDK-internal error shapes itself.
export function isRetryableOpenAiError(err: unknown): boolean {
  if (err instanceof OpenAI.APIError) {
    // 401 (auth), 400/422 (validation), 429 with a quota (not rate-limit)
    // reason are deterministic client errors — retrying them wastes budget
    // for a certainty of the same failure. The SDK's own maxRetries already
    // avoids retrying most of these internally; this is the orchestrator-
    // level signal for whether trying the FALLBACK MODEL is worthwhile.
    return err.status === undefined || err.status >= 500 || err.status === 408 || err.status === 429;
  }
  return true;
}

export class OpenAiDiagnosticProvider implements DiagnosticAIProvider {
  readonly id = "openai-primary";

  private client(): OpenAI {
    const apiKey = env.openaiApiKeyOptional();
    if (!apiKey) {
      throw new OpenAiConfigurationError("OPENAI_API_KEY is not configured.");
    }
    const limits = getRequestLimits();
    return new OpenAI({
      apiKey,
      timeout: limits.providerTimeoutMs,
      maxRetries: limits.providerMaxRetries,
    });
  }

  // Shared by runDiagnosis and runDiagnosticEngineTurn — both send a system
  // prompt plus one user-content string and parse the result against the
  // same DiagnosticAiOutputSchema. Only the system prompt and user content
  // differ between the two callers (mirrors the Anthropic provider's
  // callSubmitDiagnosisTool, before that file's removal).
  private async runCompletion(
    client: OpenAI,
    model: string,
    systemPrompt: string,
    userContent: string,
  ): Promise<DiagnosticAIProviderResult> {
    const completion = await client.chat.completions.parse({
      model,
      max_completion_tokens: getRequestLimits().maxPrimaryOutputTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      response_format: zodResponseFormat(DiagnosticAiOutputSchema, "diagnostic_assessment"),
    });

    // Internal-log-only diagnostic aid (never surfaced to the customer) —
    // lets a specific failing OpenAI call be correlated with OpenAI's own
    // support/incident tooling if ever needed.
    if (completion._request_id) {
      console.info(`[openai-provider] request_id=${completion._request_id} model=${completion.model}`);
    }

    const choice = completion.choices[0];
    // finish_reason === "length" is OpenAI's truncation signal — the
    // completions.parse() helper still returns a `choice` in this case, but
    // `.parsed` is absent because the JSON was cut off mid-object, so this
    // is already covered by the `!choice?.message.parsed` check below; a
    // dedicated branch just gives a clearer error message than the generic
    // "did not return a structured, schema-conformant response" would.
    if (choice?.finish_reason === "length") {
      throw new AiResponseValidationError(
        "OpenAI diagnostic provider hit its output token limit before completing its response, so the structured output was truncated.",
      );
    }

    if (!choice?.message.parsed) {
      const refusal = choice?.message.refusal;
      throw new AiResponseValidationError(
        refusal
          ? `OpenAI diagnostic provider refused the request: ${refusal}`
          : "OpenAI diagnostic provider did not return a structured, schema-conformant response.",
      );
    }

    return {
      providerId: this.id,
      modelId: completion.model,
      promptVersion: DTCDECODER_DIAGNOSTIC_PROMPT_VERSION,
      output: choice.message.parsed,
      tokens: {
        input: completion.usage?.prompt_tokens ?? 0,
        output: completion.usage?.completion_tokens ?? 0,
      },
    };
  }

  private async runWithFallback(systemPrompt: string, userContent: string): Promise<DiagnosticAIProviderResult> {
    const client = this.client();
    const primaryModel = requireOpenAiModel();

    try {
      return await this.runCompletion(client, primaryModel, systemPrompt, userContent);
    } catch (err) {
      // A configured fallback model gets exactly one attempt, only for a
      // transient/server-side failure of the primary model — a validation
      // failure (bad schema conformance) or a deterministic client error
      // (bad request/auth/quota) is not retried with a different model,
      // since that would just waste a second paid call on the same
      // guaranteed outcome.
      const fallbackModel = env.openaiFallbackModelOptional();
      if (!fallbackModel || err instanceof AiResponseValidationError || !isRetryableOpenAiError(err)) {
        throw err;
      }
      console.warn(
        `[openai-provider] primary model "${primaryModel}" failed with a transient error, retrying once with fallback model "${fallbackModel}"`,
        err,
      );
      return await this.runCompletion(client, fallbackModel, systemPrompt, userContent);
    }
  }

  // Exactly one extra attempt, and only for validation failures (a
  // truncated or non-schema-conformant response) — sampling is
  // non-deterministic, so a second attempt on the same input frequently
  // succeeds. Transport errors (429/5xx/network) are deliberately NOT
  // retried here: the OpenAI SDK's own maxRetries already retries those
  // internally, and a genuine transient failure also gets the configured
  // fallback-model attempt inside runWithFallback — adding a third layer
  // here would just multiply attempts rather than add one.
  private async runWithValidationRetry(systemPrompt: string, userContent: string): Promise<DiagnosticAIProviderResult> {
    try {
      return await this.runWithFallback(systemPrompt, userContent);
    } catch (err) {
      if (!(err instanceof AiResponseValidationError)) throw err;
      console.warn("[openai-provider] validation failure on first attempt, retrying once", err.message);
      return await this.runWithFallback(systemPrompt, userContent);
    }
  }

  async runDiagnosis(input: CanonicalDiagnosticInput): Promise<DiagnosticAIProviderResult> {
    const knownDtcContext = await findKnownDtcContext(input.dtcs.map((d) => d.code));
    return this.runWithValidationRetry(
      DEFAULT_SYSTEM_PROMPT + OPENAI_SAFETY_SUFFIX,
      buildUserPrompt(input, knownDtcContext),
    );
  }

  async runDiagnosticEngineTurn(prompt: string): Promise<DiagnosticAIProviderResult> {
    const systemPrompt = `${DEFAULT_SYSTEM_PROMPT}${DIAGNOSTIC_ENGINE_SYSTEM_ADDENDUM}${OPENAI_SAFETY_SUFFIX}`;
    return this.runWithValidationRetry(systemPrompt, prompt);
  }
}
