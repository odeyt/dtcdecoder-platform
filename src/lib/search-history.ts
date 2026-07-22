import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SearchHistoryEntry } from "@/lib/types";

// Real, persisted history — every entry corresponds to an actual DTC lookup
// or AI assistant query a signed-in user performed. Never fabricated.
export async function recordSearchHistory(
  userId: string,
  kind: "lookup" | "ai",
  query: string,
  dtcCodeId?: string | null,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("search_history").insert({
    user_id: userId,
    kind,
    query: query.slice(0, 500),
    dtc_code_id: dtcCodeId ?? null,
  });
  if (error) throw error;
}

export async function listSearchHistory(
  userId: string,
  limit = 50,
): Promise<(SearchHistoryEntry & { dtc_code: { code: string; title: string; make: string | null; slug: string } | null })[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("search_history")
    .select("*, dtc_code:dtc_codes(code, title, make, slug)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as (SearchHistoryEntry & {
    dtc_code: { code: string; title: string; make: string | null; slug: string } | null;
  })[];
}
