// Server-side redaction shared by both AI features. The security
// requirement this exists to satisfy: a free-tier client must never
// receive the locked/paid portion of an AI diagnostic result in ANY form
// (HTML, JSON, React props, client state) — a CSS blur over full content
// is not acceptable, because it's inspectable via DOM/devtools/view-source.
// Every function here strips fields structurally rather than merely hiding
// them, so there is nothing sensitive left in the object to find.
import type { ScanReport, ScanExtraction, ScanDtcRecord, ScanConfidenceLevel } from "@/lib/types";
import type { RankedCause, RecommendedTest } from "@/lib/scan-diagnostics/schemas";
import type { SafetyFinding } from "@/lib/scan-diagnostics/safety-rules";
import type { AiDiagnosticAccessLevel, AiDiagnosticUsageSummary } from "@/lib/ai-diagnostics/usage";

// Static section titles for the "locked" cards shown below a free preview.
// Titles only — never real diagnostic text — per the visual-design
// requirement that locked placeholders must be generated/static, not
// derived from hidden data.
export const LOCKED_SECTION_CATALOG = [
  { key: "rootCauseRanking", title: "Complete Root-Cause Ranking" },
  { key: "diagnosticPlan", title: "Step-by-Step Diagnostic Plan" },
  { key: "expectedReadings", title: "Expected Test Readings" },
  { key: "programmingRequirements", title: "Programming and Calibration" },
  { key: "laborGuidance", title: "Detailed Labor Guidance" },
  { key: "downloadableReport", title: "Downloadable Diagnostic Report" },
] as const;

export type LockedSectionKey = (typeof LOCKED_SECTION_CATALOG)[number]["key"];

export interface LockedSectionRef {
  key: LockedSectionKey;
  title: string;
}

interface VehicleSummary {
  vin: string | null;
  make: string | null;
  model: string | null;
  modelYear: number | null;
  engine: string | null;
  odometerMiles: number | null;
}

interface DtcSummary {
  module: string | null;
  code: string;
  status: string | null;
}

export interface ScanReportVisibleResult {
  vehicleSummary: VehicleSummary;
  dtcs: DtcSummary[];
  safety: { findings: SafetyFinding[] };
  // Schema version isn't sensitive/paid content — always present so the UI
  // can still detect a pre-v2 legacy report (see isLegacyReport in
  // report-presentation.ts) regardless of access level.
  schemaVersion: ScanReport["schema_version"];
  // Present only when accessLevel === "full" — structurally absent
  // (not just empty) from a preview response.
  rankedCauses?: RankedCause[];
  recommendedTests?: RecommendedTest[];
  confidenceLevel?: ScanConfidenceLevel | null;
  confidenceRationale?: string[];
  missingInformation?: string[];
}

export interface PreviewUsage {
  dailyLimit: number;
  usedToday: number;
  remainingToday: number;
}

export interface FullUsage {
  dailyLimit: number;
  dailyUsedToday: number;
  monthlyLimit: number;
  monthlyUsedThisMonth: number;
}

export interface ScanReportAccessResult {
  accessLevel: AiDiagnosticAccessLevel;
  usage: PreviewUsage | FullUsage;
  visibleResult: ScanReportVisibleResult;
  lockedSections: LockedSectionRef[];
  upgradeRequired: boolean;
}

function vehicleSummaryFrom(extraction: ScanExtraction | null): VehicleSummary {
  return {
    vin: extraction?.vin ?? null,
    make: extraction?.make ?? null,
    model: extraction?.model ?? null,
    modelYear: extraction?.model_year ?? null,
    engine: extraction?.engine ?? null,
    odometerMiles: extraction?.odometer_miles ?? null,
  };
}

function dtcSummariesFrom(dtcRecords: ScanDtcRecord[]): DtcSummary[] {
  return dtcRecords.map((r) => ({ module: r.module, code: r.code, status: r.status }));
}

// Shapes the persisted (always-full) report + case context into exactly
// what a client at this access level is allowed to receive. Never called
// with client-supplied plan/access data — accessLevel and usage must
// already have been resolved server-side from the authenticated user's
// real subscription (see src/lib/ai-diagnostics/usage.ts /
// getEffectivePlan).
export function filterScanReportForAccessLevel(params: {
  report: ScanReport;
  extraction: ScanExtraction | null;
  dtcRecords: ScanDtcRecord[];
  accessLevel: AiDiagnosticAccessLevel;
  usage: AiDiagnosticUsageSummary;
}): ScanReportAccessResult {
  const { report, extraction, dtcRecords, accessLevel, usage } = params;

  const base: Pick<ScanReportVisibleResult, "vehicleSummary" | "dtcs" | "safety" | "schemaVersion"> = {
    vehicleSummary: vehicleSummaryFrom(extraction),
    dtcs: dtcSummariesFrom(dtcRecords),
    safety: { findings: report.safety_warnings as unknown as SafetyFinding[] },
    schemaVersion: report.schema_version,
  };

  if (accessLevel === "full") {
    return {
      accessLevel,
      usage: {
        dailyLimit: usage.fullDailyLimit,
        dailyUsedToday: usage.fullReportsUsedToday,
        monthlyLimit: usage.fullMonthlyLimit,
        monthlyUsedThisMonth: usage.fullReportsUsedThisMonth,
      },
      visibleResult: {
        ...base,
        rankedCauses: report.ranked_causes as unknown as RankedCause[],
        recommendedTests: report.recommended_tests as unknown as RecommendedTest[],
        confidenceLevel: report.confidence_level,
        confidenceRationale: report.confidence_rationale,
        missingInformation: report.missing_information,
      },
      lockedSections: [],
      upgradeRequired: false,
    };
  }

  // No real AI-generated content is ever shown at this access level — the
  // Free plan gets zero AI diagnostic report generations
  // (aiDiagnosticPreviewDailyLimit = 0 in src/lib/pricing.ts), so the only
  // way to reach this branch at all is a paid-plan report being viewed
  // AFTER the owner has downgraded to Free. Per the product requirement
  // ("No saved cases" on Free), that owner sees only the deterministic,
  // non-AI base fields above plus the locked-section catalog — never a
  // slice of their old report's real findings.
  return {
    accessLevel,
    usage: {
      dailyLimit: usage.previewDailyLimit ?? 0,
      usedToday: usage.previewsUsedToday,
      remainingToday: Math.max(0, (usage.previewDailyLimit ?? 0) - usage.previewsUsedToday),
    },
    visibleResult: base,
    lockedSections: LOCKED_SECTION_CATALOG.map(({ key, title }) => ({ key, title })),
    upgradeRequired: true,
  };
}

export const CHAT_FULL_MAX_TOKENS = 2048;
