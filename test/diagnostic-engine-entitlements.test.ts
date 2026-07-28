import { describe, expect, it, afterEach } from "vitest";
import {
  hasFeatureAccess,
  turnLimitsForPlan,
  accessLevelForPlan,
  resolveDiagnosticEngineAccess,
} from "@/lib/diagnostic-engine/entitlements";

afterEach(() => {
  delete process.env.DIAGNOSTIC_ENGINE_ALLOWED_EMAILS;
});

describe("hasFeatureAccess", () => {
  it("grants diagnostic_engine_turn to every plan (free included, via a small daily/monthly allowance)", () => {
    expect(hasFeatureAccess("free", "diagnostic_engine_turn")).toBe(true);
    expect(hasFeatureAccess("pro", "diagnostic_engine_turn")).toBe(true);
    expect(hasFeatureAccess("workshop", "diagnostic_engine_turn")).toBe(true);
  });

  it("gates repair_verification and advanced_test_planner behind a paid plan", () => {
    expect(hasFeatureAccess("free", "repair_verification")).toBe(false);
    expect(hasFeatureAccess("free", "advanced_test_planner")).toBe(false);
    expect(hasFeatureAccess("pro", "repair_verification")).toBe(true);
    expect(hasFeatureAccess("workshop", "advanced_test_planner")).toBe(true);
  });

  it("grants guided_diagnosis to every plan (the free-tier locked-preview experience, not a hard lock)", () => {
    expect(hasFeatureAccess("free", "guided_diagnosis")).toBe(true);
  });
});

describe("turnLimitsForPlan", () => {
  it("gives free a small, strictly capped daily/monthly allowance", () => {
    const limits = turnLimitsForPlan("free");
    expect(limits.dailyLimit).toBeGreaterThan(0);
    expect(limits.monthlyLimit).toBeGreaterThan(0);
  });

  it("gives paid plans a materially larger allowance than free", () => {
    const free = turnLimitsForPlan("free");
    const pro = turnLimitsForPlan("pro");
    const workshop = turnLimitsForPlan("workshop");
    expect(pro.dailyLimit!).toBeGreaterThan(free.dailyLimit!);
    expect(workshop.dailyLimit!).toBeGreaterThan(pro.dailyLimit!);
  });
});

describe("accessLevelForPlan", () => {
  it("is preview for free and full for paid plans, matching the existing scan-report/chat split", () => {
    expect(accessLevelForPlan("free")).toBe("preview");
    expect(accessLevelForPlan("pro")).toBe("full");
    expect(accessLevelForPlan("workshop")).toBe("full");
  });
});

describe("resolveDiagnosticEngineAccess", () => {
  it("resolves an ordinary free user to preview access with capped limits", () => {
    const access = resolveDiagnosticEngineAccess("nobody@example.com", "free");
    expect(access.isInternal).toBe(false);
    expect(access.accessLevel).toBe("preview");
    expect(access.limits.dailyLimit).not.toBeNull();
  });

  it("resolves an allowlisted internal tester to unlimited, but still-recorded, access regardless of plan", () => {
    process.env.DIAGNOSTIC_ENGINE_ALLOWED_EMAILS = "tester@example.com";
    const access = resolveDiagnosticEngineAccess("Tester@Example.com", "free");
    expect(access.isInternal).toBe(true);
    expect(access.accessLevel).toBe("internal");
    expect(access.limits).toEqual({ dailyLimit: null, monthlyLimit: null });
  });

  it("never treats a non-allowlisted email as internal even on the same domain", () => {
    process.env.DIAGNOSTIC_ENGINE_ALLOWED_EMAILS = "tester@example.com";
    const access = resolveDiagnosticEngineAccess("other@example.com", "free");
    expect(access.isInternal).toBe(false);
  });

  it("treats a null email as never internal", () => {
    process.env.DIAGNOSTIC_ENGINE_ALLOWED_EMAILS = "tester@example.com";
    const access = resolveDiagnosticEngineAccess(null, "workshop");
    expect(access.isInternal).toBe(false);
    expect(access.accessLevel).toBe("full");
  });
});
