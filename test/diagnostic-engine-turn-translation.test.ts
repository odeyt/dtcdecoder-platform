import { describe, expect, it } from "vitest";
import {
  extractTranslatableStrings,
  applyTranslatedStrings,
  translateDiagnosticTurn,
  type DiagnosticTurnTranslatable,
} from "@/lib/diagnostic-engine/turn-translation";
import type { LocalizedDiagnosticReport, TranslationProvider } from "@/lib/ai/translation-provider";

const canonical: DiagnosticTurnTranslatable = {
  hypotheses: [
    {
      rank: 1,
      hypothesis: "Vacuum leak downstream of the MAF sensor",
      confidenceLevel: "medium",
      reasoning: "Lean bank-1 code with no fuel-trim correction at idle",
      evidenceStrength: "moderate",
      supportingEvidenceIds: ["ev-1"],
      missingEvidence: ["Smoke test result"],
      requiredTests: ["Smoke-test the intake tract"],
    },
  ],
  testPlan: [
    {
      rank: 1,
      step: "Smoke test the intake tract",
      purpose: "Locate the vacuum leak",
      expectedResult: "Visible smoke escaping at the leak point",
      difficulty: "moderate",
      risk: "low",
      costLevel: "moderate",
      relatedHypothesisRanks: [1],
    },
  ],
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

  it("extracts strings in a stable, complete order, excluding non-prose fields", () => {
    expect(extractTranslatableStrings(canonical)).toEqual([
      "Vacuum leak downstream of the MAF sensor",
      "Lean bank-1 code with no fuel-trim correction at idle",
      "Smoke test result",
      "Smoke-test the intake tract",
      "Smoke test the intake tract",
      "Locate the vacuum leak",
      "Visible smoke escaping at the leak point",
    ]);
  });

  it("never extracts rank/confidenceLevel/evidenceStrength/difficulty/risk/costLevel — those are preserved, not translated", () => {
    const strings = extractTranslatableStrings(canonical);
    expect(strings).not.toContain(1);
    expect(strings).not.toContain("medium");
    expect(strings).not.toContain("moderate"); // would also match difficulty/costLevel if extracted
  });

  it("throws on length mismatch", () => {
    expect(() => applyTranslatedStrings(canonical, ["only one"])).toThrow();
  });

  it("preserves rank/confidence/evidence/difficulty/risk/cost/relatedHypothesisRanks exactly after applying a translation", () => {
    const translated = extractTranslatableStrings(canonical).map((s) => `TH: ${s}`);
    const result = applyTranslatedStrings(canonical, translated);
    expect(result.hypotheses[0].rank).toBe(1);
    expect(result.hypotheses[0].confidenceLevel).toBe("medium");
    expect(result.hypotheses[0].evidenceStrength).toBe("moderate");
    expect(result.hypotheses[0].supportingEvidenceIds).toEqual(["ev-1"]);
    expect(result.testPlan[0].difficulty).toBe("moderate");
    expect(result.testPlan[0].risk).toBe("low");
    expect(result.testPlan[0].costLevel).toBe("moderate");
    expect(result.testPlan[0].relatedHypothesisRanks).toEqual([1]);
  });
});

describe("translateDiagnosticTurn", () => {
  const common = { turnCacheKey: "case-1:abc123", turnVersion: 1, canonical, glossaryVersion: "8", promptVersion: "v1" };

  it("reassembles a successful translation", async () => {
    const translated = extractTranslatableStrings(canonical).map((s) => `TH: ${s}`);
    const provider = stubProvider({ text: JSON.stringify(translated) });
    const r = await translateDiagnosticTurn({ ...common, targetLocale: "th", provider });
    expect(r.status).toBe("completed");
    expect(r.resolvedLocale).toBe("th");
    expect(r.localized.hypotheses[0].hypothesis).toBe("TH: Vacuum leak downstream of the MAF sensor");
    expect(r.localized.testPlan[0].expectedResult).toBe("TH: Visible smoke escaping at the leak point");
  });

  it("falls back to English when the provider fell back (e.g. a protected token was dropped)", async () => {
    const provider = stubProvider({
      text: "P0171 …",
      resolvedLocale: "en",
      fallbackUsed: true,
      status: "fallback",
      missingTokens: ["P0171"],
    });
    const r = await translateDiagnosticTurn({ ...common, targetLocale: "th", provider });
    expect(r.status).toBe("fallback");
    expect(r.fallbackUsed).toBe(true);
    expect(r.localized).toEqual(canonical);
  });

  it("falls back to English on a length-mismatched translation", async () => {
    const provider = stubProvider({ text: JSON.stringify(["too", "few"]) });
    const r = await translateDiagnosticTurn({ ...common, targetLocale: "th", provider });
    expect(r.status).toBe("failed");
    expect(r.localized).toEqual(canonical);
  });

  it("falls back to English on non-JSON output", async () => {
    const provider = stubProvider({ text: "not json at all" });
    const r = await translateDiagnosticTurn({ ...common, targetLocale: "th", provider });
    expect(r.status).toBe("failed");
    expect(r.localized).toEqual(canonical);
  });

  it("serves the canonical for an English request", async () => {
    const provider = stubProvider({ text: "[]", resolvedLocale: "en", fallbackUsed: false });
    const r = await translateDiagnosticTurn({ ...common, targetLocale: "en", provider });
    expect(r.status).toBe("completed");
    expect(r.fallbackUsed).toBe(false);
    expect(r.localized).toEqual(canonical);
  });
});
