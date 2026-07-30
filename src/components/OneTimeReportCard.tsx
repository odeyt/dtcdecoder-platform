"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { recordClientEvent } from "@/lib/analytics/client";
import { formatPrice } from "@/lib/format";
import { PROFESSIONAL_REPORT_ONE_TIME } from "@/lib/pricing";

// The "Professional Diagnostic Report" one-time purchase — a standalone,
// no-subscription entry point shown alongside (not nested inside) the
// subscription grid in PricingPlans.tsx. Deliberately rendered as a
// direct sibling of the grid, at the same outer width as
// `.container-app` provides — no independent max-w-* / mx-auto wrapper —
// so its left/right edges line up with the grid above it. See
// docs/billing/ONE_TIME_PROFESSIONAL_REPORT.md.
//
// Checkout intent survives a sign-in round trip: an anonymous visitor is
// sent to /account/login with `next` pointed back at
// `/pricing?start_checkout=<key>`; that `next` value is validated as an
// internal-only relative path by the existing login redirect machinery
// (src/app/(app)/account/auth/callback/route.ts's safeNextPath /
// PasswordLoginForm's matching client-side check) — this component never
// performs its own redirect validation, it only ever constructs a
// same-origin relative path.
const START_CHECKOUT_PARAM = "start_checkout";

const FEATURE_COUNT = 8;

export function OneTimeReportCard({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("pricing");
  const tc = useTranslations("common");
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoStarted = useRef(false);

  useEffect(() => {
    recordClientEvent("one_time_report_offer_viewed");
  }, []);

  async function startCheckout() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/checkout/single-report", { method: "POST" });
      const data = await res.json();

      if (!res.ok || !data.checkoutUrl) {
        setError(data.error ?? tc("genericError"));
        setLoading(false);
        return;
      }

      window.location.href = data.checkoutUrl;
    } catch {
      setError(tc("genericError"));
      setLoading(false);
    }
  }

  // Resumes checkout automatically once a visitor returns signed in from
  // the login flow above — never fires more than once per mount, and
  // never fires at all for a visitor who landed here without that intent.
  useEffect(() => {
    if (autoStarted.current) return;
    if (!signedIn) return;
    if (searchParams.get(START_CHECKOUT_PARAM) !== PROFESSIONAL_REPORT_ONE_TIME.key) return;
    autoStarted.current = true;
    // Deferred a tick rather than called synchronously in the effect body —
    // startCheckout's first line is a setState call, which React's
    // set-state-in-effect rule flags when invoked directly during commit.
    queueMicrotask(() => startCheckout());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, searchParams]);

  const referencePrice = formatPrice(Math.round(PROFESSIONAL_REPORT_ONE_TIME.referencePriceUsd * 100));
  const currentPrice = formatPrice(Math.round(PROFESSIONAL_REPORT_ONE_TIME.priceUsd * 100));
  const features = Array.from({ length: FEATURE_COUNT }, (_, i) => t(`oneTimeFeature${i + 1}`));

  const loginHref = `/account/login?next=${encodeURIComponent(
    `/pricing?${START_CHECKOUT_PARAM}=${PROFESSIONAL_REPORT_ONE_TIME.key}`,
  )}`;

  return (
    <div
      data-testid="one-time-report-card"
      className="glass-panel mt-10 rounded-[var(--radius-xl)] border p-6 sm:p-8 md:grid md:grid-cols-[1.3fr_1fr] md:items-center md:gap-10"
      style={{ borderColor: "var(--border-subtle)", boxShadow: "var(--shadow-ambient)" }}
    >
      <div>
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--accent-red)]">
          {t("oneTimeEyebrow")}
        </span>
        <h2 className="mt-2 text-xl font-bold text-[var(--text-primary)]">{t("oneTimeHeading")}</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{t("oneTimeDescription")}</p>
        <ul data-testid="one-time-report-features" className="mt-4 space-y-2 text-sm text-[var(--text-secondary)]">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-red)]"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 111.4-1.4l2.8 2.8 6.8-6.8a1 1 0 011.4 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 flex flex-col justify-center border-t border-[var(--border-subtle)] pt-6 md:mt-0 md:border-t-0 md:border-l md:pl-10 md:pt-0">
        <p className="flex items-center gap-2">
          <span
            data-testid="one-time-report-reference-price"
            className="text-sm text-[var(--text-muted)] line-through"
          >
            {referencePrice}
          </span>
          <span className="rounded-full border border-[var(--border-red)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-red)]">
            {t("oneTimeIntroductoryLabel")}
          </span>
        </p>
        <p data-testid="one-time-report-price" className="mt-1 text-3xl font-bold text-[var(--accent-red)]">
          {currentPrice}
        </p>

        {signedIn ? (
          <button
            data-testid="one-time-report-cta"
            onClick={startCheckout}
            disabled={loading}
            aria-busy={loading}
            className="mt-4 min-h-11 w-full rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-3 text-center font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
            style={{ boxShadow: "var(--shadow-accent)" }}
          >
            {loading ? t("oneTimeCheckoutLoading") : t("oneTimeCta")}
          </button>
        ) : (
          <Link
            data-testid="one-time-report-cta"
            href={loginHref}
            className="mt-4 flex min-h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-3 text-center font-semibold text-white transition hover:brightness-110"
            style={{ boxShadow: "var(--shadow-accent)" }}
          >
            {t("oneTimeCta")}
          </Link>
        )}

        {error && (
          <p role="alert" className="mt-2 text-xs text-[var(--accent-red)]">
            {error}
          </p>
        )}

        <p className="mt-3 text-xs text-[var(--text-muted)]">{t("oneTimeSupportingText")}</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">{t("oneTimeFairUseNote")}</p>
      </div>
    </div>
  );
}
