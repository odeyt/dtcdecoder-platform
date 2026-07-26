import { describe, expect, it, vi } from "vitest";
import { resolveLocalizedReport, type LocalizedReportDeps } from "@/lib/scan-diagnostics/localized-report";
import type { ScanReportTranslatable, LocalizedScanReport } from "@/lib/scan-diagnostics/report-translation";

const canonical: ScanReportTranslatable = {
  rankedCauses: [
    { cause: "Catalyst", confidenceLevel: "medium", rationale: "P0420", supportingEvidence: [], contradictingEvidence: [], confirmationTestsRequired: [] },
  ],
  recommendedTests: [{ step: "Read data", purpose: "Compare", expectedResult: "Switching" }],
  missingInformation: [],
};

const localizedEs: ScanReportTranslatable = {
  ...canonical,
  rankedCauses: [{ ...canonical.rankedCauses[0], cause: "Catalizador" }],
};

function baseDeps(over: Partial<LocalizedReportDeps> = {}): LocalizedReportDeps {
  return {
    isLocaleAllowed: vi.fn(async () => true),
    loadCache: vi.fn(async () => null),
    loadCanonical: vi.fn(async () => ({ canonical, version: 1 })),
    translate: vi.fn(async (): Promise<LocalizedScanReport> => ({
      localized: localizedEs,
      resolvedLocale: "es",
      status: "completed",
      fallbackUsed: false,
      provider: "anthropic",
      model: "claude-sonnet-5",
      glossaryVersion: "7",
      promptVersion: "2",
      translatedAt: "2026-07-26T00:00:00.000Z",
      latencyMs: 10,
      missingTokens: [],
    })),
    persist: vi.fn(async () => {}),
    reserveUsage: vi.fn(async () => true),
    releaseUsage: vi.fn(async () => {}),
    ...over,
  };
}

describe("resolveLocalizedReport", () => {
  it("returns the canonical for an English request without translating", async () => {
    const deps = baseDeps();
    const r = await resolveLocalizedReport(deps, { reportId: "r1", targetLocale: "en" });
    expect(r.status).toBe("english");
    expect(r.localized).toEqual(canonical);
    expect(deps.translate).not.toHaveBeenCalled();
    expect(deps.reserveUsage).not.toHaveBeenCalled();
  });

  it("returns English when the locale is not entitled", async () => {
    const deps = baseDeps({ isLocaleAllowed: vi.fn(async () => false) });
    const r = await resolveLocalizedReport(deps, { reportId: "r1", targetLocale: "es" });
    expect(r.status).toBe("not_entitled");
    expect(r.resolvedLocale).toBe("en");
    expect(deps.translate).not.toHaveBeenCalled();
  });

  it("serves a completed translation from cache without re-translating", async () => {
    const deps = baseDeps({ loadCache: vi.fn(async () => ({ localized: localizedEs, status: "completed" })) });
    const r = await resolveLocalizedReport(deps, { reportId: "r1", targetLocale: "es" });
    expect(r.localized).toEqual(localizedEs);
    expect(deps.translate).not.toHaveBeenCalled();
    expect(deps.reserveUsage).not.toHaveBeenCalled();
  });

  it("translates, persists, and returns the localized report", async () => {
    const deps = baseDeps();
    const r = await resolveLocalizedReport(deps, { reportId: "r1", targetLocale: "es" });
    expect(r.status).toBe("completed");
    expect(r.resolvedLocale).toBe("es");
    expect(r.localized).toEqual(localizedEs);
    expect(deps.persist).toHaveBeenCalledOnce();
    expect(deps.releaseUsage).not.toHaveBeenCalled();
  });

  it("falls back to English and RELEASES the reservation when translation fails", async () => {
    const deps = baseDeps({
      translate: vi.fn(async (): Promise<LocalizedScanReport> => ({
        localized: canonical,
        resolvedLocale: "en",
        status: "failed",
        fallbackUsed: true,
        provider: "anthropic",
        model: "claude-sonnet-5",
        glossaryVersion: "7",
        promptVersion: "2",
        translatedAt: "2026-07-26T00:00:00.000Z",
        latencyMs: 5,
        missingTokens: ["P0420"],
      })),
    });
    const r = await resolveLocalizedReport(deps, { reportId: "r1", targetLocale: "es" });
    expect(r.fallbackUsed).toBe(true);
    expect(r.resolvedLocale).toBe("en");
    expect(deps.releaseUsage).toHaveBeenCalledOnce();
    expect(deps.persist).not.toHaveBeenCalled();
  });

  it("releases the reservation and falls back if the provider throws", async () => {
    const deps = baseDeps({ translate: vi.fn(async () => { throw new Error("timeout"); }) });
    const r = await resolveLocalizedReport(deps, { reportId: "r1", targetLocale: "es" });
    expect(r.status).toBe("failed");
    expect(r.resolvedLocale).toBe("en");
    expect(deps.releaseUsage).toHaveBeenCalledOnce();
  });

  it("falls back to English when over the usage limit (no reservation)", async () => {
    const deps = baseDeps({ reserveUsage: vi.fn(async () => false) });
    const r = await resolveLocalizedReport(deps, { reportId: "r1", targetLocale: "es" });
    expect(r.fallbackUsed).toBe(true);
    expect(r.resolvedLocale).toBe("en");
    expect(deps.translate).not.toHaveBeenCalled();
  });

  it("still serves the translation if persistence fails (cache write is non-fatal)", async () => {
    const deps = baseDeps({ persist: vi.fn(async () => { throw new Error("db down"); }) });
    const r = await resolveLocalizedReport(deps, { reportId: "r1", targetLocale: "es" });
    expect(r.status).toBe("completed");
    expect(r.localized).toEqual(localizedEs);
  });
});
