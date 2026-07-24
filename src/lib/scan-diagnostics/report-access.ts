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
import type { ScanExtraction, ScanDtcRecord, ScanReport } from "@/lib/types";

export async function resolveReportAccess(
  userId: string,
  email: string | null,
  detail: { extraction: ScanExtraction | null; dtcRecords: ScanDtcRecord[]; report: ScanReport | null },
): Promise<ScanReportAccessResult | null> {
  if (!detail.report) return null;

  const plan = await getEffectivePlan(userId, email);
  const accessLevel = accessLevelForPlan(plan);
  const usage = await getAiDiagnosticUsageSummary(userId, plan);

  return filterScanReportForAccessLevel({
    report: detail.report,
    extraction: detail.extraction,
    dtcRecords: detail.dtcRecords,
    accessLevel,
    usage,
  });
}
