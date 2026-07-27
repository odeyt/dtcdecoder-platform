// Repair Verification (docs/PHASE_2_ARCHITECTURE.md#repair-verification) —
// "After a repair, generate a verification checklist (Clear Codes, Road
// Test, Monitor Live Data, Recheck Pending DTC, Confirm Readiness, Verify
// Customer Complaint)." The checklist itself is a fixed deterministic
// template, not AI-generated — matching the same "deterministic checklist,
// no AI judgment" approach as confidence.ts's EVIDENCE_CHECKLIST.
//
// Unlike diagnostic_graph (one current-state row per case), migration
// 0031's repair_verifications table has a plain, non-unique index on
// case_id — a case can go through more than one repair-and-reverify cycle,
// and each is kept as its own row (case-memory history), never
// overwritten. Reading "the current checklist" means reading the most
// recently generated row.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RepairVerification, RepairVerificationItem } from "@/lib/diagnostic-engine/types";

export const REPAIR_VERIFICATION_TEMPLATE: string[] = [
  "Clear all diagnostic trouble codes",
  "Perform a road test replicating the original complaint conditions",
  "Monitor live data for the parameters relevant to the diagnosis",
  "Recheck for pending DTCs after the road test",
  "Confirm all readiness monitors report complete (not incomplete)",
  "Verify the customer's original complaint no longer occurs",
];

export function generateRepairVerificationChecklist(): RepairVerificationItem[] {
  return REPAIR_VERIFICATION_TEMPLATE.map((item) => ({ item, completed: false }));
}

interface RepairVerificationRow {
  id: string;
  case_id: string;
  checklist: RepairVerificationItem[];
  generated_at: string;
  completed_at: string | null;
}

function fromRow(row: RepairVerificationRow): RepairVerification {
  return {
    caseId: row.case_id,
    checklist: row.checklist,
    generatedAt: row.generated_at,
    completedAt: row.completed_at,
  };
}

export async function createRepairVerification(caseId: string): Promise<RepairVerification> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("repair_verifications")
    .insert({ case_id: caseId, checklist: generateRepairVerificationChecklist() })
    .select("*")
    .single();
  if (error) throw error;
  return fromRow(data as RepairVerificationRow);
}

export async function getLatestRepairVerification(caseId: string): Promise<RepairVerification | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("repair_verifications")
    .select("*")
    .eq("case_id", caseId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as RepairVerificationRow) : null;
}

export function allItemsCompleted(checklist: RepairVerificationItem[]): boolean {
  return checklist.length > 0 && checklist.every((item) => item.completed);
}

// Updates a single checklist item by its `item` text (stable across
// re-reads, unlike an array index) and recomputes completedAt from the
// resulting checklist — never set independently of the checklist's own
// state, so the two can never disagree.
export async function updateRepairVerificationItem(
  caseId: string,
  itemText: string,
  completed: boolean,
  notes?: string,
): Promise<RepairVerification> {
  const supabase = createAdminClient();
  const current = await getLatestRepairVerification(caseId);
  if (!current) {
    throw new Error(`No repair verification checklist exists yet for case ${caseId}`);
  }

  const checklist = current.checklist.map((row) => (row.item === itemText ? { ...row, completed, notes } : row));
  const completedAt = allItemsCompleted(checklist) ? new Date().toISOString() : null;

  const { data, error } = await supabase
    .from("repair_verifications")
    .update({ checklist, completed_at: completedAt })
    .eq("case_id", caseId)
    .eq("generated_at", current.generatedAt)
    .select("*")
    .single();
  if (error) throw error;
  return fromRow(data as RepairVerificationRow);
}
