import { describe, expect, it } from "vitest";
import {
  AiResponseValidationError,
  ScanAnalysisFailedError,
  toSafeErrorResponse,
} from "@/lib/scan-diagnostics/api-errors";
import type { ScanCase } from "@/lib/types";

const FAKE_CASE = { id: "case-1", status: "failed" } as ScanCase;

describe("toSafeErrorResponse — controlled error objects", () => {
  it("maps AiResponseValidationError to a retryable AI_RESPONSE_VALIDATION_FAILED response, never exposing the raw message", async () => {
    const err = new AiResponseValidationError(
      "Anthropic diagnostic provider returned an invalid structured output: <internal zod error detail>",
    );
    const res = toSafeErrorResponse(err, "test context");
    expect(res.status).toBe(502);

    const body = await res.json();
    expect(body.code).toBe("AI_RESPONSE_VALIDATION_FAILED");
    expect(body.retryable).toBe(true);
    expect(body.error).toBe("The diagnostic response could not be validated.");
    // The internal Zod error detail must never reach the client.
    expect(body.error).not.toMatch(/zod/i);
    expect(JSON.stringify(body)).not.toMatch(/internal zod error detail/);
  });

  it("maps ScanAnalysisFailedError to a 502 carrying the failed case and default retryable code", async () => {
    const err = new ScanAnalysisFailedError(FAKE_CASE);
    const res = toSafeErrorResponse(err, "test context");
    expect(res.status).toBe(502);

    const body = await res.json();
    expect(body.case).toEqual(FAKE_CASE);
    expect(body.code).toBe("AI_PROVIDER_CALL_FAILED");
    expect(body.retryable).toBe(true);
    // Backward-compat: `error` stays a plain string, since existing
    // frontend code (ScanCaseActionBar.tsx) reads `data.error` directly.
    expect(typeof body.error).toBe("string");
  });

  it("forwards AiResponseValidationError's code/retryable through ScanAnalysisFailedError when explicitly passed", async () => {
    const err = new ScanAnalysisFailedError(FAKE_CASE, { code: "AI_RESPONSE_VALIDATION_FAILED", retryable: true });
    const res = toSafeErrorResponse(err, "test context");
    const body = await res.json();
    expect(body.code).toBe("AI_RESPONSE_VALIDATION_FAILED");
  });

  it("never leaks a raw unexpected error's message or stack to the client", async () => {
    const err = new Error("Postgres connection string: postgres://user:secret@host/db");
    const res = toSafeErrorResponse(err, "test context");
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error).toBe("Something went wrong processing your request. Please try again.");
    expect(JSON.stringify(body)).not.toMatch(/secret/);
    expect(body.retryable).toBe(false);
  });
});
