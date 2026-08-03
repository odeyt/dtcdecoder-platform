"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { recordClientEvent } from "@/lib/analytics/client";
import { formatPrice } from "@/lib/format";
import { PROFESSIONAL_REPORT_ONE_TIME } from "@/lib/pricing";

// Replaces the previous locked-section grid on the DTC result page, which
// rendered LOCKED_SECTION_CATALOG — nine placeholder cards, each with its
// own skeleton lines and its own "Upgrade" button. Nine near-identical
// CTAs read as broken loading state rather than an offer, and the skeleton
// rows implied content had failed to arrive.
//
// This is one panel: what the free result already gave you, what the paid
// report adds, and exactly two actions — buy the one-time report, or look
// at subscriptions.
//
// Billing is not reimplemented here. Price comes from
// PROFESSIONAL_REPORT_ONE_TIME and checkout goes through the same
// /api/checkout/single-report route OneTimeReportCard uses. An anonymous
// visitor is handed to the canonical resume flow on /pricing rather than a
// second copy of it — see the loginHref comment below.
const CHECKOUT_ROUTE = "/api/checkout/single-report";

// Mirrors the free tier this page actually renders above the panel, so the
// comparison is honest: every line here corresponds to a section the
// visitor can already see.
const FREE_INCLUDES = [
  "Code definition",
  "Common causes",
  "Reported symptoms",
  "Initial diagnostic checks",
  "Basic replacement caution",
] as const;

// Matches the entitlements in PROFESSIONAL_REPORT_ONE_TIME (maxFollowUps: 5)
// and the locked-section catalog this panel replaced.
const REPORT_INCLUDES = [
  "Complete root-cause ranking",
  "Vehicle-specific diagnostic workflow",
  "Expected voltage, resistance, pressure, and live-data values",
  "Independent drive-safety review",
  "Five DTC Technician follow-up questions",
  "Downloadable final report",
] as const;

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-1 h-3.5 w-3.5 shrink-0" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 111.4-1.4l2.8 2.8 6.8-6.8a1 1 0 011.4 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function ProfessionalReportUpsell({ signedIn }: { signedIn: boolean }) {
  const viewed = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    recordClientEvent("professional_report_upsell_viewed");
  }, []);

  async function startCheckout() {
    recordClientEvent("professional_report_cta_clicked");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(CHECKOUT_ROUTE, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.checkoutUrl) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  const price = formatPrice(Math.round(PROFESSIONAL_REPORT_ONE_TIME.priceUsd * 100));

  // Anonymous visitors go to the existing resume flow rather than a second
  // implementation of it: /pricing already knows how to auto-start this
  // exact checkout after sign-in (OneTimeReportCard's start_checkout
  // effect). `next` is a same-origin relative path, validated by the login
  // redirect machinery — this component never validates redirects itself.
  const loginHref = `/account/login?next=${encodeURIComponent(
    `/pricing?start_checkout=${PROFESSIONAL_REPORT_ONE_TIME.key}`,
  )}`;

  const ctaLabel = `One ${PROFESSIONAL_REPORT_ONE_TIME.name} — ${price}`;

  return (
    <section
      data-testid="professional-report-upsell"
      aria-labelledby="professional-report-upsell-heading"
      className="glass-panel rounded-[var(--radius-xl)] border p-6 sm:p-8"
      style={{ borderColor: "var(--border-subtle)", boxShadow: "var(--shadow-ambient)" }}
    >
      <h2
        id="professional-report-upsell-heading"
        className="text-xl font-semibold text-[var(--text-primary)] sm:text-2xl"
      >
        Complete the diagnosis with DTC Technician
      </h2>
      <p className="mt-2 max-w-[70ch] text-[var(--text-secondary)]">
        Turn this code result into a complete diagnostic plan with vehicle-specific root-cause ranking, test
        order, expected readings, safety guidance, and DTC Technician follow-ups.
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-2 md:gap-10">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Your free result includes
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
            {FREE_INCLUDES.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <CheckIcon />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-[var(--border-subtle)] pt-6 md:border-t-0 md:border-l md:pt-0 md:pl-10">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--accent-red)]">
            {PROFESSIONAL_REPORT_ONE_TIME.name} adds
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
            {REPORT_INCLUDES.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-[var(--accent-red)]">
                  <CheckIcon />
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-5 text-sm text-[var(--accent-red)]">
          {error}
        </p>
      )}

      {/* Exactly two actions. The one-time purchase is primary; the
          subscription route is a visually quieter sibling, not a competing
          button of equal weight. */}
      <div className="mt-6 flex flex-col gap-3 border-t border-[var(--border-subtle)] pt-6 sm:flex-row sm:items-center">
        {signedIn ? (
          <button
            type="button"
            data-testid="professional-report-cta"
            onClick={startCheckout}
            disabled={loading}
            className="min-h-11 w-full rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-3 font-semibold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-red)] disabled:opacity-60 sm:w-auto"
            style={{ boxShadow: "var(--shadow-accent)" }}
          >
            {loading ? "Starting checkout…" : ctaLabel}
          </button>
        ) : (
          <Link
            data-testid="professional-report-cta"
            href={loginHref}
            onClick={() => recordClientEvent("professional_report_cta_clicked")}
            className="flex min-h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-3 font-semibold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-red)] sm:w-auto"
            style={{ boxShadow: "var(--shadow-accent)" }}
          >
            {ctaLabel}
          </Link>
        )}

        <Link
          data-testid="pro-plan-cta"
          href="/pricing"
          onClick={() => recordClientEvent("pro_plan_cta_clicked")}
          className="flex min-h-11 w-full items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-6 py-3 font-semibold text-[var(--text-secondary)] transition hover:bg-white/5 hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-red)] sm:w-auto"
        >
          View Pro Technician plans
        </Link>
      </div>

      <p className="mt-3 text-xs text-[var(--text-muted)]">One-time payment. No subscription required.</p>
    </section>
  );
}

export { CHECKOUT_ROUTE as PROFESSIONAL_REPORT_CHECKOUT_ROUTE };
