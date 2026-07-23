import "server-only";
import { env } from "@/lib/env";
import { listAllLanguages } from "@/lib/i18n/languages";
import { DEFAULT_LOCALE } from "@/lib/i18n/locale-codes";

// Self-referential canonical per locale (never always-English) + an
// hreflang map covering only locales that are both `enabled` and
// `seo_enabled` in the registry — never `ai_output_enabled` or
// `public_available` alone, so a language never gets indexed before its
// translation quality has actually been reviewed for SEO. Today that's
// just English; Spanish (or any future locale) appears automatically the
// moment an admin flips seo_enabled to true, no code change required.
// x-default always points at the unprefixed (English) URL, matching
// proxy.ts's rewrite behavior for bare paths.
export async function buildLocaleAlternates(locale: string, pathWithoutLocalePrefix: string) {
  const siteUrl = env.siteUrl();
  const languages = await listAllLanguages();
  const seoLocales = languages.filter((l) => l.enabled && l.seo_enabled);

  const languagesMap: Record<string, string> = {};
  for (const lang of seoLocales) {
    const prefix = lang.locale_code === DEFAULT_LOCALE ? "" : `/${lang.locale_code}`;
    languagesMap[lang.locale_code] = `${siteUrl}${prefix}${pathWithoutLocalePrefix}`;
  }
  languagesMap["x-default"] = `${siteUrl}${pathWithoutLocalePrefix}`;

  const selfPrefix = locale === DEFAULT_LOCALE ? "" : `/${locale}`;

  return {
    canonical: `${siteUrl}${selfPrefix}${pathWithoutLocalePrefix}`,
    languages: languagesMap,
  };
}
