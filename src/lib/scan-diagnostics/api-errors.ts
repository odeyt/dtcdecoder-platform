// Shared error taxonomy + response mapping for every /api/scan-diagnostics
// route. Internal error detail (stack traces, provider error bodies,
// Supabase error internals) is always console.error'd server-side only —
// the client only ever sees the safe, typed message below.
import "server-only";
import { NextResponse } from "next/server";
import { AiDiagnosticLimitExceededError } from "@/lib/ai-diagnostics/usage";
import { CostCeilingExceededError } from "@/lib/ai-diagnostics/cost";
import { DiagnosticEngineLimitExceededError } from "@/lib/diagnostic-engine/usage";
import { DuplicateAnswerError } from "@/lib/diagnostic-engine/question";
import { StaleGraphVersionError } from "@/lib/diagnostic-engine/graph";
import { DiagnosticEngineBudgetExceededError, DiagnosticEngineKillSwitchError } from "@/lib/diagnostic-engine/budget-guard";
import type { ScanCase } from "@/lib/types";

export class ScanCaseNotFoundError extends Error {
  constructor() {
    super("Case not found.");
    this.name = "ScanCaseNotFoundError";
  }
}

export class UnsupportedFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedFileError";
  }
}

export class InvalidCaseStatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCaseStatusError";
  }
}

// Thrown by AnthropicDiagnosticProvider when the model either doesn't
// return a structured tool call, or its structured output fails
// DiagnosticAiOutputSchema validation. Distinct from a network/timeout
// failure — this is "the AI responded but we could not trust the shape of
// what it said," which the API surfaces as a specific, retryable error
// code (see toSafeErrorResponse) rather than a generic 500.
export class AiResponseValidationError extends Error {
  readonly code = "AI_RESPONSE_VALIDATION_FAILED";
  readonly retryable = true;
  // Distinguishes "no tool_use block at all" (false) from "a tool_use
  // block was present but its input failed schema validation" (true) —
  // see migration 0037. Never the raw provider output, just this one bit.
  // Optional: only the Diagnostic Engine turn call site sets it; other
  // callers (OpenAI provider, the review() path) leave it undefined,
  // which maps to a null (not applicable) observability column.
  readonly toolUsePresent?: boolean;

  constructor(message: string, toolUsePresent?: boolean) {
    super(message);
    this.name = "AiResponseValidationError";
    this.toolUsePresent = toolUsePresent;
  }
}

// Thrown by the analyze orchestrator when the AI provider call itself
// fails (network error, timeout, invalid structured output) after the
// usage slot has already been consumed and the case transitioned to
// "failed" — carries that already-updated case so the route can return it
// alongside the error rather than making the client re-fetch. `code`/
// `retryable` are forwarded from the underlying cause when it was an
// AiResponseValidationError; otherwise default to a generic retryable
// provider-failure code.
export class ScanAnalysisFailedError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(
    public readonly scanCase: ScanCase,
    options?: { code?: string; retryable?: boolean },
  ) {
    super("AI analysis failed. Please try again.");
    this.name = "ScanAnalysisFailedError";
    this.code = options?.code ?? "AI_PROVIDER_CALL_FAILED";
    this.retryable = options?.retryable ?? true;
  }
}

// Thrown by every route when NEXT_PUBLIC_SCAN_DIAGNOSTICS_ENABLED is off —
// a safety net against hitting these tables/routes in an environment where
// migrations 0012-0014 haven't been applied yet, not just a UI nav gate.
export class FeatureDisabledError extends Error {
  constructor() {
    super("Diagnostic scan report analysis is not available yet.");
    this.name = "FeatureDisabledError";
  }
}

export function toSafeErrorResponse(err: unknown, context: string): NextResponse {
  console.error(`[scan-diagnostics] ${context} failed`, err);

  if (err instanceof ScanCaseNotFoundError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof UnsupportedFileError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof AiDiagnosticLimitExceededError) {
    // Exact shape from the entitlement spec's "over-limit experience" —
    // basic DTC lookup always stays available even when the AI diagnostic
    // allowance is exhausted, which is why basicLookupAvailable is always
    // true here rather than conditional.
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
  if (err instanceof DuplicateAnswerError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  if (err instanceof StaleGraphVersionError) {
    return NextResponse.json({ error: err.message, retryable: true }, { status: 409 });
  }
  if (err instanceof DiagnosticEngineBudgetExceededError || err instanceof DiagnosticEngineKillSwitchError) {
    // err.message is already the safe, generic BUDGET_EXHAUSTED_USER_MESSAGE
    // — never the underlying $ figures or which dimension blocked the call
    // (those are in err.reasons/err.blockedScope, logged server-side above,
    // never serialized into this response).
    return NextResponse.json({ error: err.message, retryable: true }, { status: 503 });
  }
  if (err instanceof DiagnosticEngineLimitExceededError) {
    return NextResponse.json(
      { success: false, error: { code: err.code, message: err.message, resetAt: err.resetAt, upgradeRequired: err.upgradeRequired } },
      { status: 429 },
    );
  }
  if (err instanceof CostCeilingExceededError) {
    return NextResponse.json(
      { error: "This case is too large to analyze right now. Try a smaller scan report or fewer symptoms." },
      { status: 413 },
    );
  }
  if (err instanceof InvalidCaseStatusError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  if (err instanceof FeatureDisabledError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof ScanAnalysisFailedError) {
    // `error` (string) is the original, still-supported contract every
    // existing frontend caller reads; `code`/`retryable` are additive so
    // nothing that only reads `.error` breaks.
    return NextResponse.json(
      { case: err.scanCase, error: err.message, code: err.code, retryable: err.retryable },
      { status: 502 },
    );
  }
  if (err instanceof AiResponseValidationError) {
    return NextResponse.json(
      { error: "The diagnostic response could not be validated.", code: err.code, retryable: err.retryable },
      { status: 502 },
    );
  }

  return NextResponse.json(
    { error: "Something went wrong processing your request. Please try again.", retryable: false },
    { status: 500 },
  );
}
