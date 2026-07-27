// OpenAI implementation of the shared DiagnosticAIProvider interface —
// the orchestrator's configurable PRIMARY assessor (docs/MULTI_MODEL_ORCHESTRATOR.md).
// Disabled by default (OPENAI_PRIMARY_ENABLED=false) and never instantiated
// unless the orchestrator's registry explicitly selects it — see
// src/lib/scan-diagnostics/ai/registry.ts. Shares the exact same
// vehicle-facts/DTC-evidence prompt and output schema as
// AnthropicDiagnosticProvider (shared-prompt.ts, schemas.ts) so switching
// the primary provider never changes what facts are reasoned over or what
// shape a result takes.
import "server-only";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { env } from "@/lib/env";
import { findKnownDtcContext } from "@/lib/scan-diagnostics/dtc-grounding";
import { DiagnosticAiOutputSchema, type CanonicalDiagnosticInput } from "@/lib/scan-diagnostics/schemas";
import { AiResponseValidationError } from "@/lib/scan-diagnostics/api-errors";
import { DEFAULT_SYSTEM_PROMPT, OPENAI_SAFETY_SUFFIX, buildUserPrompt } from "@/lib/scan-diagnostics/ai/shared-prompt";
import { DTCDECODER_DIAGNOSTIC_PROMPT_VERSION } from "@/lib/scan-diagnostics/ai/anthropic-provider";
import { getRequestLimits } from "@/lib/ai-diagnostics/orchestrator-config";
import type { DiagnosticAIProvider, DiagnosticAIProviderResult } from "@/lib/scan-diagnostics/ai/provider";

// Thrown when the orchestrator's registry selects OpenAI as primary
// (OPENAI_PRIMARY_ENABLED=true) but the required env config is incomplete —
// a configuration mistake, not a transient provider outage, so the
// orchestrator's fallback-to-Anthropic path (not a retry) is what should
// handle it. Never thrown when OpenAI is disabled — nothing in this file
// runs at all in that case (see registry.ts).
export class OpenAiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAiConfigurationError";
  }
}

function requireOpenAiModel(): string {
  const model = env.openaiPrimaryModelOptional();
  if (!model) {
    throw new OpenAiConfigurationError(
      "OPENAI_PRIMARY_ENABLED is true but OPENAI_PRIMARY_MODEL is not configured.",
    );
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
      throw new OpenAiConfigurationError("OPENAI_PRIMARY_ENABLED is true but OPENAI_API_KEY is not configured.");
    }
    const limits = getRequestLimits();
    return new OpenAI({
      apiKey,
      timeout: limits.providerTimeoutMs,
      maxRetries: limits.providerMaxRetries,
    });
  }

  private async runWithModel(
    client: OpenAI,
    model: string,
    input: CanonicalDiagnosticInput,
    knownDtcContext: Map<string, { meaning: string; severity: string }>,
  ): Promise<DiagnosticAIProviderResult> {
    const completion = await client.chat.completions.parse({
      model,
      max_completion_tokens: getRequestLimits().maxPrimaryOutputTokens,
      messages: [
        { role: "system", content: DEFAULT_SYSTEM_PROMPT + OPENAI_SAFETY_SUFFIX },
        { role: "user", content: buildUserPrompt(input, knownDtcContext) },
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

  async runDiagnosis(input: CanonicalDiagnosticInput): Promise<DiagnosticAIProviderResult> {
    const client = this.client();
    const primaryModel = requireOpenAiModel();
    const knownDtcContext = await findKnownDtcContext(input.dtcs.map((d) => d.code));

    try {
      return await this.runWithModel(client, primaryModel, input, knownDtcContext);
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
      return await this.runWithModel(client, fallbackModel, input, knownDtcContext);
    }
  }
}
