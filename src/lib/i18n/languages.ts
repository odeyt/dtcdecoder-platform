import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Language, TerminologyGlossaryEntry } from "@/lib/types";

// Real registry state, never a hardcoded language list — this is the whole
// point of the registry (see the multilingual rollout plan). Only rows
// that are both `enabled` and `ai_output_enabled` may be offered as an AI
// report output language; a plan entitlement (canSelectAiReportLanguage)
// is a separate, additional gate checked at the call site.
export async function listAiOutputEnabledLocales(): Promise<Language[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("languages")
    .select("*")
    .eq("enabled", true)
    .eq("ai_output_enabled", true)
    .order("display_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function isAiOutputEnabledLocale(localeCode: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("languages")
    .select("locale_code")
    .eq("locale_code", localeCode)
    .eq("enabled", true)
    .eq("ai_output_enabled", true)
    .maybeSingle();

  if (error) throw error;
  return data !== null;
}

// Approved terms for a locale, injected into the translation system prompt
// so Claude preserves reviewed acronyms/identifiers verbatim instead of
// translating them freely (see terminology_glossary in migration 0006).
export async function listGlossaryForLocale(
  localeCode: string,
): Promise<TerminologyGlossaryEntry[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("terminology_glossary")
    .select("*")
    .eq("locale_code", localeCode)
    .in("review_status", ["reviewed", "approved"]);

  if (error) throw error;
  return data ?? [];
}
