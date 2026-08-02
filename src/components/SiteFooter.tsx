import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { localizeContentHref } from "@/lib/i18n/localized-href";

export function SiteFooter() {
  const t = useTranslations("footer");
  const locale = useLocale();

  return (
    <footer className="mt-24 border-t border-[var(--border-subtle)] bg-[var(--surface-1)]">
      <div className="container-app px-6 py-14">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div>
            <p className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
              <span className="text-[var(--accent-red)]">DTC</span> Decoder
            </p>
            <p className="mt-2 max-w-xs text-sm text-[var(--text-muted)]">{t("tagline")}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-12 gap-y-8 sm:flex">
            <nav className="flex flex-col gap-2 text-sm text-[var(--text-secondary)]">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                {t("product")}
              </span>
              <Link href={localizeContentHref("/blog", locale)} className="hover:text-[var(--text-primary)]">
                {t("blog")}
              </Link>
              <Link href="/videos" className="hover:text-[var(--text-primary)]">
                {t("videos")}
              </Link>
              <Link href="/history" className="hover:text-[var(--text-primary)]">
                {t("history")}
              </Link>
              <a
                href="https://youtube.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[var(--text-primary)]"
              >
                {t("youtube")}
              </a>
              <a
                href="https://gumroad.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[var(--text-primary)]"
              >
                {t("gumroad")}
              </a>
            </nav>
            <nav className="flex flex-col gap-2 text-sm text-[var(--text-secondary)]">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                {t("company")}
              </span>
              <Link href="/faq" className="hover:text-[var(--text-primary)]">
                {t("faq")}
              </Link>
              <Link href="/contact" className="hover:text-[var(--text-primary)]">
                {t("contact")}
              </Link>
            </nav>
            <nav className="flex flex-col gap-2 text-sm text-[var(--text-secondary)]">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                {t("legal")}
              </span>
              <Link href="/privacy" className="hover:text-[var(--text-primary)]">
                {t("privacyPolicy")}
              </Link>
              <Link href="/privacy-rights" className="hover:text-[var(--text-primary)]">
                {t("privacyRights")}
              </Link>
              <Link href="/terms" className="hover:text-[var(--text-primary)]">
                {t("terms")}
              </Link>
              <Link href="/cookies" className="hover:text-[var(--text-primary)]">
                {t("cookiePolicy")}
              </Link>
              <Link href="/acceptable-use" className="hover:text-[var(--text-primary)]">
                {t("acceptableUse")}
              </Link>
              <Link href="/ai-disclaimer" className="hover:text-[var(--text-primary)]">
                {t("aiDisclaimer")}
              </Link>
              <Link href="/subscription-billing" className="hover:text-[var(--text-primary)]">
                {t("subscriptionBilling")}
              </Link>
              <Link href="/refund" className="hover:text-[var(--text-primary)]">
                {t("refundPolicy")}
              </Link>
              <Link href="/dmca" className="hover:text-[var(--text-primary)]">
                {t("dmca")}
              </Link>
              <Link href="/dpa" className="hover:text-[var(--text-primary)]">
                {t("dpa")}
              </Link>
              <Link href="/affiliate-disclosure" className="hover:text-[var(--text-primary)]">
                {t("affiliateDisclosure")}
              </Link>
            </nav>
          </div>
        </div>
        <p className="mt-12 text-xs text-[var(--text-muted)]">
          {t("copyright", { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  );
}
