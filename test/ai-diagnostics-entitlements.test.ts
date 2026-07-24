import { describe, expect, it } from "vitest";
import {
  accessLevelForPlan,
  canAccessFullDiagnostics,
  canExportPdf,
  fullDailyLimit,
  fullMonthlyLimit,
  getEntitlements,
  previewDailyLimit,
  technicianSeatLimit,
} from "@/lib/ai-diagnostics/entitlements";
import type { SubscriptionPlan } from "@/lib/types";

const PLANS: SubscriptionPlan[] = ["free", "pro", "workshop"];

describe("getEntitlements", () => {
  it("matches the canonical field shape for every plan", () => {
    expect(getEntitlements("free")).toEqual({
      basicDtcLookup: true,
      aiDiagnosticPreviewDailyLimit: 2,
      fullDiagnosticMonthlyLimit: 0,
      fullDiagnosticDailyLimit: 0,
      technicianSeatLimit: 1,
      pdfExport: false,
      sharedCases: false,
      prioritySupport: false,
    });
    expect(getEntitlements("pro")).toEqual({
      basicDtcLookup: true,
      aiDiagnosticPreviewDailyLimit: null,
      fullDiagnosticMonthlyLimit: 30,
      fullDiagnosticDailyLimit: 5,
      technicianSeatLimit: 1,
      pdfExport: true,
      sharedCases: false,
      prioritySupport: false,
    });
    expect(getEntitlements("workshop")).toEqual({
      basicDtcLookup: true,
      aiDiagnosticPreviewDailyLimit: null,
      fullDiagnosticMonthlyLimit: 120,
      fullDiagnosticDailyLimit: 15,
      technicianSeatLimit: 3,
      pdfExport: true,
      sharedCases: false,
      prioritySupport: false,
    });
  });

  it("gives every plan unlimited basic DTC lookup", () => {
    for (const plan of PLANS) {
      expect(getEntitlements(plan).basicDtcLookup).toBe(true);
    }
  });
});

describe("canAccessFullDiagnostics / accessLevelForPlan", () => {
  it("free never gets full diagnostics — preview only", () => {
    expect(canAccessFullDiagnostics("free")).toBe(false);
    expect(accessLevelForPlan("free")).toBe("preview");
  });

  it("pro and workshop get full diagnostics", () => {
    expect(canAccessFullDiagnostics("pro")).toBe(true);
    expect(canAccessFullDiagnostics("workshop")).toBe(true);
    expect(accessLevelForPlan("pro")).toBe("full");
    expect(accessLevelForPlan("workshop")).toBe("full");
  });
});

describe("previewDailyLimit", () => {
  it("is 2 for free, null (unmetered by the preview counter) for paid plans", () => {
    expect(previewDailyLimit("free")).toBe(2);
    expect(previewDailyLimit("pro")).toBeNull();
    expect(previewDailyLimit("workshop")).toBeNull();
  });
});

describe("fullDailyLimit / fullMonthlyLimit", () => {
  it("matches the spec's exact numbers", () => {
    expect(fullDailyLimit("free")).toBe(0);
    expect(fullDailyLimit("pro")).toBe(5);
    expect(fullDailyLimit("workshop")).toBe(15);

    expect(fullMonthlyLimit("free")).toBe(0);
    expect(fullMonthlyLimit("pro")).toBe(30);
    expect(fullMonthlyLimit("workshop")).toBe(120);
  });
});

describe("canExportPdf", () => {
  it("is false for free, true for paid plans", () => {
    expect(canExportPdf("free")).toBe(false);
    expect(canExportPdf("pro")).toBe(true);
    expect(canExportPdf("workshop")).toBe(true);
  });
});

describe("technicianSeatLimit", () => {
  it("is 1 for free/pro, 3 for workshop", () => {
    expect(technicianSeatLimit("free")).toBe(1);
    expect(technicianSeatLimit("pro")).toBe(1);
    expect(technicianSeatLimit("workshop")).toBe(3);
  });
});
