// Enriches the AI prompt with curated DTC content when a match exists in
// the existing dtc_codes reference table (the same table
// src/lib/ai/grounding.ts reads for the AI chat assistant) — read-only,
// and degrades gracefully to no enrichment when a code has no curated
// match rather than failing the analyze run.
import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface KnownDtcContext {
  code: string;
  meaning: string;
  severity: string;
}

export async function findKnownDtcContext(codes: string[]): Promise<Map<string, KnownDtcContext>> {
  const result = new Map<string, KnownDtcContext>();
  const uniqueCodes = [...new Set(codes.map((c) => c.toUpperCase()))];
  if (uniqueCodes.length === 0) return result;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dtc_codes")
    .select("code, meaning, severity")
    .eq("is_published", true)
    .in("code", uniqueCodes);

  if (error) throw error;

  for (const row of data ?? []) {
    // A generic (make-agnostic) match is kept if no more specific row for
    // the same code has already been recorded.
    if (!result.has(row.code)) {
      result.set(row.code, { code: row.code, meaning: row.meaning, severity: row.severity });
    }
  }

  return result;
}
