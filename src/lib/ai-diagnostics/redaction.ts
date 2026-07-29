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
import type { CanonicalVehicleScan } from "@/lib/scan-diagnostics/canonical-scan";
import type { DetectedPattern } from "@/lib/scan-diagnostics/patterns";
import type { DiagnosticPriority } from "@/lib/scan-diagnostics/priority";

// Static section titles for the "locked" cards shown below a free preview.
// Titles only — never real diagnostic text — per the visual-design
// requirement that locked placeholders must be generated/static, not
// derived from hidden data.
export const LOCKED_SECTION_CATALOG = [
  { key: "rootCauseRanking", title: "Complete Root-Cause Ranking" },
  { key: "diagnosticPlan", title: "Vehicle-Specific Diagnostic Workflow" },
  { key: "expectedReadings", title: "Expected Voltage, Resistance, and Live-Data Values" },
  { key: "independentSafetyReview", title: "Independent Safety Review" },
  { key: "programmingRequirements", title: "Programming and Calibration" },
  { key: "laborGuidance", title: "Detailed Labor Guidance" },
  { key: "multilingualReport", title: "Multilingual Professional Report" },
  { key: "savedDiagnosticCase", title: "Saved Diagnostic Case" },
  { key: "downloadableReport", title: "PDF Export" },
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

export interface ScannerMeta {
  scannerBrand: string | null;
  diagnosticApplicationVersion: string | null;
  vehicleSoftwareVersion: string | null;
  diagnosticPath: string | null;
  testTime: string | null;
  reportType: string | null;
}

export interface VehicleHealthSummary {
  faultedSystemCount: number;
  okSystemCount: number;
  totalDtcCount: number;
  currentCount: number;
  historyCount: number;
  networkCount: number;
  batteryVoltageCount: number;
  safetyCriticalCount: number;
}

export interface ModuleHealthRow {
  systemName: string;
  status: "faulted" | "ok" | "unknown";
  dtcCountReported: number | null;
  dtcCountExtracted: number;
  extractionComplete: boolean;
  highestPriorityFault: string | null;
}

export interface PatternSummary {
  patternType: string;
  severity: "info" | "warn" | "critical";
  name: string;
  affectedModules: string[];
}

export interface ScanExtractionQualitySummary {
  truncated: boolean;
  confidence: "high" | "medium" | "low";
  warnings: string[];
}

export interface DiagnosticPrioritySummary {
  fixFirstCodes: string[];
  diagnoseNextCodes: string[];
  monitorRecheckCodes: string[];
  historicalReferenceCodes: string[];
}

export interface ScanReportVisibleResult {
  vehicleSummary: VehicleSummary;
  dtcs: DtcSummary[];
  safety: { findings: SafetyFinding[] };
  // Schema version isn't sensitive/paid content — always present so the UI
  // can still detect a pre-v2 legacy report (see isLegacyReport in
  // report-presentation.ts) regardless of access level.
  schemaVersion: ScanReport["schema_version"];
  // Deterministic, extraction-derived facts (never AI-generated) — shown
  // regardless of access level, same as vehicleSummary/dtcs/safety above.
  // See docs/FULL_SCAN_INGESTION_ARCHITECTURE.md.
  scannerMeta: ScannerMeta;
  healthSummary: VehicleHealthSummary;
  moduleHealthTable: ModuleHealthRow[];
  patterns: PatternSummary[];
  extractionQuality: ScanExtractionQualitySummary;
  // Present only when accessLevel === "full" — structurally absent
  // (not just empty) from a preview response.
  rankedCauses?: RankedCause[];
  recommendedTests?: RecommendedTest[];
  confidenceLevel?: ScanConfidenceLevel | null;
  confidenceRationale?: string[];
  missingInformation?: string[];
  // Diagnostic-priority grouping — full-access-only, since it groups the
  // AI's own rankedCauses/recommendedTests, which don't exist at preview
  // level.
  priority?: DiagnosticPrioritySummary;
  // Present only when a non-English report language was requested (full
  // access level only) — see report-localization.ts. resolvedLocale is "en"
  // and fallbackUsed is true when translation failed/wasn't entitled; the
  // rankedCauses/recommendedTests/missingInformation above are English in
  // that case, never a partial or broken translation.
  requestedLocale?: string;
  resolvedLocale?: string;
  fallbackUsed?: boolean;
}

export interface PreviewUsage {
  dailyLimit: number;
  usedToday: number;
  remainingToday: number;
}

export interface FullUsage {
  // null = no daily cap — every paid plan today; a technician may run as
  // many reports as they choose until the monthly allowance is reached.
  dailyLimit: number | null;
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

function scannerMetaFrom(extraction: ScanExtraction | null): ScannerMeta {
  return {
    scannerBrand: extraction?.scanner_brand ?? null,
    diagnosticApplicationVersion: extraction?.diagnostic_application_version ?? null,
    vehicleSoftwareVersion: extraction?.vehicle_software_version ?? null,
    diagnosticPath: extraction?.diagnostic_path ?? null,
    testTime: extraction?.test_time ?? null,
    reportType: extraction?.report_type ?? null,
  };
}

function healthSummaryFrom(canonicalScan: CanonicalVehicleScan): VehicleHealthSummary {
  return {
    faultedSystemCount: canonicalScan.systems.filter((s) => s.status === "faulted").length,
    okSystemCount: canonicalScan.systems.filter((s) => s.status === "ok").length,
    totalDtcCount: canonicalScan.allDtcs.length,
    currentCount: canonicalScan.derivedCategories.currentCodes.length,
    historyCount: canonicalScan.derivedCategories.historyCodes.length,
    networkCount: canonicalScan.derivedCategories.networkFaults.length,
    batteryVoltageCount: canonicalScan.derivedCategories.batteryVoltageFaults.length,
    safetyCriticalCount: canonicalScan.derivedCategories.safetySystemFaults.length,
  };
}

function moduleHealthTableFrom(canonicalScan: CanonicalVehicleScan): ModuleHealthRow[] {
  return canonicalScan.systems.map((s) => {
    const highest =
      s.dtcs.find((d) => d.status === "current" && d.safetyRelevance) ??
      s.dtcs.find((d) => d.status === "current") ??
      s.dtcs.find((d) => d.status === "history") ??
      s.dtcs[0];
    return {
      systemName: s.systemName,
      status: s.status,
      dtcCountReported: s.dtcCountReported,
      dtcCountExtracted: s.dtcCountExtracted,
      extractionComplete: s.extractionComplete,
      highestPriorityFault: highest?.normalizedCode ?? null,
    };
  });
}

function patternSummariesFrom(patterns: DetectedPattern[]): PatternSummary[] {
  return patterns.map((p) => ({
    patternType: p.patternType,
    severity: p.severity,
    name: p.name,
    affectedModules: p.affectedModules,
  }));
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
  /** Deterministic canonical scan view — see canonical-scan.ts. Drives the always-visible health/module/pattern sections. */
  canonicalScan: CanonicalVehicleScan;
  patterns: DetectedPattern[];
  /** Full-access-only — groups the AI's own rankedCauses, meaningless at preview level. */
  priority?: DiagnosticPriority;
  /** Resolved report-language result (full access level only) — see report-localization.ts. */
  localization?: {
    requestedLocale: string;
    resolvedLocale: string;
    fallbackUsed: boolean;
    rankedCauses: RankedCause[];
    recommendedTests: RecommendedTest[];
    missingInformation: string[];
  };
}): ScanReportAccessResult {
  const { report, extraction, dtcRecords, accessLevel, usage, canonicalScan, patterns, priority, localization } = params;

  const base: Pick<
    ScanReportVisibleResult,
    "vehicleSummary" | "dtcs" | "safety" | "schemaVersion" | "scannerMeta" | "healthSummary" | "moduleHealthTable" | "patterns" | "extractionQuality"
  > = {
    vehicleSummary: vehicleSummaryFrom(extraction),
    dtcs: dtcSummariesFrom(dtcRecords),
    safety: { findings: report.safety_warnings as unknown as SafetyFinding[] },
    schemaVersion: report.schema_version,
    scannerMeta: scannerMetaFrom(extraction),
    healthSummary: healthSummaryFrom(canonicalScan),
    moduleHealthTable: moduleHealthTableFrom(canonicalScan),
    patterns: patternSummariesFrom(patterns),
    extractionQuality: {
      truncated: canonicalScan.extractionQuality.truncated,
      confidence: canonicalScan.extractionQuality.confidence,
      warnings: canonicalScan.extractionQuality.warnings,
    },
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
        rankedCauses: localization?.rankedCauses ?? (report.ranked_causes as unknown as RankedCause[]),
        recommendedTests:
          localization?.recommendedTests ?? (report.recommended_tests as unknown as RecommendedTest[]),
        confidenceLevel: report.confidence_level,
        confidenceRationale: report.confidence_rationale,
        missingInformation: localization?.missingInformation ?? report.missing_information,
        ...(priority
          ? {
              priority: {
                fixFirstCodes: priority.fixFirst.map((d) => d.normalizedCode),
                diagnoseNextCodes: priority.diagnoseNext.map((d) => d.normalizedCode),
                monitorRecheckCodes: priority.monitorRecheck.map((d) => d.normalizedCode),
                historicalReferenceCodes: priority.historicalReference.map((d) => d.normalizedCode),
              },
            }
          : {}),
        ...(localization
          ? {
              requestedLocale: localization.requestedLocale,
              resolvedLocale: localization.resolvedLocale,
              fallbackUsed: localization.fallbackUsed,
            }
          : {}),
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
