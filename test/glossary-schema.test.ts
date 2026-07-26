import { describe, expect, it } from "vitest";
import { glossaryEntrySchema, resolveReviewedAt } from "@/lib/glossary-schema";

const valid = {
  termEn: "Powertrain Control Module",
  localeCode: "es",
  translatedTerm: "Módulo de control del tren motriz",
  doNotTranslate: false,
  safetyCritical: false,
  reviewStatus: "approved" as const,
  acronym: "PCM",
  category: "engine_management",
  manufacturerContext: "Toyota",
  systemContext: "engine",
  alternativeTranslation: "Módulo PCM",
  reviewedBy: "j.tech",
};

describe("glossaryEntrySchema", () => {
  it("accepts a complete entry incl. the new fields", () => {
    const r = glossaryEntrySchema.parse(valid);
    expect(r.acronym).toBe("PCM");
    expect(r.manufacturerContext).toBe("Toyota");
    expect(r.systemContext).toBe("engine");
    expect(r.alternativeTranslation).toBe("Módulo PCM");
  });

  it("requires the canonical term and translation", () => {
    expect(() => glossaryEntrySchema.parse({ ...valid, termEn: "" })).toThrow();
    expect(() => glossaryEntrySchema.parse({ ...valid, translatedTerm: "" })).toThrow();
  });

  it("collapses blank optional fields to undefined (stored as NULL)", () => {
    const r = glossaryEntrySchema.parse({ ...valid, acronym: "   ", manufacturerContext: "" });
    expect(r.acronym).toBeUndefined();
    expect(r.manufacturerContext).toBeUndefined();
  });

  it("enforces input length limits (defense-in-depth)", () => {
    expect(() => glossaryEntrySchema.parse({ ...valid, acronym: "X".repeat(51) })).toThrow();
    expect(() => glossaryEntrySchema.parse({ ...valid, termEn: "X".repeat(201) })).toThrow();
  });

  it("rejects an invalid review status", () => {
    expect(() => glossaryEntrySchema.parse({ ...valid, reviewStatus: "published" })).toThrow();
  });
});

describe("resolveReviewedAt", () => {
  const fixed = () => new Date("2026-07-26T00:00:00.000Z");

  it("stamps a review time for reviewed/approved entries", () => {
    expect(resolveReviewedAt("approved", fixed)).toBe("2026-07-26T00:00:00.000Z");
    expect(resolveReviewedAt("reviewed", fixed)).toBe("2026-07-26T00:00:00.000Z");
  });

  it("is null for drafts", () => {
    expect(resolveReviewedAt("draft", fixed)).toBeNull();
  });
});
