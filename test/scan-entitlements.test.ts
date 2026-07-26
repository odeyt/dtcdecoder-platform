import { describe, expect, it } from "vitest";
import {
  canExportScanReport,
  canViewScanFeedbackHistory,
  scanMonthlyLimit,
} from "@/lib/scan-diagnostics/entitlements";
import type { SubscriptionPlan } from "@/lib/types";

const PLANS: SubscriptionPlan[] = ["free", "pro", "workshop"];

describe("scanMonthlyLimit", () => {
  // Free never gets a full scan report (preview-only, gated by the separate
  // daily preview counter, not this monthly full-report limit).
  it("returns 0 for free, 20 for pro, 75 for workshop", () => {
    expect(scanMonthlyLimit("free")).toBe(0);
    expect(scanMonthlyLimit("pro")).toBe(20);
    expect(scanMonthlyLimit("workshop")).toBe(75);
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
