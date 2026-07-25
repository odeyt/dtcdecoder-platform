"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  LIVE_LOCALES,
  getMenuLocales,
  getLocaleInfo,
  DEFAULT_LOCALE,
} from "@/lib/i18n/locale-codes";
import { APP_SHELL_TOP_LEVEL_SEGMENTS } from "@/lib/i18n/app-shell-routes";
import { APP_LOCALE_COOKIE_NAME } from "@/lib/i18n/app-shell-locale-constants";

// Premium account-menu-style language selector. Options are generated from
// the central registry (getMenuLocales) — never hardcoded per placement.
//
// Two locale mechanisms are preserved:
//  - Public content tree (home, /dtc, /blog, /[make]/[slug]): locale is a URL
//    segment — English unprefixed, other live locales prefixed. Switching
//    swaps the prefix, keeping the current page where an equivalent route
//    exists (falls back to the localized homepage otherwise).
//  - (app) shell (account/pricing/legal): cookie-driven, no URL segment.
//    Switching sets the cookie and refreshes in place.
export function LanguageSwitcher({ align = "end" }: { align?: "start" | "end" }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const t = useTranslations("nav");
  const currentLocale = useLocale();

  const menuLocales = getMenuLocales();
  const currentInfo = getLocaleInfo(currentLocale);

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  const segments = pathname.split("/").filter(Boolean);
  const first = segments[0];
  const hasLocalePrefix = first ? (LIVE_LOCALES as readonly string[]).includes(first) : false;
  const rest = hasLocalePrefix ? segments.slice(1) : segments;
  const restFirst = rest[0];
  const isAppShellRoute = restFirst ? APP_SHELL_TOP_LEVEL_SEGMENTS.has(restFirst) : false;

  // Only one live language today would make the picker pointless; render
  // nothing until there is a real choice.
  const hasChoice = menuLocales.length > 1;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      const activeAt = Math.max(
        0,
        menuLocales.findIndex((l) => l.code.toLowerCase() === currentLocale.toLowerCase()),
      );
      setActiveIndex(activeAt);
      // Focus the active option once the menu paints.
      requestAnimationFrame(() => itemRefs.current[activeAt]?.focus());
    }
  }, [open, currentLocale, menuLocales]);

  if (!hasChoice) return null;

  function openMenu() {
    setOpen(true);
  }

  function closeMenu(focusButton = true) {
    setOpen(false);
    if (focusButton) requestAnimationFrame(() => buttonRef.current?.focus());
  }

  function switchTo(locale: string) {
    closeMenu();
    if (locale === currentLocale) return;

    // The (app) shell reads this cookie; a saved account preference
    // (Pro/Workshop) still wins over it.
    document.cookie = `${APP_LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=31536000; samesite=lax`;

    if (isAppShellRoute) {
      router.refresh();
      return;
    }

    const basePath = `/${rest.join("/")}`;
    const target =
      locale === DEFAULT_LOCALE ? basePath : `/${locale}${basePath === "/" ? "" : basePath}`;
    router.push(target);
    router.refresh();
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => {
          const n = (i + 1) % menuLocales.length;
          itemRefs.current[n]?.focus();
          return n;
        });
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => {
          const n = (i - 1 + menuLocales.length) % menuLocales.length;
          itemRefs.current[n]?.focus();
          return n;
        });
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        itemRefs.current[0]?.focus();
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(menuLocales.length - 1);
        itemRefs.current[menuLocales.length - 1]?.focus();
        break;
      case "Escape":
        e.preventDefault();
        closeMenu();
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  function onButtonKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openMenu();
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? closeMenu(false) : openMenu())}
        onKeyDown={onButtonKeyDown}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t("language")}
        className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-transparent px-2 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus:border-[var(--border-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-red)]"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
          <path
            d="M3 12h18M12 3c2.5 2.5 3.8 5.7 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.7-3.8-9S9.5 5.5 12 3z"
            stroke="currentColor"
            strokeWidth="1.75"
          />
        </svg>
        <span>{currentInfo?.nativeName ?? currentLocale.toUpperCase()}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t("language")}
          onKeyDown={onMenuKeyDown}
          className={`absolute z-50 mt-1 min-w-[12rem] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-0)] py-1 shadow-xl ${
            align === "end" ? "right-0" : "left-0"
          }`}
        >
          {menuLocales.map((info, i) => {
            const active = info.code.toLowerCase() === currentLocale.toLowerCase();
            return (
              <button
                key={info.code}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                tabIndex={i === activeIndex ? 0 : -1}
                dir={info.direction}
                onClick={() => switchTo(info.code)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--text-primary)] focus:bg-[var(--surface-1)] focus:text-[var(--text-primary)] focus:outline-none"
              >
                <span>{info.nativeName}</span>
                {active && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-[var(--accent-red)]">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
