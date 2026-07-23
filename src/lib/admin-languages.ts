import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Language } from "@/lib/types";

export async function listAllLanguagesForAdmin(): Promise<Language[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("languages")
    .select("*")
    .order("display_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getLanguageForAdmin(localeCode: string): Promise<Language | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("languages")
    .select("*")
    .eq("locale_code", localeCode)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Identity fields (locale_code, names, script, direction) are intentionally
// not editable here — they come from the static locale-codes.ts superset
// seeded in migration 0006. Admins configure activation/quality state, not
// invent new locale codes (that's a code change, not a data change).
export interface LanguageUpdateInput {
  enabled: boolean;
  publicAvailable: boolean;
  paidOnly: boolean;
  supportTier: 1 | 2 | 3 | 4;
  aiInputEnabled: boolean;
  aiOutputEnabled: boolean;
  bilingualEnabled: boolean;
  multilingualEnabled: boolean;
  safetyReviewStatus: "not_reviewed" | "in_review" | "approved" | "rejected";
  glossaryCompletionPercent: number;
  uiTranslationCompletionPercent: number;
  seoEnabled: boolean;
  displayOrder: number;
}

export async function updateLanguage(localeCode: string, input: LanguageUpdateInput): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("languages")
    .update({
      enabled: input.enabled,
      public_available: input.publicAvailable,
      paid_only: input.paidOnly,
      support_tier: input.supportTier,
      ai_input_enabled: input.aiInputEnabled,
      ai_output_enabled: input.aiOutputEnabled,
      bilingual_enabled: input.bilingualEnabled,
      multilingual_enabled: input.multilingualEnabled,
      safety_review_status: input.safetyReviewStatus,
      glossary_completion_percent: input.glossaryCompletionPercent,
      ui_translation_completion_percent: input.uiTranslationCompletionPercent,
      seo_enabled: input.seoEnabled,
      display_order: input.displayOrder,
    })
    .eq("locale_code", localeCode);
  if (error) throw error;
}

// True if any published-or-not DTC code uses this exact string as its
// `make` value — activating the language would make the proxy start
// treating that path segment as a locale prefix, silently 404ing the
// existing make page. Checked at the moment a language is enabled, not
// just at DTC-code-creation time (reserved-slugs.ts blocks the reverse
// direction — creating a make equal to any locale code, enabled or not).
export async function hasCollidingMake(localeCode: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("dtc_codes")
    .select("id")
    .eq("make", localeCode)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}
