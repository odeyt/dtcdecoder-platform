"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { SubscribeButton } from "@/components/SubscribeButton";
import { SingleReportPurchaseButton } from "@/components/SingleReportPurchaseButton";
import {
  PAID_PLANS,
  LAUNCH_PRICING_ACTIVE,
  LAUNCH_PRICING,
  yearlyPriceUsd,
  yearlySavingsUsd,
  effectiveMonthlyPriceUsd,
  type BillingInterval,
  type PaidPlan,
} from "@/lib/pricing";

// Pro and Workshop no longer share a flat yearly discount (Pro saves
// $78/yr, Workshop saves $198/yr) — the toggle button shows the largest
// figure as an honest "up to" claim; each card's own subline shows its
// real, plan-specific savings via yearlySavingsUsd().
const MAX_YEARLY_SAVINGS_USD = Math.max(
  ...(Object.keys(PAID_PLANS) as PaidPlan[]).map((plan) => yearlySavingsUsd(plan)),
);

// Report-count allowances and prices come from src/lib/pricing.ts
// (AI_DIAGNOSTIC_ENTITLEMENTS / PAID_PLANS) — the numbers below are spelled
// out as static translated copy (messages/en.json, messages/es.json)
// rather than interpolated from a raw limit field, so the bullet always
// reads naturally ("20 full AI diagnostic reports/month") instead of a
// bare number pulled mechanically from internal config. Keep the copy in
// sync with pricing.ts by hand when either changes — there is no
// automated check tying the two together yet.

