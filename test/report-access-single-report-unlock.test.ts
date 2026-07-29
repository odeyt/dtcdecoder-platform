import { describe, expect, it, vi, beforeEach } from "vitest";

// Isolated unit test for the ONE new branch resolveReportAccess gained:
// a valid, unexpired single-report purchase forces accessLevel to "full"
// regardless of the viewer's plan. Every other dependency is stubbed —
// this deliberately does not re-verify resolveReportAccess's pre-existing
// behavior (that's untested elsewhere too, and out of scope for this
// change), only that the new getActiveSingleReportUnlock check correctly
// overrides the plan-derived access level before filterScanReportForAccessLevel
// is called.
const getEffectivePlanMock = vi.fn();
const getActiveSingleReportUnlockMock = vi.fn();
const filterScanReportForAccessLevelMock = vi.fn((params: { accessLevel: string }) => ({
  accessLevel: params.accessLevel,
  usage: {},
  visibleResult: {},
  lockedSections: [],
  upgradeRequired: params.accessLevel !== "full",
}));

vi.mock("@/lib/subscriptions", () => ({ getEffectivePlan: getEffectivePlanMock }));
vi.mock("@/lib/ai-diagnostics/single-report-purchases", () => ({
  getActiveSingleReportUnlock: getActiveSingleReportUnlockMock,
}));
vi.mock("@/lib/ai-diagnostics/usage", () => ({
  getAiDiagnosticUsageSummary: vi.fn().mockResolvedValue({
    accessLevel: "preview",
    previewsUsedToday: 0,
    previewDailyLimit: 0,
    fullReportsUsedToday: 0,
    fullReportsUsedThisMonth: 0,
    fullDailyLimit: 0,
    fullMonthlyLimit: 0,
  }),
}));
vi.mock("@/lib/ai-diagnostics/redaction", () => ({
  filterScanReportForAccessLevel: filterScanReportForAccessLevelMock,
}));
vi.mock("@/lib/scan-diagnostics/report-localization", () => ({
  getOrCreateLocalizedReport: vi.fn(),
}));
vi.mock("@/lib/scan-diagnostics/canonical-scan", () => ({
  buildCanonicalVehicleScan: vi.fn().mockReturnValue({ systems: [], derivedCategories: {} }),
}));
vi.mock("@/lib/scan-diagnostics/priority", () => ({
  computeDiagnosticPriority: vi.fn().mockReturnValue({}),
}));

const { resolveReportAccess } = await import("@/lib/scan-diagnostics/report-access");

function detailFixture() {
  return {
    case: {
      id: "case-1",
      report_language: "en",
    } as never,
    extraction: null,
    dtcRecords: [],
    systems: [],
    patterns: [],
    report: { id: "report-1", safety_warnings: [] } as never,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  filterScanReportForAccessLevelMock.mockImplementation((params: { accessLevel: string }) => ({
    accessLevel: params.accessLevel,
    usage: {},
    visibleResult: {},
    lockedSections: [],
    upgradeRequired: params.accessLevel !== "full",
  }));
});

describe("resolveReportAccess — single-report purchase unlock", () => {
  it("forces full access for a Free-tier viewer with a valid, unexpired unlock on this case", async () => {
    getEffectivePlanMock.mockResolvedValue("free");
    getActiveSingleReportUnlockMock.mockResolvedValue({
      expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const result = await resolveReportAccess("user-1", "user@example.com", detailFixture());

    expect(getActiveSingleReportUnlockMock).toHaveBeenCalledWith("case-1");
    expect(result?.accessLevel).toBe("full");
    expect(result?.upgradeRequired).toBe(false);
  });

  it("falls back to the plan-derived (preview) access level once no active unlock exists — e.g. after expiry", async () => {
    getEffectivePlanMock.mockResolvedValue("free");
    getActiveSingleReportUnlockMock.mockResolvedValue(null);

    const result = await resolveReportAccess("user-1", "user@example.com", detailFixture());

    expect(result?.accessLevel).toBe("preview");
    expect(result?.upgradeRequired).toBe(true);
  });

  it("a paid plan still resolves to full access on its own, independent of any unlock", async () => {
    getEffectivePlanMock.mockResolvedValue("pro");
    getActiveSingleReportUnlockMock.mockResolvedValue(null);

    const result = await resolveReportAccess("user-1", "user@example.com", detailFixture());

    expect(result?.accessLevel).toBe("full");
  });
});
