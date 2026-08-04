// AI output language resolution — priority chain per the spec:
//   User Profile -> Region Profile -> Selected UI Language -> Browser Locale -> English
//
// Pure function, no I/O — mirrors region-resolver.ts's own shape exactly
// (that resolver is the "Region Profile" tier's own upstream input; this
// one consumes its result rather than re-deriving it, so the Region
// Profile system stays the single source of truth for what a region's
// default language is).
//
// This resolver answers "which language should AI output be in," not
// "is the caller entitled to it" — actual AI-output eligibility
// (isAiOutputEnabledLocale) and plan entitlement (canSaveAiReportLocale /
// getAllowedOutputLocales) are checked separately at each call site,
// exactly as they already are for scan-report and chat translation. Mixing
// that gating into this resolver would make it depend on a live DB read,
// which defeats the point of it being a pure, easily-testable function.
import { isRecognizedLocaleCode, DEFAULT_LOCALE } from "@/lib/i18n/locale-codes";
import { toAiLanguage, type AiLanguage } from "@/lib/i18n/ai-language";

export type AiLanguageSource = "user_profile" | "region_profile" | "selected_ui_language" | "browser_locale" | "english_default";

export interface AiLanguageResolutionInput {
  /** A signed-in user's own saved AI-output language preference (e.g. user_preferences.ai_report_locale). */
  userProfileLocale?: string | null;
  /** The resolved RegionProfile's defaultLanguage (see src/lib/region/region-types.ts). */
  regionDefaultLanguage?: string | null;
  /** The interface language currently selected in the UI (e.g. user_preferences.interface_locale or the dtc_interface_locale cookie). */
  selectedUiLanguage?: string | null;
  /** The visitor's own browser locale (Accept-Language / navigator.language primary tag). */
  browserLocale?: string | null;
}

export interface ResolvedAiLanguage {
  language: AiLanguage;
  source: AiLanguageSource;
}

function primarySubtag(locale: string): string {
  return locale.split(/[-_]/)[0]?.toLowerCase() ?? "";
}

export function resolveAiLanguage(input: AiLanguageResolutionInput): ResolvedAiLanguage {
  if (input.userProfileLocale && isRecognizedLocaleCode(input.userProfileLocale)) {
    return { language: toAiLanguage(input.userProfileLocale), source: "user_profile" };
  }

  if (input.regionDefaultLanguage && isRecognizedLocaleCode(input.regionDefaultLanguage)) {
    return { language: toAiLanguage(input.regionDefaultLanguage), source: "region_profile" };
  }

  if (input.selectedUiLanguage && isRecognizedLocaleCode(input.selectedUiLanguage)) {
    return { language: toAiLanguage(input.selectedUiLanguage), source: "selected_ui_language" };
  }

  if (input.browserLocale) {
    const subtag = primarySubtag(input.browserLocale);
    if (subtag && isRecognizedLocaleCode(subtag)) {
      return { language: toAiLanguage(subtag), source: "browser_locale" };
    }
  }

  return { language: toAiLanguage(DEFAULT_LOCALE), source: "english_default" };
}
