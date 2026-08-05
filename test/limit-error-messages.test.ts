import { describe, expect, it } from "vitest";
import { formatLimitErrorMessage } from "@/lib/i18n/limit-error-messages";

// Mirrors next-intl's useTranslations() call signature closely enough for
// this helper's purposes: a key plus optional ICU values, returning a
// string with {name} placeholders substituted.
function fakeTranslator(templates: Record<string, string>) {
  return (key: string, values?: Record<string, string | number>) => {
    const template = templates[key] ?? key;
    if (!values) return template;
    return Object.entries(values).reduce(
      (acc, [name, value]) => acc.replaceAll(`{${name}}`, String(value)),
      template,
    );
  };
}

const ALL_CODES = [
  "FREE_DAILY_AI_LIMIT_REACHED",
  "DAILY_REPORT_LIMIT_REACHED",
  "MONTHLY_REPORT_LIMIT_REACHED",
  "DIAGNOSTIC_ENGINE_DAILY_LIMIT_REACHED",
  "DIAGNOSTIC_ENGINE_MONTHLY_LIMIT_REACHED",
];

describe("formatLimitErrorMessage", () => {
  it("builds a translated sentence from code + limit for every known code", () => {
    const t = fakeTranslator({
      freeDailyAiLimitReached: "used {limit} free previews",
      dailyReportLimitReached: "used {limit} daily reports",
      monthlyReportLimitReached: "used {limit} monthly reports",
      diagnosticEngineDailyLimitReached: "used {limit} daily turns",
      diagnosticEngineMonthlyLimitReached: "used {limit} monthly turns",
    });

    expect(formatLimitErrorMessage({ code: "FREE_DAILY_AI_LIMIT_REACHED", limit: 3, message: "raw" }, t)).toBe(
      "used 3 free previews",
    );
    expect(formatLimitErrorMessage({ code: "DAILY_REPORT_LIMIT_REACHED", limit: 5, message: "raw" }, t)).toBe(
      "used 5 daily reports",
    );
    expect(formatLimitErrorMessage({ code: "MONTHLY_REPORT_LIMIT_REACHED", limit: 20, message: "raw" }, t)).toBe(
      "used 20 monthly reports",
    );
    expect(
      formatLimitErrorMessage({ code: "DIAGNOSTIC_ENGINE_DAILY_LIMIT_REACHED", limit: 10, message: "raw" }, t),
    ).toBe("used 10 daily turns");
    expect(
      formatLimitErrorMessage({ code: "DIAGNOSTIC_ENGINE_MONTHLY_LIMIT_REACHED", limit: 50, message: "raw" }, t),
    ).toBe("used 50 monthly turns");
  });

  it("every known code maps to a template that consumes {limit}", () => {
    const t = fakeTranslator({});
    for (const code of ALL_CODES) {
      const result = formatLimitErrorMessage({ code, limit: 7, message: "raw fallback" }, t);
      expect(result).not.toBe("raw fallback");
    }
  });

  it("falls back to the raw message for an unrecognized code", () => {
    const t = fakeTranslator({});
    expect(formatLimitErrorMessage({ code: "SOME_FUTURE_CODE", limit: 3, message: "raw fallback text" }, t)).toBe(
      "raw fallback text",
    );
  });

  it("falls back to the raw message when limit is missing, even for a known code", () => {
    const t = fakeTranslator({ freeDailyAiLimitReached: "used {limit} free previews" });
    expect(formatLimitErrorMessage({ code: "FREE_DAILY_AI_LIMIT_REACHED", message: "raw fallback text" }, t)).toBe(
      "raw fallback text",
    );
  });

  it("returns an empty string for a null/undefined error", () => {
    const t = fakeTranslator({});
    expect(formatLimitErrorMessage(undefined, t)).toBe("");
    expect(formatLimitErrorMessage(null, t)).toBe("");
  });
});
