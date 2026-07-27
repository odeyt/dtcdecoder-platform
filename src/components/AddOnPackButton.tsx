"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

// Unlike SubscribeButton, this never needs a guest-checkout email path —
// /api/checkout/addon requires a signed-in session (a balance is useless
// without an account to hold it), and this button only ever renders on the
// already-auth-gated account page.
export function AddOnPackButton({ packId, label }: { packId: string; label: string }) {
  const t = useTranslations("pricing");
  const tc = useTranslations("common");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/checkout/addon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
      });
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
    <div>
      <button
        onClick={startCheckout}
        disabled={loading}
        className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-white/5 disabled:opacity-60"
      >
        {loading ? t("redirecting") : label}
      </button>
      {error && <p className="mt-1 text-xs text-[var(--accent-red)]">{error}</p>}
    </div>
  );
}
