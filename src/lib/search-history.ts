import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SearchHistoryEntry } from "@/lib/types";

// Real, persisted history — every entry corresponds to an actual DTC lookup
// or AI assistant query a signed-in user performed. Never fabricated.
// Returns the inserted row's id so the AI assistant route can attach the
// canonical/translated response text once the stream finishes (see
// updateSearchHistoryAiResponse) — id is a plain field on this table now,
// not a new one, so no drift risk between recording and updating a turn.
export async function recordSearchHistory(
  userId: string,
  kind: "lookup" | "ai",
  query: string,
  dtcCodeId?: string | null,
): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("search_history")
    .insert({
      user_id: userId,
      kind,
      query: query.slice(0, 500),
      dtc_code_id: dtcCodeId ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

// Populated after the AI assistant's response stream closes (never blocks
// time-to-first-byte). ai_translated_response stays null when the request's
// outputLocale was English — there's nothing to translate.
export async function updateSearchHistoryAiResponse(
  searchHistoryId: string,
  canonicalResponseEn: string,
  translatedResponse: string | null,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("search_history")
    .update({
      ai_canonical_response_en: canonicalResponseEn,
      ai_translated_response: translatedResponse,
    })
    .eq("id", searchHistoryId);
  if (error) throw error;
}

// Thrown when an id doesn't match any row owned by userId — either it
// never existed or belongs to someone else. Deliberately the same outcome
// for both (never leaks whether an id belongs to another user).
export class SearchHistoryNotFoundError extends Error {
  constructor() {
    super("History entry not found.");
    this.name = "SearchHistoryNotFoundError";
  }
}

// Renames only the short query label shown in the list — never touches
// kind/dtc_code_id/ai_canonical_response_en/ai_translated_response, which
// stay an accurate record of what was actually asked/answered.
export async function updateSearchHistoryQuery(
  userId: string,
  id: string,
  query: string,
): Promise<SearchHistoryEntry> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("search_history")
    .update({ query: query.slice(0, 500) })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new SearchHistoryNotFoundError();
  return data as SearchHistoryEntry;
}

export async function deleteSearchHistoryEntry(userId: string, id: string): Promise<void> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("search_history")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new SearchHistoryNotFoundError();
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
