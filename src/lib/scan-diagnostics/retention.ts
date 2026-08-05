// 90-day retention sweep for paid-subscriber reports (docs: report
// retention/auto-delete). Deletes both the DB report data (scan_cases and
// everything cascaded from it) and the customer's raw uploaded scan-tool
// export in Storage — the only two places "the report" actually lives
// (see deleteScanFile, src/lib/scan-diagnostics/storage.ts, previously
// unused anywhere in this codebase).
//
// Scope, deliberately narrow: only a `completed` case (one that actually
// produced a report) owned by a user whose CURRENT subscription is active
// pro/workshop, and only once older than PAID_RETENTION_DAYS. A case
// currently unlocked by an unexpired single-report purchase is excluded —
// that purchase follows its own 30-day view-lock rule (migration 0037),
// never this 90-day delete rule. Free-tier cases with no report and no
// purchase are untouched — not a "report" in the sense this policy
// targets.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteScanFile } from "@/lib/scan-diagnostics/storage";

export const PAID_RETENTION_DAYS = 90;

// Whole days remaining until `iso`, rounded up so "expires later today"
// still reads as "1 day" rather than "0 days" — used for the in-app
// "Expires in N days" badge, never for the sweep's own cutoff math above
// (which compares full timestamps, not rounded days).
export function daysUntil(iso: string): number {
  const diffMs = new Date(iso).getTime() - Date.now();
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

// Shared by the case list and case-detail pages. A single-report
// purchase's own (shorter, purchase-specific) expiry always takes
// precedence over the 90-day paid-plan rule — the two never really apply
// to the same case in practice, but the unlock is what's actually
// granting access here, so it's the more specific and more truthful
// figure. Returns null when neither rule currently grants a bounded view
// window (Free with no purchase — no badge at all — or already expired).
//
// Returns the day count, not a pre-formatted English string — pluralizing
// "day"/"days" in code would be wrong for the locales this app supports
// (Thai/Lao/Vietnamese/Chinese/Japanese/Korean have no plural distinction
// at all). Callers format the actual message via next-intl's
// scanCases.expiresInDays ICU message.
export function computeExpiryDays(params: {
  plan: string;
  createdAt: string;
  singleReportUnlockExpiresAt?: string;
}): number | null {
  const expiresAt = params.singleReportUnlockExpiresAt
    ? params.singleReportUnlockExpiresAt
    : params.plan === "pro" || params.plan === "workshop"
      ? new Date(new Date(params.createdAt).getTime() + PAID_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
      : null;
  if (!expiresAt) return null;
  const days = daysUntil(expiresAt);
  if (days <= 0) return null;
  return days;
}

export interface RetentionSweepResult {
  candidateCaseIds: string[];
  deletedCaseIds: string[];
  dryRun: boolean;
}

export async function runRetentionSweep(params: { dryRun: boolean }): Promise<RetentionSweepResult> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - PAID_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: candidateCases, error: casesError } = await admin
    .from("scan_cases")
    .select("id, user_id, created_at")
    .eq("status", "completed")
    .lt("created_at", cutoff);
  if (casesError) throw casesError;
  if (!candidateCases || candidateCases.length === 0) {
    return { candidateCaseIds: [], deletedCaseIds: [], dryRun: params.dryRun };
  }

  const userIds = [...new Set(candidateCases.map((c) => c.user_id as string))];
  const { data: activeSubs, error: subsError } = await admin
    .from("subscriptions")
    .select("user_id, plan")
    .in("user_id", userIds)
    .eq("status", "active")
    .in("plan", ["pro", "workshop"]);
  if (subsError) throw subsError;
  const paidUserIds = new Set((activeSubs ?? []).map((s) => s.user_id as string));

  const caseIds = candidateCases.map((c) => c.id as string);
  const { data: activeUnlocks, error: unlocksError } = await admin
    .from("single_report_purchases")
    .select("case_id")
    .in("case_id", caseIds)
    .eq("status", "consumed")
    .gt("expires_at", new Date().toISOString());
  if (unlocksError) throw unlocksError;
  const unlockedCaseIds = new Set((activeUnlocks ?? []).map((u) => u.case_id as string));

  const eligible = candidateCases.filter(
    (c) => paidUserIds.has(c.user_id as string) && !unlockedCaseIds.has(c.id as string),
  );
  const candidateCaseIds = eligible.map((c) => c.id as string);

  if (params.dryRun || candidateCaseIds.length === 0) {
    return { candidateCaseIds, deletedCaseIds: [], dryRun: params.dryRun };
  }

  const deletedCaseIds: string[] = [];
  for (const caseId of candidateCaseIds) {
    const { data: files, error: filesError } = await admin
      .from("scan_case_files")
      .select("storage_path")
      .eq("case_id", caseId);
    if (filesError) throw filesError;

    for (const file of files ?? []) {
      await deleteScanFile(file.storage_path as string).catch((err) =>
        console.error("[retention-sweep] failed to delete storage object", caseId, file.storage_path, err),
      );
    }

    // Cascades to scan_reports/scan_extractions/scan_dtc_records/
    // scan_ai_runs/scan_feedback/scan_systems/scan_patterns/scan_usage/
    // scan_report_localizations automatically — every child FK already
    // has `on delete cascade`. single_report_purchases.case_id is `on
    // delete set null` instead, so its own audit row survives.
    const { error: deleteError } = await admin.from("scan_cases").delete().eq("id", caseId);
    if (deleteError) {
      console.error("[retention-sweep] failed to delete case", caseId, deleteError);
      continue;
    }
    deletedCaseIds.push(caseId);
  }

  return { candidateCaseIds, deletedCaseIds, dryRun: params.dryRun };
}
