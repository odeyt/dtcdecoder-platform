import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isRecognizedLocaleCode } from "@/lib/i18n/locale-codes";

// This app owns locale resolution itself (src/proxy.ts's rewrite + the
// [locale] route segment) rather than next-intl's own routing middleware —
// see next.config.ts. `requestLocale` here resolves whatever was cached via
// setRequestLocale() in src/app/[locale]/layout.tsx, so this file only
// needs to validate and load the matching message catalog.
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested && isRecognizedLocaleCode(requested) ? requested : DEFAULT_LOCALE;

  // Only English and Spanish have real message catalogs today (see the
  // multilingual rollout plan) — every other recognized locale code falls
  // back to English messages rather than a 404 or a build-time import
  // error, since the registry intentionally holds locales that aren't
  // translated yet.
  const hasCatalog = locale === "en" || locale === "es";
  const catalogLocale = hasCatalog ? locale : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../../messages/${catalogLocale}.json`)).default,
  };
});
