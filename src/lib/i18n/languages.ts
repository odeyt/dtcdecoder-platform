import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { canSelectAiReportLanguage } from "@/lib/i18n/entitlements";
import type { Currency, Language, SubscriptionPlan, TerminologyGlossaryEntry } from "@/lib/types";

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

// Combines the plan entitlement with real registry state — the one place
// callers should ask "which output languages can this user actually pick,"
// rather than re-deriving the intersection themselves at each call site.
export async function getAllowedOutputLocales(plan: SubscriptionPlan): Promise<Language[]> {
  if (!canSelectAiReportLanguage(plan)) return [];
  return listAiOutputEnabledLocales();
}

// Full registry, including disabled/Tier-4 rows — needed by the account
// preferences UI and admin screens to render locked previews ("Spanish —
// Pro only", "French — coming soon"), not just the currently-active subset.
export async function listAllLanguages(): Promise<Language[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("languages")
    .select("*")
    .order("display_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function listAllCurrencies(): Promise<Currency[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("currencies")
    .select("*")
    .order("display_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// Broader than isAiOutputEnabledLocale — used to validate a saved interface
// language, which only needs the language to be enabled at all (not
// necessarily ai_output_enabled too).
export async function isEnabledLocale(localeCode: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("languages")
    .select("locale_code")
    .eq("locale_code", localeCode)
    .eq("enabled", true)
    .maybeSingle();

  if (error) throw error;
  return data !== null;
}

export async function isEnabledCurrency(code: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("currencies")
    .select("code")
    .eq("code", code)
    .eq("enabled", true)
    .maybeSingle();

  if (error) throw error;
  return data !== null;
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