export function PricingPlans({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("pricing");
  const [interval, setInterval] = useState<BillingInterval>("monthly");

  return (
    <div>
      <div className="mx-auto flex w-fit rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-1">
        <button
          onClick={() => setInterval("yearly")}
          aria-pressed={interval === "yearly"}
          className={`min-h-11 rounded-[var(--radius-sm)] px-4 py-1.5 text-sm font-semibold transition ${
            interval === "yearly"
              ? "bg-[var(--accent-red)] text-white"
              : "text-[var(--text-muted)]"
          }`}
        >
          {t("yearlySave", { amount: MAX_YEARLY_SAVINGS_USD })}
        </button>
        <button
          onClick={() => setInterval("monthly")}
          aria-pressed={interval === "monthly"}
          className={`min-h-11 rounded-[var(--radius-sm)] px-4 py-1.5 text-sm font-semibold transition ${
            interval === "monthly"
              ? "bg-[var(--accent-red)] text-white"
              : "text-[var(--text-muted)]"
          }`}
        >
          {t("monthly")}
        </button>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <PlanCard title={t("freeTitle")} price="$0" priceSuffix="/mo">
          <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
            <li>{t("freeBullet1")}</li>
            <li>{t("freeBullet2")}</li>
            <li>{t("freeBullet3")}</li>
            <li>{t("freeBullet4")}</li>
            <li>{t("freeBullet5")}</li>
            <li>{t("freeBullet6")}</li>
          </ul>
          <Link
            href={signedIn ? "/dtc" : "/account/login"}
            className="mt-6 block min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-6 py-3 text-center font-semibold text-[var(--text-primary)] transition hover:bg-white/5"
          >
            {t("startFree")}
          </Link>
        </PlanCard>

        <PaidPlanCard
          planKey="pro"
          title={t("planPro")}
          interval={interval}
          highlighted
          bullets={[
            t("proBullet1"),
            t("proBullet2"),
            t("proBullet3"),
            t("proBullet4"),
            t("proBullet5"),
            t("proBullet6"),
            t("proBullet7"),
            t("proBullet8"),
          ]}
          buttonLabel={t("upgradeToPro")}
          signedIn={signedIn}
        />

        <PaidPlanCard
          planKey="workshop"
          title={t("planWorkshop")}
          interval={interval}
          bullets={[
            t("workshopBullet1"),
            t("workshopBullet2"),
            t("workshopBullet3"),
            t("workshopBullet4"),
            t("workshopBullet5"),
            t("workshopBullet6"),
            t("workshopBullet7"),
          ]}
          buttonLabel={t("workshopAccess")}
          signedIn={signedIn}
        />
      </div>

      {/* Standalone pay-per-report entry point — unlike the plans above,
          reachable by anyone including an anonymous or Free-tier visitor,
          not tied to a subscription. See SINGLE_REPORT_PURCHASE in
          src/lib/pricing.ts and single_report_purchases (migration 0037). */}
      <div className="glass-panel mx-auto mt-10 max-w-xl rounded-[var(--radius-xl)] p-6 text-center">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">{t("singleReportHeading")}</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{t("singleReportBody")}</p>
        <SingleReportPurchaseButton signedIn={signedIn} />
      </div>

      <p className="mt-6 text-center text-xs text-[var(--text-muted)]">{t("fairUseNote")}</p>
    </div>
  );
}

function PaidPlanCard({
  planKey,
  title,
  interval,
  bullets,
  buttonLabel,
  signedIn,
  highlighted,
}: {
  planKey: "pro" | "workshop";
  title: string;
  interval: BillingInterval;
  bullets: string[];
  buttonLabel: string;
  signedIn: boolean;
  highlighted?: boolean;
}) {
  const t = useTranslations("pricing");
  const monthly = PAID_PLANS[planKey].monthlyPriceUsd;
  // Launch pricing only ever applies to the monthly price — LAUNCH_PRICING
  // has no yearly figure, so the yearly view is never discounted. Flipping
  // LAUNCH_PRICING_ACTIVE without also updating the plan's real Creem
  // product price would advertise a price checkout can't actually charge
  // — see the operational note on LAUNCH_PRICING_ACTIVE in
  // src/lib/pricing.ts before ever turning this on.
  const isLaunchPricing = LAUNCH_PRICING_ACTIVE && interval === "monthly";
  const displayPrice = interval === "yearly"
    ? yearlyPriceUsd(planKey)
    : isLaunchPricing
      ? LAUNCH_PRICING[planKey].monthlyPriceUsd
      : monthly;
  const priceSuffix = interval === "yearly" ? "/yr" : "/mo";
  const effectiveMonthly = effectiveMonthlyPriceUsd(planKey, interval);

  return (
    <PlanCard
      title={title}
      price={`$${displayPrice}`}
      priceSuffix={priceSuffix}
      listPrice={isLaunchPricing ? `$${monthly}` : undefined}
      launchLabel={isLaunchPricing ? t("introPricing") : undefined}
      highlighted={highlighted}
      subline={
        interval === "yearly"
          ? t("yearlySubline", {
              amount: effectiveMonthly.toFixed(2),
              discount: yearlySavingsUsd(planKey),
            })
          : undefined
      }
    >
      <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
        {bullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>
      <div className="mt-6">
        <SubscribeButton plan={planKey} interval={interval} label={buttonLabel} signedIn={signedIn} />
      </div>
    </PlanCard>
  );
}

function PlanCard({
  title,
  price,
  priceSuffix,
  listPrice,
  launchLabel,
  subline,
  highlighted,
  children,
}: {
  title: string;
  price: string;
  priceSuffix: string;
  // Present only when launch pricing is active for this card (see
  // PaidPlanCard) — the struck-through list price shown alongside the
  // discounted price, never on its own. No countdown timer, no "X hours
  // left" urgency copy — just an honest "here's the list price, here's the
  // introductory price" comparison.
  listPrice?: string;
  launchLabel?: string;
  subline?: string;
  highlighted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-[var(--radius-xl)] border p-6 ${
        highlighted ? "bg-[var(--surface-burgundy)]" : "glass-panel"
      }`}
      style={{
        borderColor: highlighted ? "var(--border-red)" : "var(--border-subtle)",
        boxShadow: highlighted ? "var(--shadow-accent)" : "var(--shadow-ambient)",
      }}
    >
      <h2 className="text-xl font-bold text-[var(--text-primary)]">{title}</h2>
      {listPrice && (
        <p className="mt-1 flex items-center gap-2">
          <span className="text-sm text-[var(--text-muted)] line-through">{listPrice}</span>
          {launchLabel && (
            <span className="rounded-full border border-[var(--border-red)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-red)]">
              {launchLabel}
            </span>
          )}
        </p>
      )}
      <p className="mt-1 text-2xl font-bold text-[var(--accent-red)]">
        {price}
        <span className="text-sm text-[var(--text-muted)]">{priceSuffix}</span>
      </p>
      {subline && <p className="mt-1 text-xs text-[var(--text-muted)]">{subline}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}
