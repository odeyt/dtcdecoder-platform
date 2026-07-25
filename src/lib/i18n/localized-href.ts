import { APP_SHELL_TOP_LEVEL_SEGMENTS } from "@/lib/i18n/app-shell-routes";
import { DEFAULT_LOCALE, isLiveLocale } from "@/lib/i18n/locale-codes";

// Prefix an internal href with the active locale IFF it targets the public
// content tree (homepage, /dtc, /blog, /[make]/[slug]). (app)-shell routes
// (account/pricing/legal/etc.) are cookie-driven and never carry a locale
// prefix, so they pass through unchanged — as do external, hash, and
// already-localized hrefs. English (the default) is always served unprefixed.
//
// Client-safe (no server-only imports) so nav/footer/search link components
// can call it directly.
export function localizeContentHref(href: string, locale: string): string {
  if (locale === DEFAULT_LOCALE || !href.startsWith("/")) return href;

  const firstSeg = href.split(/[/?#]/)[1] ?? "";
  // Already locale-prefixed, or an app-shell route — leave as-is.
  if (isLiveLocale(firstSeg) || APP_SHELL_TOP_LEVEL_SEGMENTS.has(firstSeg)) return href;

  return `/${locale}${href === "/" ? "" : href}`;
}
