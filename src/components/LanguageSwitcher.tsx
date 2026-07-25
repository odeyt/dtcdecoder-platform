"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LIVE_LOCALES,
  getLocaleInfo,
  DEFAULT_LOCALE,
} from "@/lib/i18n/locale-codes";
import { APP_SHELL_TOP_LEVEL_SEGMENTS } from "@/lib/i18n/app-shell-routes";
import { APP_LOCALE_COOKIE_NAME } from "@/lib/i18n/app-shell-locale-constants";

// User-facing language picker for the localized public content tree
// (homepage, /dtc, /blog, /[make]/[slug]). English content is served
// unprefixed; other live locales are path-prefixed (e.g. /es/dtc/p0420).
//
// The (app) shell (account/pricing/legal/etc.) is English-only today — its
// layout is fixed to English so it can stay statically generated — so this
// switcher renders nothing on those routes rather than pretend to switch a
// page it can't. When the app shell becomes locale-aware, drop the
// app-shell guard below.
export function LanguageSwitcher() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const t = useTranslations("nav");

  const segments = pathname.split("/").filter(Boolean);
  const first = segments[0];
  const hasLocalePrefix = first ? (LIVE_LOCALES as readonly string[]).includes(first) : false;
  const currentLocale = hasLocalePrefix ? (first as string) : DEFAULT_LOCALE;
  const rest = hasLocalePrefix ? segments.slice(1) : segments;

  const restFirst = rest[0];
  const isAppShellRoute = restFirst ? APP_SHELL_TOP_LEVEL_SEGMENTS.has(restFirst) : false;
  if (isAppShellRoute) return null;

  function switchTo(locale: string) {
    if (locale === currentLocale) return;

    // Forward-compatible: also record the anonymous interface-locale cookie
    // the (app) shell reads, so once the shell is locale-aware the choice
    // carries over. A saved account preference still wins over this cookie.
    document.cookie = `${APP_LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=31536000; samesite=lax`;

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
