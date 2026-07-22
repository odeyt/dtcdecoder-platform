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
      <div className="mx-auto flex w-fit rounded-full border border-white/10 bg-white/5 p-1">
        <button
          onClick={() => setInterval("yearly")}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
            interval === "yearly" ? "bg-red-600 text-white" : "text-zinc-400"
          }`}
        >
          Yearly — Save ${YEARLY_FLAT_DISCOUNT_USD}
        </button>
        <button
          onClick={() => setInterval("monthly")}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
            interval === "monthly" ? "bg-red-600 text-white" : "text-zinc-400"
          }`}
        >
          Monthly
        </button>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <PlanCard title="Free" price="$0" priceSuffix="/mo">
          <ul className="space-y-2 text-sm text-zinc-300">
            <li>Basic DTC lookup</li>
            <li>5 AI searches per day</li>
            <li>Public repair tips</li>
          </ul>
          <Link
            href={signedIn ? "/dtc" : "/account/login"}
            className="mt-6 block rounded-full border border-white/20 px-6 py-3 text-center font-semibold text-white transition hover:bg-white/10"
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

      <p className="mt-6 text-center text-xs text-zinc-500">
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
      <ul className="space-y-2 text-sm text-zinc-300">
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
      className={`rounded-2xl border p-6 backdrop-blur-md ${
        highlighted
          ? "border-red-500/40 bg-gradient-to-b from-red-600/10 to-transparent shadow-[0_0_30px_rgba(255,30,45,0.15)]"
          : "border-white/10 bg-white/5"
      }`}
    >
      <h2 className="text-xl font-bold text-white">{title}</h2>
      <p className="mt-1 text-2xl font-bold text-red-400">
        {price}
        <span className="text-sm text-zinc-400">{priceSuffix}</span>
      </p>
      {subline && <p className="mt-1 text-xs text-zinc-500">{subline}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}
