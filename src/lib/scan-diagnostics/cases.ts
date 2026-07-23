import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ScanCaseNotFoundError, InvalidCaseStatusError } from "@/lib/scan-diagnostics/api-errors";
import type { CaseInfoInput } from "@/lib/scan-diagnostics/schemas";
import type { ScanCase, ScanCaseStatus } from "@/lib/types";

export async function createCase(userId: string, info: CaseInfoInput): Promise<ScanCase> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("scan_cases")
    .insert({
      user_id: userId,
      status: "draft",
      complaint: info.complaint ?? null,
      symptoms: info.symptoms ?? [],
      mileage: info.mileage ?? null,
      recent_repairs: info.recentRepairs ?? null,
      battery_condition: info.batteryCondition ?? null,
      technician_notes: info.technicianNotes ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

// Ownership check baked in: a case that exists but belongs to someone else
// is indistinguishable from a case that doesn't exist, so no non-owner can
// learn anything about another user's case via this function.
export async function getCaseForOwner(userId: string, caseId: string): Promise<ScanCase> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("scan_cases")
    .select("*")
    .eq("id", caseId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ScanCaseNotFoundError();
  return data;
}

// Forward-only, guarded state transition: `WHERE status = from` means a
// concurrent request that already advanced this case causes this call to
// affect zero rows rather than silently overwriting a newer state.
export async function transitionCaseStatus(
  caseId: string,
  from: ScanCaseStatus | ScanCaseStatus[],
  to: ScanCaseStatus,
  extra?: Record<string, unknown>,
): Promise<ScanCase> {
  const supabase = createAdminClient();
  const fromStatuses = Array.isArray(from) ? from : [from];

  const { data, error } = await supabase
    .from("scan_cases")
    .update({ status: to, status_updated_at: new Date().toISOString(), ...extra })
    .eq("id", caseId)
    .in("status", fromStatuses)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new InvalidCaseStatusError(
      `Case is not in an expected state for this operation (needs one of: ${fromStatuses.join(", ")}).`,
    );
  }
  return data;
}
