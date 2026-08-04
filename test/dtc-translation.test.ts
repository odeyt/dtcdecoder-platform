import { describe, expect, it } from "vitest";
import {
  extractTranslatableStrings,
  applyTranslatedStrings,
  translateDtcCode,
  type DtcCodeTranslatable,
} from "@/lib/dtc-translation";
import type { LocalizedDiagnosticReport, TranslationProvider } from "@/lib/ai/translation-provider";

const canonical: DtcCodeTranslatable = {
  title: "P0420 — Catalyst System Efficiency Below Threshold",
  metaDescription: "What P0420 means and how to fix it",
  meaning: "The catalytic converter is no longer converting exhaust gases efficiently.",
  symptoms: ["Check engine light", "Failed emissions test"],
  causes: ["Deteriorated catalytic converter", "Downstream O2 sensor failure"],
  diagnosticSteps: ["Scan for additional codes", "Inspect exhaust for leaks"],
  commonMistakes: "Replacing the catalytic converter before ruling out the O2 sensor",
  faq: [{ q: "Is it safe to drive?", a: "Short-term yes, but schedule diagnosis soon." }],
};

function stubProvider(result: Partial<LocalizedDiagnosticReport> & Pick<LocalizedDiagnosticReport, "text">): TranslationProvider {
  return {
    id: "anthropic",
    model: "claude-sonnet-5",
    async translateDiagnosticReport(input) {
      return {
        reportId: input.canonicalReport.id,
        sourceLocale: "en",
        requestedLocale: input.targetLocale,
        resolvedLocale: input.targetLocale,
        provider: "anthropic",
        model: "claude-sonnet-5",
        glossaryVersion: input.glossaryVersion,
        promptVersion: input.promptVersion,
        status: "completed",
        fallbackUsed: false,
        missingTokens: [],
        translatedAt: "2026-08-01T00:00:00.000Z",
        latencyMs: 10,
        ...result,
      };
    },
  };
}

describe("extract/apply round-trip", () => {
  it("apply(extract) is the identity", () => {
    const strings = extractTranslatableStrings(canonical);
    expect(applyTranslatedStrings(canonical, strings)).toEqual(canonical);
  });

  it("extracts strings in a stable, complete order, skipping absent optional fields", () => {
    const withNulls: DtcCodeTranslatable = { ...canonical, metaDescription: null, commonMistakes: null };
    expect(extractTranslatableStrings(withNulls)).toEqual([
      "P0420 — Catalyst System Efficiency Below Threshold",
      "The catalytic converter is no longer converting exhaust gases efficiently.",
      "Check engine light",
      "Failed emissions test",
      "Deteriorated catalytic converter",
      "Downstream O2 sensor failure",
      "Scan for additional codes",
      "Inspect exhaust for leaks",
      "Is it safe to drive?",
      "Short-term yes, but schedule diagnosis soon.",
    ]);
  });

  it("round-trips correctly when optional fields are null", () => {
    const withNulls: DtcCodeTranslatable = { ...canonical, metaDescription: null, commonMistakes: null };
    const strings = extractTranslatableStrings(withNulls);
    const result = applyTranslatedStrings(withNulls, strings);
    expect(result.metaDescription).toBeNull();
    expect(result.commonMistakes).toBeNull();
  });

  it("throws on length mismatch", () => {
    expect(() => applyTranslatedStrings(canonical, ["only one"])).toThrow();
  });
});

describe("translateDtcCode", () => {
  const common = { dtcCodeId: "dtc-1", dtcCodeVersion: 1, canonical, glossaryVersion: "8", promptVersion: "v1" };

  it("reassembles a successful translation", async () => {
    const translated = extractTranslatableStrings(canonical).map((s) => `TH: ${s}`);
    const provider = stubProvider({ text: JSON.stringify(translated) });
    const r = await translateDtcCode({ ...common, targetLocale: "th", provider });
    expect(r.status).toBe("completed");
    expect(r.resolvedLocale).toBe("th");
    expect(r.localized.title).toBe("TH: P0420 — Catalyst System Efficiency Below Threshold");
    expect(r.localized.faq[0].a).toBe("TH: Short-term yes, but schedule diagnosis soon.");
  });

  it("falls back to English when the provider fell back (e.g. a protected token was dropped)", async () => {
    const provider = stubProvider({
      text: "P0420 …",
      resolvedLocale: "en",
      fallbackUsed: true,
      status: "fallback",
      missingTokens: ["P0420"],
    });
    const r = await translateDtcCode({ ...common, targetLocale: "th", provider });
    expect(r.status).toBe("fallback");
    expect(r.fallbackUsed).toBe(true);
    expect(r.localized).toEqual(canonical);
  });

  it("falls back to English on a length-mismatched translation", async () => {
    const provider = stubProvider({ text: JSON.stringify(["too", "few"]) });
    const r = await translateDtcCode({ ...common, targetLocale: "th", provider });
    expect(r.status).toBe("failed");
    expect(r.localized).toEqual(canonical);
  });

  it("falls back to English on non-JSON output", async () => {
    const provider = stubProvider({ text: "not json at all" });
    const r = await translateDtcCode({ ...common, targetLocale: "th", provider });
    expect(r.status).toBe("failed");
    expect(r.localized).toEqual(canonical);
  });

  it("serves the canonical for an English request", async () => {
    const provider = stubProvider({ text: "[]", resolvedLocale: "en", fallbackUsed: false });
    const r = await translateDtcCode({ ...common, targetLocale: "en", provider });
    expect(r.status).toBe("completed");
    expect(r.fallbackUsed).toBe(false);
    expect(r.localized).toEqual(canonical);
  });
});
