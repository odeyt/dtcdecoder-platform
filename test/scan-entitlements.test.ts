import { describe, expect, it } from "vitest";
import {
  canExportScanReport,
  canViewScanFeedbackHistory,
  scanMonthlyLimit,
} from "@/lib/scan-diagnostics/entitlements";
import type { SubscriptionPlan } from "@/lib/types";

const PLANS: SubscriptionPlan[] = ["free", "pro", "workshop"];

describe("scanMonthlyLimit", () => {
  it("returns 2 for free, 25 for pro, 100 for workshop", () => {
    expect(scanMonthlyLimit("free")).toBe(2);
    expect(scanMonthlyLimit("pro")).toBe(25);
    expect(scanMonthlyLimit("workshop")).toBe(100);
  });
});

describe("canExportScanReport", () => {
  it("is false for free, true for pro and workshop", () => {
    expect(canExportScanReport("free")).toBe(false);
    expect(canExportScanReport("pro")).toBe(true);
    expect(canExportScanReport("workshop")).toBe(true);
  });
});

describe("canViewScanFeedbackHistory", () => {
  it("is workshop-only", () => {
    for (const plan of PLANS) {
      expect(canViewScanFeedbackHistory(plan)).toBe(plan === "workshop");
    }
  });
});
