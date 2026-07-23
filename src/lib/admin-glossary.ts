import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TerminologyGlossaryEntry } from "@/lib/types";

export async function listGlossaryForAdmin(
  filters: { locale?: string; status?: string } = {},
): Promise<TerminologyGlossaryEntry[]> {
  const supabase = createAdminClient();
  let query = supabase.from("terminology_glossary").select("*").order("term_en", { ascending: true });
  if (filters.locale) query = query.eq("locale_code", filters.locale);
  if (filters.status) query = query.eq("review_status", filters.status);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getGlossaryEntryForAdmin(id: string): Promise<TerminologyGlossaryEntry | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("terminology_glossary")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
