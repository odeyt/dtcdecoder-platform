"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { cancelSubscriptionAction, resumeSubscriptionAction } from "@/app/(app)/account/billing-actions";

interface OwnSubscription {
  status: "active" | "past_due" | "canceled";
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  isComp: boolean;
}

type Mode = "idle" | "confirmingCancel";

export function SubscriptionBillingCard({
  planLabel,
  subscription,
  locale,
}: {
  planLabel: string;
  subscription: OwnSubscription | null;
  locale: string;
}) {
  const t = useTranslations("account");
  const [mode, setMode] = useState<Mode>("idle");
  const [busy, setBusy] = useState(false);
  // Separate from `busy` (cancel/resume-specific) so this button's
  // disabled/label state never gets confused with cancel/resume's, even if
  // both could theoretically be interacted with in quick succession.
  const [portalLoading, setPortalLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const periodEndLabel = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString(locale)
    : "";

  async function handleCancel() {
    setBusy(true);
    setErrorMessage(null);
    const result = await cancelSubscriptionAction();
    setBusy(false);
    if (result.error) {
      setErrorMessage(result.error);
      return;
    }
    setMode("idle");
  }

  async function handleResume() {
    setBusy(true);
    setErrorMessage(null);
    const result = await resumeSubscriptionAction();
    setBusy(false);
    if (result.error) {
      setErrorMessage(result.error);
    }
  }

  async function handleManagePayment() {
    setPortalLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/account/billing-portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.portalUrl) {
        setErrorMessage(data.error ?? t("billingPortalFailed"));
        setPortalLoading(false);
        return;
      }
      window.location.href = data.portalUrl;
    } catch {
      setErrorMessage(t("billingPortalFailed"));
      setPortalLoading(false);
    }
  }

  return (
    <div className="glass-panel rounded-[var(--radius-xl)] p-6">
      <p className="text-sm text-[var(--text-secondary)]">{t("currentPlan")}</p>
      <p className="mt-1 text-xl font-bold text-[var(--text-primary)]">{planLabel}</p>

      {!subscription && (
        <Link
          href="/pricing"
          className="mt-4 inline-block min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110"
        >
          {t("upgradeToPro")}
        </Link>
      )}

      {subscription?.isComp && <p className="mt-3 text-sm text-[var(--text-secondary)]">{t("billingCompNotice")}</p>}

      {subscription && !subscription.isComp && !subscription.cancelAtPeriodEnd && (
        <>
          {periodEndLabel && (
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              {t("billingRenewsOn", { date: periodEndLabel })}
            </p>
          )}
          <button
            type="button"
            onClick={handleManagePayment}
            disabled={portalLoading}
            className="mt-3 min-h-11 rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:border-[var(--border-red)] hover:text-[var(--text-primary)] disabled:opacity-60"
          >
            {portalLoading ? t("billingPortalRedirecting") : t("billingManagePaymentButton")}
          </button>
          {mode === "idle" && errorMessage && (
            <p className="mt-2 text-xs text-[var(--accent-red)]">{errorMessage}</p>
          )}
          {mode === "idle" ? (
            <button
              type="button"
              onClick={() => {
                setErrorMessage(null);
                setMode("confirmingCancel");
              }}
              className="mt-3 min-h-11 rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:border-[var(--border-red)] hover:text-[var(--text-primary)]"
            >
              {t("billingCancelButton")}
            </button>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-sm text-[var(--text-secondary)]">
                {t("billingCancelConfirmPrompt", { date: periodEndLabel })}
              </p>
              {errorMessage && <p className="text-xs text-[var(--accent-red)]">{errorMessage}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={busy}
                  className="min-h-11 rounded-full bg-[var(--accent-red)] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
                >
                  {busy ? t("billingCanceling") : t("billingCancelConfirmButton")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage(null);
                    setMode("idle");
                  }}
                  disabled={busy}
                  className="min-h-11 rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:border-[var(--border-red)] hover:text-[var(--text-primary)] disabled:opacity-60"
                >
                  {t("billingKeepPlanButton")}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {subscription && !subscription.isComp && subscription.cancelAtPeriodEnd && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-sm text-[var(--text-secondary)]">{t("billingEndsOn", { date: periodEndLabel })}</p>
          <button
            type="button"
            onClick={handleManagePayment}
            disabled={portalLoading}
            className="self-start min-h-11 rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:border-[var(--border-red)] hover:text-[var(--text-primary)] disabled:opacity-60"
          >
            {portalLoading ? t("billingPortalRedirecting") : t("billingManagePaymentButton")}
          </button>
          {errorMessage && <p className="text-xs text-[var(--accent-red)]">{errorMessage}</p>}
          <button
            type="button"
            onClick={handleResume}
            disabled={busy}
            className="min-h-11 self-start rounded-full bg-[var(--accent-red)] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? t("billingResuming") : t("billingResumeButton")}
          </button>
        </div>
      )}
    </div>
  );
}
