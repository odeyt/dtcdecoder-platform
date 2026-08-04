// Small shared helpers for AI language resolution — kept separate from
// ai-language-resolver.ts (the pure priority-chain function) so call sites
// building its input don't each reimplement the same glue.
import { isLiveLocale } from "@/lib/i18n/locale-codes";
import type { RegionProfile } from "@/lib/region/region-types";
import type { AiLanguageResolutionInput } from "@/lib/i18n/ai-language-resolver";

// A locale can be "recognized" (a real code in the registry) without the
// UI actually being translated into it yet — isLiveLocale is the stricter
// check appropriate for an AI OUTPUT target, where serving untranslated
// English chrome around a foreign-language answer would be a worse
// experience than just answering in English.
export function isAiTranslationEligible(locale: string | null | undefined): boolean {
  return !!locale && isLiveLocale(locale);
}

// Bridges the Region Profile system into the AI language resolver's input
// shape — the one place that knows RegionProfile.defaultLanguage is the
// field this resolver's "Region Profile" tier means.
export function regionDefaultLanguageFrom(region: RegionProfile | null | undefined): AiLanguageResolutionInput["regionDefaultLanguage"] {
  return region?.defaultLanguage ?? null;
}
