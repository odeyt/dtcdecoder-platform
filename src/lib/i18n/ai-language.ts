// AiLanguage — the shape every AI-output translation call site (scan
// report, Diagnostic Engine turn, chat) already effectively builds ad hoc
// from getLocaleInfo() + isAiOutputEnabledLocale(). This just names and
// centralizes it, per the spec's requested shape, rather than duplicating
// the same three-line lookup at every call site.
import { getLocaleInfo, DEFAULT_LOCALE } from "@/lib/i18n/locale-codes";

export interface AiLanguage {
  locale: string;
  displayName: string;
  nativeName: string;
  /** Exactly what's interpolated into a translation system prompt, e.g.
   *  "Translate EACH string into {promptName} (locale: {locale})." */
  promptName: string;
}

export function toAiLanguage(locale: string): AiLanguage {
  const info = getLocaleInfo(locale);
  const displayName = info?.englishName ?? locale;
  return {
    locale: info ? locale : DEFAULT_LOCALE,
    displayName,
    nativeName: info?.nativeName ?? displayName,
    promptName: displayName,
  };
}

export const ENGLISH: AiLanguage = toAiLanguage(DEFAULT_LOCALE);
