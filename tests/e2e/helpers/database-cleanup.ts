// Deletes only the synthetic records a specific E2E run created (Phase
// 20). Never touches rows outside the current run's user IDs / request-ID
// prefix — no broad deletes, no truncation. Call from a `finally` block or
// a teardown project. Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL
// in the environment — silently no-ops if either is absent so this never
// becomes a hard requirement for running deterministic/mocked tests.
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export interface CleanupResult {
  ran: boolean;
  userIdsDeleted: number;
  casesDeleted: number;
  remainingRowsForRun: number;
}

// Deletes everything owned by the given synthetic user IDs — cases cascade
// to evidence/questions/answers/graphs/hypotheses/repair-verifications/runs
// via the same FK relationships the app itself relies on (see the
// migrations under supabase/migrations/00{12,30..36}_*.sql). Usage rows are
// deleted explicitly since they're keyed by user_id, not case_id.
export async function cleanupSyntheticUsers(userIds: string[]): Promise<CleanupResult> {
  const admin = adminClient();
  if (!admin || userIds.length === 0) {
    return { ran: false, userIdsDeleted: 0, casesDeleted: 0, remainingRowsForRun: 0 };
  }

  const { data: cases } = await admin.from("scan_cases").select("id").in("user_id", userIds);
  const caseIds = (cases ?? []).map((c) => c.id);

  if (caseIds.length > 0) {
    await admin.from("scan_cases").delete().in("id", caseIds);
  }
  await admin.from("diagnostic_engine_usage").delete().in("user_id", userIds);
  await admin.from("diagnostic_engine_runs").delete().in("user_id", userIds);
  await admin.from("ai_diagnostic_usage").delete().in("user_id", userIds);
  await admin.from("ai_diagnostic_runs").delete().in("user_id", userIds);

  let deletedAuthUsers = 0;
  for (const id of userIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (!error) deletedAuthUsers += 1;
  }

  const { data: remainingCases } = await admin.from("scan_cases").select("id").in("user_id", userIds);

  return {
    ran: true,
    userIdsDeleted: deletedAuthUsers,
    casesDeleted: caseIds.length,
    remainingRowsForRun: remainingCases?.length ?? 0,
  };
}

// Creates one throwaway auth user for the current run and returns its
// credentials — mirrors the pattern already established in this project's
// manual production RLS validation (Admin API createUser, real
// signInWithPassword session, always deleted afterward).
export async function createSyntheticUser(email: string, password: string): Promise<string | null> {
  const admin = adminClient();
  if (!admin) return null;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  return data.user.id;
}
