"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export function SubscribeButton({
  plan,
  interval,
  label,
  signedIn,
}: {
  plan: "pro" | "workshop";
  interval: "monthly" | "yearly";
  label: string;
  signedIn: boolean;
}) {
  const t = useTranslations("pricing");
  const tc = useTranslations("common");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!signedIn) {
      window.location.href = "/account/login";
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, interval }),
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
        onClick={handleClick}
        disabled={loading}
        className="min-h-11 w-full rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-3 font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        style={{ boxShadow: "var(--shadow-accent)" }}
      >
        {loading ? t("redirecting") : label}
      </button>
      {error && <p className="mt-2 text-center text-xs text-[var(--accent-red)]">{error}</p>}
    </div>
  );
}
