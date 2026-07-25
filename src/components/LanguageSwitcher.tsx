"use client";

import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  LIVE_LOCALES,
  getLocaleInfo,
  DEFAULT_LOCALE,
} from "@/lib/i18n/locale-codes";
import { APP_SHELL_TOP_LEVEL_SEGMENTS } from "@/lib/i18n/app-shell-routes";
import { APP_LOCALE_COOKIE_NAME } from "@/lib/i18n/app-shell-locale-constants";

// User-facing language picker. Two locale mechanisms are in play:
//  - Public content tree (homepage, /dtc, /blog, /[make]/[slug]): locale is
//    a URL segment — English unprefixed, other live locales path-prefixed
//    (e.g. /es/dtc/p0420). Switching swaps the prefix.
//  - (app) shell (account/pricing/legal/etc.): no URL locale segment; the
//    shell reads the dtc_interface_locale cookie. Switching sets the cookie
//    and refreshes in place.
export function LanguageSwitcher() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const t = useTranslations("nav");
  // The actually-resolved locale (URL segment for the content tree, cookie
  // for the app shell) — both layouts feed it to NextIntlClientProvider, so
  // this is correct on either tree and matches server render (no hydration
  // mismatch).
  const currentLocale = useLocale();

  const segments = pathname.split("/").filter(Boolean);
  const first = segments[0];
  const hasLocalePrefix = first ? (LIVE_LOCALES as readonly string[]).includes(first) : false;
  const rest = hasLocalePrefix ? segments.slice(1) : segments;

  const restFirst = rest[0];
  const isAppShellRoute = restFirst ? APP_SHELL_TOP_LEVEL_SEGMENTS.has(restFirst) : false;

  function switchTo(locale: string) {
    if (locale === currentLocale) return;

    // The (app) shell reads this cookie to pick its language; a saved
    // account preference (Pro/Workshop) still wins over it.
    document.cookie = `${APP_LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=31536000; samesite=lax`;

    if (isAppShellRoute) {
      // App-shell routes carry no locale prefix — the cookie above drives the
      // language, so just re-render the current page.
      router.refresh();
      return;
    }

    const basePath = `/${rest.join("/")}`;
    const target =
      locale === DEFAULT_LOCALE
        ? basePath
        : `/${locale}${basePath === "/" ? "" : basePath}`;

    router.push(target);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1.5">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="text-[var(--text-muted)]"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
        <path
          d="M3 12h18M12 3c2.5 2.5 3.8 5.7 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.7-3.8-9S9.5 5.5 12 3z"
          stroke="currentColor"
          strokeWidth="1.75"
        />
      </svg>
      <label htmlFor="language-switcher" className="sr-only">
        {t("language")}
      </label>
      <select
        id="language-switcher"
        value={currentLocale}
        onChange={(e) => switchTo(e.target.value)}
        aria-label={t("language")}
        className="cursor-pointer rounded-[var(--radius-sm)] border border-transparent bg-transparent py-1 pl-1 pr-1 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus:border-[var(--border-subtle)] focus:outline-none"
      >
        {LIVE_LOCALES.map((code) => {
          const info = getLocaleInfo(code);
          return (
            <option key={code} value={code} className="bg-[var(--surface-0)] text-[var(--text-primary)]">
              {info?.nativeName ?? code.toUpperCase()}
            </option>
          );
        })}
      </select>
    </div>
  );
}
