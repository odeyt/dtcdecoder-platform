"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { SubscribeButton } from "@/components/SubscribeButton";
import {
  PAID_PLANS,
  YEARLY_FLAT_DISCOUNT_USD,
  yearlyPriceUsd,
  effectiveMonthlyPriceUsd,
  type BillingInterval,
} from "@/lib/pricing";

export function PricingPlans({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("pricing");
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
          {t("yearlySave", { amount: YEARLY_FLAT_DISCOUNT_USD })}
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
            t("proBulletTokens", { tokens: PAID_PLANS.pro.monthlyTokenLimit.toLocaleString() }),
            t("proBullet2"),
            t("proBullet3"),
            t("proBullet4"),
          ]}
          buttonLabel={t("upgradeToPro")}
          signedIn={signedIn}
        />

        <PaidPlanCard
          planKey="workshop"
          title={t("planWorkshop")}
          interval={interval}
          bullets={[
            t("workshopBulletTokens", { tokens: PAID_PLANS.workshop.monthlyTokenLimit.toLocaleString() }),
            t("workshopBullet2"),
            t("workshopBullet3"),
            t("workshopBullet4"),
            t("workshopBullet5"),
          ]}
          buttonLabel={t("workshopAccess")}
          signedIn={signedIn}
        />
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
          ? t("yearlySubline", {
              amount: effectiveMonthly.toFixed(2),
              discount: YEARLY_FLAT_DISCOUNT_USD,
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
