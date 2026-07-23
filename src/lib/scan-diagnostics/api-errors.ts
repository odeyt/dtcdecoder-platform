// Shared error taxonomy + response mapping for every /api/scan-diagnostics
// route. Internal error detail (stack traces, provider error bodies,
// Supabase error internals) is always console.error'd server-side only —
// the client only ever sees the safe, typed message below.
import "server-only";
import { NextResponse } from "next/server";
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

export class ScanUsageLimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScanUsageLimitExceededError";
  }
}

export class InvalidCaseStatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCaseStatusError";
  }
}

// Thrown by the analyze orchestrator when the AI provider call itself
// fails (network error, timeout, invalid structured output) after the
// usage slot has already been consumed and the case transitioned to
// "failed" — carries that already-updated case so the route can return it
// alongside the error rather than making the client re-fetch.
export class ScanAnalysisFailedError extends Error {
  constructor(public readonly scanCase: ScanCase) {
    super("AI analysis failed. Please try again.");
    this.name = "ScanAnalysisFailedError";
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
  if (err instanceof ScanUsageLimitExceededError) {
    return NextResponse.json({ error: err.message }, { status: 429 });
  }
  if (err instanceof InvalidCaseStatusError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  if (err instanceof FeatureDisabledError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof ScanAnalysisFailedError) {
    return NextResponse.json({ case: err.scanCase, error: err.message }, { status: 502 });
  }

  return NextResponse.json(
    { error: "Something went wrong processing your request. Please try again." },
    { status: 500 },
  );
}
