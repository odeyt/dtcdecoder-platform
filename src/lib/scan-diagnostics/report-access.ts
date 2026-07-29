// Resolves the current, real access level for a case's report and shapes
// it accordingly — the single place both the case-detail API route and the
// case-detail Server Component page get a plan-appropriate report from, so
// neither can accidentally forget the gate and pass the raw ScanReport
// through. Deliberately re-derives accessLevel from the user's CURRENT
// plan on every call (not something stored on the report row) — an
// upgrade retroactively unlocks a previously-generated report.
import "server-only";
import { getEffectivePlan } from "@/lib/subscriptions";
import { getAiDiagnosticUsageSummary } from "@/lib/ai-diagnostics/usage";
import { accessLevelForPlan } from "@/lib/ai-diagnostics/entitlements";
import { filterScanReportForAccessLevel, type ScanReportAccessResult } from "@/lib/ai-diagnostics/redaction";
import { getOrCreateLocalizedReport } from "@/lib/scan-diagnostics/report-localization";
import { getActiveSingleReportUnlock } from "@/lib/ai-diagnostics/single-report-purchases";
import { buildCanonicalVehicleScan } from "@/lib/scan-diagnostics/canonical-scan";
import { computeDiagnosticPriority } from "@/lib/scan-diagnostics/priority";
import type { DetectedPattern } from "@/lib/scan-diagnostics/patterns";
import type {
  ScanCase,
  ScanExtraction,
  ScanDtcRecord,
  ScanPattern,
  ScanReport,
  ScanSystem,
} from "@/lib/types";

export async function resolveReportAccess(
  userId: string,
  email: string | null,
  detail: {
    case: ScanCase;
    extraction: ScanExtraction | null;
    dtcRecords: ScanDtcRecord[];
    systems: ScanSystem[];
    patterns: ScanPattern[];
    report: ScanReport | null;
  },
): Promise<ScanReportAccessResult | null> {
  if (!detail.report) return null;

  const plan = await getEffectivePlan(userId, email);
  // A valid, unexpired single-report purchase unlocks THIS case at full
  // access regardless of the viewer's current plan (e.g. a Free-tier
  // customer who bought the $9.99 standalone report) — checked before the
  // plan-derived level, which is otherwise the sole source of access.
  // Once expires_at passes, this no longer applies and access falls back
  // to the normal plan computation below — view access "locks again",
  // nothing is deleted (see migration 0037).
  const singleReportUnlock = await getActiveSingleReportUnlock(detail.case.id);
  const accessLevel = singleReportUnlock ? "full" : accessLevelForPlan(plan);
  const usage = await getAiDiagnosticUsageSummary(userId, plan);

  // Translation only applies to a full, real report — a preview-access
  // (downgraded owner) response never carries real diagnostic content to
  // translate in the first place (see filterScanReportForAccessLevel).
  const requestedLocale = detail.case.report_language;
  const localization =
    accessLevel === "full" && requestedLocale && requestedLocale !== "en"
      ? await getOrCreateLocalizedReport(userId, plan, detail.report.id, requestedLocale)
      : null;

  // Vehicle/system/pattern summary is deterministic, extraction-derived
  // fact — shown regardless of access level, same as vehicleSummary/dtcs/
  // safety in filterScanReportForAccessLevel's `base` fields. Only the
  // priority grouping (which reorders the AI's OWN rankedCauses) is
  // full-access-only, since it has nothing to group at preview level.
  const canonicalScan = buildCanonicalVehicleScan(detail.case, detail.extraction, detail.dtcRecords, detail.systems);
  const persistedPatterns: DetectedPattern[] = detail.patterns.map((p) => ({
    patternType: p.pattern_type as DetectedPattern["patternType"],
    severity: p.severity,
    name: p.pattern_type,
    evidence: p.evidence,
    affectedModules: p.affected_modules,
    ruleVersion: p.rule_version,
  }));
  const priority = computeDiagnosticPriority(canonicalScan, persistedPatterns);

  return filterScanReportForAccessLevel({
    report: detail.report,
    extraction: detail.extraction,
    dtcRecords: detail.dtcRecords,
    accessLevel,
    usage,
    canonicalScan,
    patterns: persistedPatterns,
    priority: accessLevel === "full" ? priority : undefined,
    localization: localization
      ? {
          requestedLocale,
          resolvedLocale: localization.resolvedLocale,
          fallbackUsed: localization.fallbackUsed,
          rankedCauses: localization.localized.rankedCauses,
          recommendedTests: localization.localized.recommendedTests,
          missingInformation: localization.localized.missingInformation,
        }
      : undefined,
  });
}
