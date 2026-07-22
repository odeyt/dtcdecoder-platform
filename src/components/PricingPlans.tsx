"use client";

import { useState } from "react";
import Link from "next/link";
import { SubscribeButton } from "@/components/SubscribeButton";
import {
  PAID_PLANS,
  YEARLY_FLAT_DISCOUNT_USD,
  yearlyPriceUsd,
  effectiveMonthlyPriceUsd,
  type BillingInterval,
} from "@/lib/pricing";

export function PricingPlans({ signedIn }: { signedIn: boolean }) {
  const [interval, setInterval] = useState<BillingInterval>("yearly");

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
          Yearly — Save ${YEARLY_FLAT_DISCOUNT_USD}
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
          Monthly
        </button>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <PlanCard title="Free" price="$0" priceSuffix="/mo">
          <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
            <li>Basic DTC lookup</li>
            <li>5 AI searches per day</li>
            <li>Search history</li>
            <li>Safety warnings</li>
          </ul>
          <Link
            href={signedIn ? "/dtc" : "/account/login"}
            className="mt-6 block min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-6 py-3 text-center font-semibold text-[var(--text-primary)] transition hover:bg-white/5"
          >
            Start Free
          </Link>
        </PlanCard>

        <PaidPlanCard
          planKey="pro"
          title={PAID_PLANS.pro.label}
          interval={interval}
          highlighted
          bullets={[
            `Up to ${PAID_PLANS.pro.monthlyTokenLimit.toLocaleString()} AI tokens/mo`,
            "Advanced diagnostic workflows",
            "Premium PDF access",
            "OEM-style test procedures",
          ]}
          signedIn={signedIn}
        />

        <PaidPlanCard
          planKey="workshop"
          title={PAID_PLANS.workshop.label}
          interval={interval}
          bullets={[
            `Up to ${PAID_PLANS.workshop.monthlyTokenLimit.toLocaleString()} AI tokens/mo`,
            "Multiple technician accounts",
            "Saved customer cases",
            "Repair notes",
            "Priority diagnostic support",
          ]}
          signedIn={signedIn}
        />
      </div>

      <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
        AI token allowances reset monthly and are a fair-use limit to keep
        the service reliable for everyone — most technicians never come
        close to them.
      </p>
    </div>
  );
}

function PaidPlanCard({
  planKey,
  title,
  interval,
  bullets,
  signedIn,
  highlighted,
}: {
  planKey: "pro" | "workshop";
  title: string;
  interval: BillingInterval;
  bullets: string[];
  signedIn: boolean;
  highlighted?: boolean;
}) {
  const monthly = PAID_PLANS[planKey].monthlyPriceUsd;
  const displayPrice =
    interval === "yearly" ? yearlyPriceUsd(planKey) : monthly;
  const priceSuffix = interval === "yearly" ? "/yr" : "/mo";
  const effectiveMonthly = effectiveMonthlyPriceUsd(planKey, interval);

  return (
    <PlanCard
      title={title}
      price={`$${displayPrice}`}
      priceSuffix={priceSuffix}
      highlighted={highlighted}
      subline={
        interval === "yearly"
          ? `~$${effectiveMonthly.toFixed(2)}/mo — save $${YEARLY_FLAT_DISCOUNT_USD} vs. monthly`
          : undefined
      }
    >
      <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
        {bullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>
      <div className="mt-6">
        <SubscribeButton
          plan={planKey}
          interval={interval}
          label={planKey === "pro" ? "Upgrade to Pro" : "Workshop Access"}
          signedIn={signedIn}
        />
      </div>
    </PlanCard>
  );
}

function PlanCard({
  title,
  price,
  priceSuffix,
  subline,
  highlighted,
  children,
}: {
  title: string;
  price: string;
  priceSuffix: string;
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
      <p className="mt-1 text-2xl font-bold text-[var(--accent-red)]">
        {price}
        <span className="text-sm text-[var(--text-muted)]">{priceSuffix}</span>
      </p>
      {subline && <p className="mt-1 text-xs text-[var(--text-muted)]">{subline}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}
