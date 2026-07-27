"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { env } from "@/lib/env";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SignOutButton } from "@/components/SignOutButton";
import { localizeContentHref } from "@/lib/i18n/localized-href";

// Auth state is fetched client-side (not passed from the root layout) so
// that marketing/static pages (home, privacy, terms, etc.) can still be
// statically generated instead of forced dynamic on every request just to
// know whether to show "Sign In" or an account email in the header.
export function SiteNav() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const href = (path: string) => localizeContentHref(path, locale);
  const NAV_LINKS = [
    { href: "/dtc", label: t("dtcLookup") },
    { href: "/ai-assistant", label: t("aiDiagnostic") },
    ...(env.scanDiagnosticsEnabled() ? [{ href: "/diagnostics", label: t("scanDiagnostics") }] : []),
    { href: "/repair-pdfs", label: t("repairLibrary") },
    { href: "/history", label: t("history") },
    { href: "/pricing", label: t("pricing") },
  ];
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function isActive(path: string) {
    const h = href(path);
    return pathname === h || pathname.startsWith(`${h}/`);
  }

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-colors duration-200 ${
        scrolled
          ? "border-[var(--border-subtle)] bg-[var(--surface-0)]/85 backdrop-blur-xl"
          : "border-transparent bg-transparent"
      }`}
    >
      <div className="container-app flex items-center justify-between px-6 py-4">
        <Link
          href={href("/")}
          className="flex items-baseline gap-1 text-lg font-bold tracking-tight text-[var(--text-primary)]"
        >
          <span className="text-[var(--accent-red)]">DTC</span>
          <span>Decoder</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label={t("primaryNav")}>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={href(link.href)}
              aria-current={isActive(link.href) ? "page" : undefined}
              className={`rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium transition-colors ${
                isActive(link.href)
                  ? "text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
              style={
                isActive(link.href)
                  ? { boxShadow: "inset 0 -2px 0 var(--accent-red)" }
                  : undefined
              }
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <LanguageSwitcher />
          {userEmail ? (
            <div className="flex items-center gap-2">
              <Link
                href="/account"
                className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
              >
                {userEmail}
              </Link>
              <SignOutButton
                label={t("signOut")}
                className="text-sm font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
              />
            </div>
          ) : (
            <Link
              href="/account/login"
              className="text-sm font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
            >
              {t("signIn")}
            </Link>
          )}
          <Link
            href={href("/dtc")}
            className="rounded-[var(--radius-md)] bg-[var(--accent-red)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
            style={{ boxShadow: "var(--shadow-accent)" }}
          >
            {t("decodeACode")}
          </Link>
        </div>

        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          aria-label={menuOpen ? t("closeMenu") : t("openMenu")}
          className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-primary)] md:hidden"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            {menuOpen ? (
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            )}
          </svg>
        </button>
      </div>

      {menuOpen && (
        <nav
          id="mobile-nav"
          aria-label={t("mobileNav")}
          className="space-y-1 border-t border-[var(--border-subtle)] bg-[var(--surface-0)] px-6 py-4 md:hidden"
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={href(link.href)}
              onClick={() => setMenuOpen(false)}
              className="block min-h-11 rounded-[var(--radius-sm)] px-2 py-3 text-base text-[var(--text-secondary)]"
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-2 flex flex-col gap-2 border-t border-[var(--border-subtle)] pt-3">
            <div className="px-2 py-1">
              <LanguageSwitcher />
            </div>
            <Link
              href={href(userEmail ? "/account" : "/account/login")}
              onClick={() => setMenuOpen(false)}
              className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-3 text-center text-sm text-[var(--text-primary)]"
            >
              {userEmail ? userEmail : t("signIn")}
            </Link>
            {userEmail && (
              <SignOutButton
                label={t("signOut")}
                className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-3 text-center text-sm text-[var(--text-secondary)]"
              />
            )}
            <Link
              href={href("/dtc")}
              onClick={() => setMenuOpen(false)}
              className="min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-3 py-3 text-center text-sm font-semibold text-white"
            >
              {t("decodeACode")}
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
