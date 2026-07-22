import "server-only";
import { createClient } from "@/lib/supabase/server";
import { extractVehicleMake } from "@/lib/ai/vehicle-aliases";
import type { DtcCode } from "@/lib/types";

const CODE_PATTERN = /[pbcu]\d{3,4}/gi;

// Grounds the AI assistant's answer in real curated content. Two retrieval
// paths, because a regex-only approach silently fails on code-less symptom
// queries ("rough idle", "limp mode") — which are the spec's own headline
// examples and, if ungrounded, break the PDF/video recommendation funnel.
export async function findGroundingDtcCodes(message: string): Promise<DtcCode[]> {
  const supabase = await createClient();
  const make = extractVehicleMake(message);
  const codeMatches = [...new Set(message.match(CODE_PATTERN)?.map((c) => c.toUpperCase()) ?? [])];

  if (codeMatches.length > 0) {
    let query = supabase
      .from("dtc_codes")
      .select("*")
      .eq("is_published", true)
      .in("code", codeMatches);

    if (make) {
      // Prefer make-specific rows, but don't exclude generic ones entirely —
      // OR both conditions so a make-specific match ranks without hiding a
      // generic fallback if no make-specific row exists for this code.
      query = query.or(`make.eq.${make},make.is.null`);
    }

    const { data, error } = await query.limit(5);
    if (error) throw error;
    if (data && data.length > 0) {
      // Make-specific rows first when both exist for the same code.
      return [...data].sort((a, b) => (a.make ? 0 : 1) - (b.make ? 0 : 1));
    }
  }

  const words = message
    .replace(/[^a-z0-9\s]/gi, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return [];

  let ftsQuery = supabase
    .from("dtc_codes")
    .select("*")
    .eq("is_published", true)
    .textSearch("fts", words.join(" | "), { type: "plain", config: "english" });

  if (make) {
    ftsQuery = ftsQuery.or(`make.eq.${make},make.is.null`);
  }

  const { data, error } = await ftsQuery.limit(5);
  if (error) throw error;
  return data ?? [];
}
