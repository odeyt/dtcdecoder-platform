import { describe, expect, it } from "vitest";
import {
  TextTranslationProvider,
  localizedReportCacheKey,
  type ReportTranslateStep,
  type TranslateReportInput,
} from "@/lib/ai/translation-provider";

const CANONICAL =
  "P0420 catalyst efficiency below threshold on Bank 1 Sensor 2. Check the PCM ground; expect 12 V.";

function makeInput(targetLocale: string): TranslateReportInput {
  return {
    canonicalReport: { id: "rep-1", version: 3, text: CANONICAL },
    targetLocale,
    sourceLocale: "en",
    glossaryVersion: "7",
    promptVersion: "2",
  };
}

// Deterministic clock: each call advances by 5ms.
function fakeClock() {
  let t = 1000;
  return () => {
    t += 5;
    return t;
  };
}

describe("TextTranslationProvider", () => {
  it("serves the canonical directly for an English request (not a fallback)", async () => {
    const translate: ReportTranslateStep = async () => {
      throw new Error("should not be called for en");
    };
    const provider = new TextTranslationProvider(translate, fakeClock());
    const r = await provider.translateDiagnosticReport(makeInput("en"));
    expect(r.resolvedLocale).toBe("en");
    expect(r.text).toBe(CANONICAL);
    expect(r.fallbackUsed).toBe(false);
    expect(r.status).toBe("completed");
  });

  it("returns the translation and full metadata on success", async () => {
    const translate: ReportTranslateStep = async () =>
      "P0420 eficiencia del catalizador por debajo del umbral en Bank 1 Sensor 2. Revise la tierra del PCM; se esperan 12 V.";
    const provider = new TextTranslationProvider(translate, fakeClock());
    const r = await provider.translateDiagnosticReport(makeInput("es"));
    expect(r.resolvedLocale).toBe("es");
    expect(r.fallbackUsed).toBe(false);
    expect(r.status).toBe("completed");
    expect(r.provider).toBe("openai");
    expect(r.glossaryVersion).toBe("7");
    expect(r.promptVersion).toBe("2");
    expect(r.latencyMs).toBeGreaterThan(0);
    expect(r.translatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(r.missingTokens).toEqual([]);
  });

  it("falls back to English when the translation drops a protected token", async () => {
    // Missing P0420 and altered PCM.
    const translate: ReportTranslateStep = async () =>
      "eficiencia del catalizador por debajo del umbral en Bank 1 Sensor 2. Revise la tierra del módulo; se esperan 12 V.";
    const provider = new TextTranslationProvider(translate, fakeClock());
    const r = await provider.translateDiagnosticReport(makeInput("es"));
    expect(r.status).toBe("fallback");
    expect(r.fallbackUsed).toBe(true);
    expect(r.resolvedLocale).toBe("en");
    expect(r.text).toBe(CANONICAL);
    expect(r.missingTokens).toContain("P0420");
  });

  it("strips a markdown code fence wrapping the whole response before validating/returning it", async () => {
    // Real regression: Claude wrapped a translated response in ```json
    // fences despite the prompt explicitly saying not to — every caller's
    // JSON.parse(result.text) then failed. The fence must be stripped
    // before token-preservation validation and before the text is returned,
    // not left for each of the three callers to defend against separately.
    const translate: ReportTranslateStep = async () =>
      "```json\nP0420 eficiencia del catalizador por debajo del umbral en Bank 1 Sensor 2. Revise la tierra del PCM; se esperan 12 V.\n```";
    const provider = new TextTranslationProvider(translate, fakeClock());
    const r = await provider.translateDiagnosticReport(makeInput("es"));
    expect(r.status).toBe("completed");
    expect(r.text).not.toContain("```");
    expect(r.text.startsWith("P0420")).toBe(true);
  });

  it("leaves a response with no fence untouched", async () => {
    const translate: ReportTranslateStep = async () =>
      "P0420 eficiencia del catalizador por debajo del umbral en Bank 1 Sensor 2. Revise la tierra del PCM; se esperan 12 V.";
    const provider = new TextTranslationProvider(translate, fakeClock());
    const r = await provider.translateDiagnosticReport(makeInput("es"));
    expect(r.status).toBe("completed");
    expect(r.text).toBe(
      "P0420 eficiencia del catalizador por debajo del umbral en Bank 1 Sensor 2. Revise la tierra del PCM; se esperan 12 V.",
    );
  });

  it("does not strip a ``` that appears inside the translated content itself, only a fence wrapping the whole response", async () => {
    const inline = "P0420: código ```especial``` en Bank 1 Sensor 2. PCM 12 V.";
    const translate: ReportTranslateStep = async () => inline;
    const provider = new TextTranslationProvider(translate, fakeClock());
    const r = await provider.translateDiagnosticReport(makeInput("es"));
    expect(r.text).toBe(inline);
  });

  it("falls back to English (status failed) when the provider throws", async () => {
    const translate: ReportTranslateStep = async () => {
      throw new Error("timeout");
    };
    const provider = new TextTranslationProvider(translate, fakeClock());
    const r = await provider.translateDiagnosticReport(makeInput("ja"));
    expect(r.status).toBe("failed");
    expect(r.fallbackUsed).toBe(true);
    expect(r.resolvedLocale).toBe("en");
    expect(r.text).toBe(CANONICAL);
  });
});

describe("localizedReportCacheKey", () => {
  const base = {
    canonicalReportId: "rep-1",
    reportVersion: 3,
    targetLocale: "es",
    glossaryVersion: "7",
    promptVersion: "2",
    provider: "anthropic",
    model: "claude-sonnet-5",
  };

  it("is deterministic", () => {
    expect(localizedReportCacheKey(base)).toBe(localizedReportCacheKey(base));
  });

  it("changes when any version dimension changes", () => {
    const k = localizedReportCacheKey(base);
    expect(localizedReportCacheKey({ ...base, reportVersion: 4 })).not.toBe(k);
    expect(localizedReportCacheKey({ ...base, glossaryVersion: "8" })).not.toBe(k);
    expect(localizedReportCacheKey({ ...base, promptVersion: "3" })).not.toBe(k);
    expect(localizedReportCacheKey({ ...base, provider: "openai" })).not.toBe(k);
    expect(localizedReportCacheKey({ ...base, model: "claude-opus-5" })).not.toBe(k);
    expect(localizedReportCacheKey({ ...base, targetLocale: "de" })).not.toBe(k);
  });
});
