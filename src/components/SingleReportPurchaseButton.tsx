"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

// Unlike AddOnPackButton (account-page-only, requires an existing paid
// plan), this is meant to be reachable by anyone, including an anonymous
// or Free-tier visitor on the public pricing page — redemption still
// needs a real user_id (see single-report-purchases.ts), so an anonymous
// visitor is sent to sign in first rather than offered a guest-email
// checkout.
export function SingleReportPurchaseButton({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("pricing");
  const tc = useTranslations("common");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <Link
        href="/account/login?next=%2Fpricing"
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-6 py-3 text-center font-semibold text-[var(--text-primary)] transition hover:bg-white/5"
      >
        {t("singleReportCta")}
      </Link>
    );
  }

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

  return (
    <div className="mt-4">
      <button
        onClick={startCheckout}
        disabled={loading}
        className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-6 py-3 font-semibold text-[var(--text-primary)] transition hover:bg-white/5 disabled:opacity-60 sm:w-auto"
      >
        {loading ? t("redirecting") : t("singleReportCta")}
      </button>
      {error && <p className="mt-1 text-xs text-[var(--accent-red)]">{error}</p>}
    </div>
  );
}
