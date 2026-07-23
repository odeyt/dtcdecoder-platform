import { describe, expect, it } from "vitest";
import {
  allowedReportModes,
  canExportLocalizedReports,
  canSaveAiReportLocale,
  canSaveLanguagePreferences,
  canSelectAiReportLanguage,
  canSelectDefaultLanguage,
  canSelectDisplayCurrency,
  canSelectSecondaryLanguage,
  canUseBilingualReports,
  canUseMultilingualReports,
  canUseReportMode,
  maxReportLanguages,
} from "@/lib/i18n/entitlements";
import type { SubscriptionPlan } from "@/lib/types";

const PLANS: SubscriptionPlan[] = ["free", "pro", "workshop"];

describe("canSelectDefaultLanguage", () => {
  it("is available to every plan (static UI copy, no extra cost)", () => {
    for (const plan of PLANS) {
      expect(canSelectDefaultLanguage(plan)).toBe(true);
    }
  });
});

describe("paid-only AI/report entitlements", () => {
  const gatedFns = [
    canSelectAiReportLanguage,
    canUseBilingualReports,
    canSelectSecondaryLanguage,
    canSaveLanguagePreferences,
    canSaveAiReportLocale,
    canSelectDisplayCurrency,
  ];

  it("are denied for free and granted for pro and workshop", () => {
    for (const fn of gatedFns) {
      expect(fn("free")).toBe(false);
      expect(fn("pro")).toBe(true);
      expect(fn("workshop")).toBe(true);
    }
  });
});

describe("canUseMultilingualReports", () => {
  it("is workshop-only", () => {
    expect(canUseMultilingualReports("free")).toBe(false);
    expect(canUseMultilingualReports("pro")).toBe(false);
    expect(canUseMultilingualReports("workshop")).toBe(true);
  });
});

describe("canExportLocalizedReports", () => {
  it("is false for every plan — no export feature exists yet", () => {
    for (const plan of PLANS) {
      expect(canExportLocalizedReports(plan)).toBe(false);
    }
  });
});

describe("maxReportLanguages", () => {
  it("returns 0 for free, 2 for pro, 3 for workshop", () => {
    expect(maxReportLanguages("free")).toBe(0);
    expect(maxReportLanguages("pro")).toBe(2);
    expect(maxReportLanguages("workshop")).toBe(3);
  });
});

describe("allowedReportModes", () => {
  it("free gets single only", () => {
    expect(allowedReportModes("free")).toEqual(["single"]);
  });

  it("pro gets single + bilingual, not multilingual", () => {
    expect(allowedReportModes("pro")).toEqual(["single", "bilingual"]);
  });

  it("workshop gets all three modes", () => {
    expect(allowedReportModes("workshop")).toEqual(["single", "bilingual", "multilingual"]);
  });
});

describe("canUseReportMode", () => {
  it("matches allowedReportModes for every plan/mode combination", () => {
    const modes = ["single", "bilingual", "multilingual"] as const;
    for (const plan of PLANS) {
      for (const mode of modes) {
        expect(canUseReportMode(plan, mode)).toBe(allowedReportModes(plan).includes(mode));
      }
    }
  });

  it("blocks a free-plan user from bilingual mode even if requested directly", () => {
    expect(canUseReportMode("free", "bilingual")).toBe(false);
  });

  it("blocks a pro-plan user from multilingual mode even if requested directly", () => {
    expect(canUseReportMode("pro", "multilingual")).toBe(false);
  });
});
