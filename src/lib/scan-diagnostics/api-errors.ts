// Shared error taxonomy + response mapping for every /api/scan-diagnostics
// route. Internal error detail (stack traces, provider error bodies,
// Supabase error internals) is always console.error'd server-side only —
// the client only ever sees the safe, typed message below.
import "server-only";
import { NextResponse } from "next/server";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";
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
  // see migration 0040. Never the raw provider output, just this one bit.
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

// Thrown by workbench.ts when a test/cause index doesn't correspond to a
// real item in the report's recommended_tests/ranked_causes array — never
// silently create an orphan progress row for an index that doesn't exist.
export class InvalidReportIndexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidReportIndexError";
  }
}

// Thrown by regenerateScanAnalysis when the case has no active
// single-report unlock at all (regeneration is a purchased-report benefit
// only, never available on a plan-based report) or its one permitted
// regeneration is already used. The existing report is never touched when
// this is thrown — see analyze.ts's ordering (consume-then-transition).
export class RegenerationLimitExceededError extends Error {
  readonly reasonCode: "no_active_unlock" | "already_regenerated";

  constructor(reasonCode: "no_active_unlock" | "already_regenerated" = "already_regenerated") {
    super(
      reasonCode === "no_active_unlock"
        ? "Report regeneration is only available for a purchased Professional Diagnostic Report."
        : "This report has already been regenerated once. Regeneration is limited to one per purchased report.",
    );
    this.name = "RegenerationLimitExceededError";
    this.reasonCode = reasonCode;
  }
}

// Thrown when a case's purchased follow-up allowance (5 per report) is
// already exhausted. The case/report/consultation history are never
// touched when this is thrown.
export class FollowUpLimitExceededError extends Error {
  constructor(message = "You've used all 5 included follow-up questions for this report.") {
    super(message);
    this.name = "FollowUpLimitExceededError";
  }
}

// One row per prior case this user has for the same VIN — surfaced by
// findExistingCasesForVin (cases.ts) so a duplicate-VIN warning can link
// straight to the existing case instead of just naming it.
export interface ExistingVinCase {
  id: string;
  status: ScanCase["status"];
  complaint: string | null;
  createdAt: string;
}

// Thrown by the quick-diagnostic and analyze routes when the VIN being
// submitted already has other cases for this same user and the request
// didn't set confirmDuplicateVin — a soft, overridable warning (409, not a
// hard block) so a customer re-running a scan on the same vehicle isn't
// charged again without at least being told. See
// findExistingCasesForVin/getVinForCase in cases.ts for the lookup this
// wraps, and docs/design/DUPLICATE_VIN_WARNING.md for the full flow.
export class DuplicateVinError extends Error {
  constructor(
    public readonly vin: string,
    public readonly existingCases: ExistingVinCase[],
  ) {
    super("You already have a case for this VIN.");
    this.name = "DuplicateVinError";
  }
}

// Locale-aware: every STATIC (non-data-dependent) error message returned
// to the client is translated here, at the single point every
// /api/scan-diagnostics and /api/diagnostic-engine route funnels through —
// never at the throw site, so callers never need locale access themselves.
// Messages that carry caller-supplied, data-dependent text (Unsupported
// FileError, InvalidCaseStatusError, InvalidReportIndexError) are
// intentionally left as err.message — translating those needs the
// underlying numeric/contextual data threaded through as a separate field,
// not just a message swap. The AiDiagnosticLimitExceededError/
// DiagnosticEngineLimitExceededError family now also carries a `limit`
// field alongside `message`, so clients build a translated sentence from
// `code` + `limit` (see formatLimitErrorMessage in
// src/lib/i18n/limit-error-messages.ts) and fall back to the raw
// `message` only for an unrecognized code.
export async function toSafeErrorResponse(err: unknown, context: string): Promise<NextResponse> {
  console.error(`[scan-diagnostics] ${context} failed`, err);

  const locale = await resolveAppShellLocale();
  const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;

  if (err instanceof ScanCaseNotFoundError) {
    return NextResponse.json({ error: t.caseNotFound }, { status: 404 });
  }
  if (err instanceof UnsupportedFileError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof AiDiagnosticLimitExceededError) {
    // Exact shape from the entitlement spec's "over-limit experience" —
    // basic DTC lookup always stays available even when the AI diagnostic
    // allowance is exhausted, which is why basicLookupAvailable is always
    // true here rather than conditional. `message` stays as a fallback for
    // any caller not yet updated to build its own translated sentence from
    // `code` + `limit`.
    return NextResponse.json(
      {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          basicLookupAvailable: err.basicLookupAvailable,
          upgradeRequired: err.upgradeRequired,
          resetAt: err.resetAt,
          limit: err.limit,
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
    // Never the underlying $ figures or which dimension blocked the call
    // (those are in err.reasons/err.blockedScope, logged server-side above,
    // never serialized into this response) — just the safe, generic,
    // translated budget-exhausted message.
    return NextResponse.json({ error: t.budgetExhausted, retryable: true }, { status: 503 });
  }
  if (err instanceof DiagnosticEngineLimitExceededError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          resetAt: err.resetAt,
          upgradeRequired: err.upgradeRequired,
          limit: err.limit,
        },
      },
      { status: 429 },
    );
  }
  if (err instanceof CostCeilingExceededError) {
    return NextResponse.json({ error: t.caseTooLarge }, { status: 413 });
  }
  if (err instanceof InvalidCaseStatusError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  if (err instanceof FeatureDisabledError) {
    return NextResponse.json({ error: t.featureDisabled }, { status: 404 });
  }
  if (err instanceof InvalidReportIndexError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof RegenerationLimitExceededError) {
    const message = err.reasonCode === "no_active_unlock" ? t.regenerationRequiresPurchase : t.regenerationAlreadyUsed;
    return NextResponse.json({ error: message, code: err.name, retryable: false }, { status: 409 });
  }
  if (err instanceof FollowUpLimitExceededError) {
    return NextResponse.json({ error: t.followUpLimitReached, code: err.name, retryable: false }, { status: 409 });
  }
  if (err instanceof DuplicateVinError) {
    return NextResponse.json(
      { error: t.duplicateVin, code: "DUPLICATE_VIN", vin: err.vin, existingCases: err.existingCases },
      { status: 409 },
    );
  }
  if (err instanceof ScanAnalysisFailedError) {
    // `error` (string) is the original, still-supported contract every
    // existing frontend caller reads; `code`/`retryable` are additive so
    // nothing that only reads `.error` breaks.
    return NextResponse.json(
      { case: err.scanCase, error: t.analysisFailedRetry, code: err.code, retryable: err.retryable },
      { status: 502 },
    );
  }
  if (err instanceof AiResponseValidationError) {
    return NextResponse.json(
      { error: t.responseValidationFailed, code: err.code, retryable: err.retryable },
      { status: 502 },
    );
  }

  return NextResponse.json({ error: t.genericError, retryable: false }, { status: 500 });
}
