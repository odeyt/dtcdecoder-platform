import { describe, expect, it, vi } from "vitest";
import { resolveLocalizedTurn, type LocalizedTurnDeps } from "@/lib/diagnostic-engine/localized-turn";
import type { DiagnosticTurnTranslatable, LocalizedDiagnosticTurn } from "@/lib/diagnostic-engine/turn-translation";

const canonical: DiagnosticTurnTranslatable = {
  hypotheses: [
    {
      rank: 1,
      hypothesis: "Vacuum leak",
      confidenceLevel: "medium",
      reasoning: "Lean code",
      evidenceStrength: "moderate",
      supportingEvidenceIds: [],
      missingEvidence: [],
      requiredTests: [],
    },
  ],
  testPlan: [],
};

const localizedTh: DiagnosticTurnTranslatable = {
  ...canonical,
  hypotheses: [{ ...canonical.hypotheses[0], hypothesis: "รอยรั่วสุญญากาศ" }],
};

function baseDeps(over: Partial<LocalizedTurnDeps> = {}): LocalizedTurnDeps {
  return {
    isLocaleAllowed: vi.fn(async () => true),
    loadCache: vi.fn(async () => null),
    translate: vi.fn(
      async (): Promise<LocalizedDiagnosticTurn> => ({
        localized: localizedTh,
        resolvedLocale: "th",
        status: "completed",
        fallbackUsed: false,
        provider: "openai",
        model: "gpt-test-model",
        glossaryVersion: "8",
        promptVersion: "v1",
        translatedAt: "2026-08-01T00:00:00.000Z",
        latencyMs: 10,
        missingTokens: [],
      }),
    ),
    persist: vi.fn(async () => {}),
    reserveUsage: vi.fn(async () => true),
    releaseUsage: vi.fn(async () => {}),
    ...over,
  };
}

const baseParams = { turnCacheKey: "case-1:abc", version: 1, canonical };

describe("resolveLocalizedTurn", () => {
  it("returns the canonical for an English request without translating", async () => {
    const deps = baseDeps();
    const r = await resolveLocalizedTurn(deps, { ...baseParams, targetLocale: "en" });
    expect(r.status).toBe("english");
    expect(r.localized).toEqual(canonical);
    expect(deps.translate).not.toHaveBeenCalled();
    expect(deps.reserveUsage).not.toHaveBeenCalled();
  });

  it("returns English when the locale is not entitled", async () => {
    const deps = baseDeps({ isLocaleAllowed: vi.fn(async () => false) });
    const r = await resolveLocalizedTurn(deps, { ...baseParams, targetLocale: "th" });
    expect(r.status).toBe("not_entitled");
    expect(r.resolvedLocale).toBe("en");
    expect(deps.translate).not.toHaveBeenCalled();
  });

  it("serves a completed translation from cache without re-translating (same content -> same cache key -> hit)", async () => {
    const deps = baseDeps({ loadCache: vi.fn(async () => ({ localized: localizedTh, status: "completed" })) });
    const r = await resolveLocalizedTurn(deps, { ...baseParams, targetLocale: "th" });
    expect(r.localized).toEqual(localizedTh);
    expect(deps.translate).not.toHaveBeenCalled();
    expect(deps.reserveUsage).not.toHaveBeenCalled();
  });

  it("translates, persists, and returns the localized turn", async () => {
    const deps = baseDeps();
    const r = await resolveLocalizedTurn(deps, { ...baseParams, targetLocale: "th" });
    expect(r.status).toBe("completed");
    expect(r.resolvedLocale).toBe("th");
    expect(r.localized).toEqual(localizedTh);
    expect(deps.persist).toHaveBeenCalledOnce();
    expect(deps.releaseUsage).not.toHaveBeenCalled();
  });

  it("falls back to English and releases the reservation when translation fails", async () => {
    const deps = baseDeps({
      translate: vi.fn(
        async (): Promise<LocalizedDiagnosticTurn> => ({
          localized: canonical,
          resolvedLocale: "en",
          status: "failed",
          fallbackUsed: true,
          provider: "openai",
          model: "gpt-test-model",
          glossaryVersion: "8",
          promptVersion: "v1",
          translatedAt: "2026-08-01T00:00:00.000Z",
          latencyMs: 5,
          missingTokens: ["P0171"],
        }),
      ),
    });
    const r = await resolveLocalizedTurn(deps, { ...baseParams, targetLocale: "th" });
    expect(r.fallbackUsed).toBe(true);
    expect(r.resolvedLocale).toBe("en");
    expect(deps.releaseUsage).toHaveBeenCalledOnce();
    expect(deps.persist).not.toHaveBeenCalled();
  });

  it("releases the reservation and falls back if the provider throws", async () => {
    const deps = baseDeps({
      translate: vi.fn(async () => {
        throw new Error("timeout");
      }),
    });
    const r = await resolveLocalizedTurn(deps, { ...baseParams, targetLocale: "th" });
    expect(r.status).toBe("failed");
    expect(r.resolvedLocale).toBe("en");
    expect(deps.releaseUsage).toHaveBeenCalledOnce();
  });

  it("falls back to English when over the usage limit (no reservation)", async () => {
    const deps = baseDeps({ reserveUsage: vi.fn(async () => false) });
    const r = await resolveLocalizedTurn(deps, { ...baseParams, targetLocale: "th" });
    expect(r.fallbackUsed).toBe(true);
    expect(r.resolvedLocale).toBe("en");
    expect(deps.translate).not.toHaveBeenCalled();
  });

  it("still serves the translation if persistence fails (cache write is non-fatal)", async () => {
    const deps = baseDeps({
      persist: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    const r = await resolveLocalizedTurn(deps, { ...baseParams, targetLocale: "th" });
    expect(r.status).toBe("completed");
    expect(r.localized).toEqual(localizedTh);
  });
});
