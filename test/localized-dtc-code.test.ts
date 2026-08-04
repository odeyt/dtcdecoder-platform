import { describe, expect, it, vi } from "vitest";
import { resolveLocalizedDtcCode, type LocalizedDtcCodeDeps } from "@/lib/localized-dtc-code";
import type { DtcCodeTranslatable, LocalizedDtcCode } from "@/lib/dtc-translation";

const canonical: DtcCodeTranslatable = {
  title: "P0420",
  metaDescription: null,
  meaning: "Catalyst efficiency below threshold",
  symptoms: [],
  causes: [],
  diagnosticSteps: [],
  commonMistakes: null,
  faq: [],
};

const localizedTh: DtcCodeTranslatable = { ...canonical, meaning: "ประสิทธิภาพตัวเร่งปฏิกิริยาต่ำกว่าเกณฑ์" };

function baseDeps(over: Partial<LocalizedDtcCodeDeps> = {}): LocalizedDtcCodeDeps {
  return {
    isLocaleAllowed: vi.fn(async () => true),
    loadCache: vi.fn(async () => null),
    loadCanonical: vi.fn(async () => ({ canonical, version: 1 })),
    translate: vi.fn(
      async (): Promise<LocalizedDtcCode> => ({
        localized: localizedTh,
        resolvedLocale: "th",
        status: "completed",
        fallbackUsed: false,
        provider: "anthropic",
        model: "claude-sonnet-5",
        glossaryVersion: "8",
        promptVersion: "v1",
        translatedAt: "2026-08-01T00:00:00.000Z",
        latencyMs: 10,
        missingTokens: [],
      }),
    ),
    persist: vi.fn(async () => {}),
    ...over,
  };
}

const baseParams = { dtcCodeId: "dtc-1", targetLocale: "th" };

describe("resolveLocalizedDtcCode", () => {
  it("returns the canonical for an English request without translating", async () => {
    const deps = baseDeps();
    const r = await resolveLocalizedDtcCode(deps, { ...baseParams, targetLocale: "en" });
    expect(r.status).toBe("english");
    expect(r.localized).toEqual(canonical);
    expect(deps.translate).not.toHaveBeenCalled();
  });

  it("returns English when the locale isn't AI-output eligible — free-for-everyone, no plan check involved", async () => {
    const deps = baseDeps({ isLocaleAllowed: vi.fn(async () => false) });
    const r = await resolveLocalizedDtcCode(deps, baseParams);
    expect(r.status).toBe("not_eligible");
    expect(r.resolvedLocale).toBe("en");
    expect(deps.translate).not.toHaveBeenCalled();
  });

  it("serves a completed translation from cache without re-translating", async () => {
    const deps = baseDeps({ loadCache: vi.fn(async () => ({ localized: localizedTh, status: "completed" })) });
    const r = await resolveLocalizedDtcCode(deps, baseParams);
    expect(r.localized).toEqual(localizedTh);
    expect(deps.translate).not.toHaveBeenCalled();
  });

  it("does not serve a non-completed cache entry — re-translates instead", async () => {
    const deps = baseDeps({ loadCache: vi.fn(async () => ({ localized: canonical, status: "failed" })) });
    const r = await resolveLocalizedDtcCode(deps, baseParams);
    expect(deps.translate).toHaveBeenCalledOnce();
    expect(r.status).toBe("completed");
  });

  it("translates, persists, and returns the localized code", async () => {
    const deps = baseDeps();
    const r = await resolveLocalizedDtcCode(deps, baseParams);
    expect(r.status).toBe("completed");
    expect(r.resolvedLocale).toBe("th");
    expect(r.localized).toEqual(localizedTh);
    expect(deps.persist).toHaveBeenCalledOnce();
  });

  it("falls back to English when translation fails", async () => {
    const deps = baseDeps({
      translate: vi.fn(
        async (): Promise<LocalizedDtcCode> => ({
          localized: canonical,
          resolvedLocale: "en",
          status: "failed",
          fallbackUsed: true,
          provider: "anthropic",
          model: "claude-sonnet-5",
          glossaryVersion: "8",
          promptVersion: "v1",
          translatedAt: "2026-08-01T00:00:00.000Z",
          latencyMs: 5,
          missingTokens: ["P0420"],
        }),
      ),
    });
    const r = await resolveLocalizedDtcCode(deps, baseParams);
    expect(r.fallbackUsed).toBe(true);
    expect(r.resolvedLocale).toBe("en");
    expect(deps.persist).not.toHaveBeenCalled();
  });

  it("falls back to English if the provider throws", async () => {
    const deps = baseDeps({
      translate: vi.fn(async () => {
        throw new Error("timeout");
      }),
    });
    const r = await resolveLocalizedDtcCode(deps, baseParams);
    expect(r.status).toBe("failed");
    expect(r.resolvedLocale).toBe("en");
  });

  it("still serves the translation if persistence fails (cache write is non-fatal)", async () => {
    const deps = baseDeps({
      persist: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    const r = await resolveLocalizedDtcCode(deps, baseParams);
    expect(r.status).toBe("completed");
    expect(r.localized).toEqual(localizedTh);
  });

  it("returns an empty canonical shape when the row can't be loaded at all", async () => {
    const deps = baseDeps({ loadCanonical: vi.fn(async () => null) });
    const r = await resolveLocalizedDtcCode(deps, baseParams);
    expect(r.status).toBe("english");
    expect(r.localized.title).toBe("");
  });
});
