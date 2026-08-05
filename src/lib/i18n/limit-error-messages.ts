// Maps the stable `code` carried by AiDiagnosticLimitExceededError /
// DiagnosticEngineLimitExceededError (see toSafeErrorResponse in
// src/lib/scan-diagnostics/api-errors.ts) to a translated sentence built
// from the "usageLimitErrors" message catalog + the numeric `limit` field
// the server now sends alongside the raw English `message`. Falls back to
// that raw `message` for any code this map doesn't recognize, so an
// unmapped/future code never renders as a blank string.
const LIMIT_ERROR_KEYS: Record<string, string> = {
  FREE_DAILY_AI_LIMIT_REACHED: "freeDailyAiLimitReached",
  DAILY_REPORT_LIMIT_REACHED: "dailyReportLimitReached",
  MONTHLY_REPORT_LIMIT_REACHED: "monthlyReportLimitReached",
  DIAGNOSTIC_ENGINE_DAILY_LIMIT_REACHED: "diagnosticEngineDailyLimitReached",
  DIAGNOSTIC_ENGINE_MONTHLY_LIMIT_REACHED: "diagnosticEngineMonthlyLimitReached",
};

export interface LimitErrorPayload {
  code?: string;
  message?: string;
  limit?: number;
}

type LimitErrorTranslator = (key: string, values?: Record<string, string | number>) => string;

export function formatLimitErrorMessage(
  error: LimitErrorPayload | null | undefined,
  t: LimitErrorTranslator,
): string {
  if (!error) return "";
  const key = error.code ? LIMIT_ERROR_KEYS[error.code] : undefined;
  if (key && typeof error.limit === "number") {
    return t(key, { limit: error.limit });
  }
  return error.message ?? "";
}
