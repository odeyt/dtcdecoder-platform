"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

// Guest checkout, no password accounts (CLAUDE.md) — a signed-in visitor
// subscribes in one click (server derives their email/id from the
// session); a signed-out visitor gets an inline email field instead of
// being forced through sign-in first, mirroring this app's one-time-
// purchase checkout pattern.
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
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout(body: { plan: string; interval: string; email?: string }) {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  if (signedIn) {
    return (
      <div>
        <button
          onClick={() => startCheckout({ plan, interval })}
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

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startCheckout({ plan, interval, email });
      }}
    >
      <label htmlFor={`subscribe-email-${plan}-${interval}`} className="sr-only">
        {t("emailForCheckout")}
      </label>
      <input
        id={`subscribe-email-${plan}-${interval}`}
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t("emailForCheckout")}
        className="mb-2 min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
      />
      <button
        type="submit"
        disabled={loading}
        className="min-h-11 w-full rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-3 font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        style={{ boxShadow: "var(--shadow-accent)" }}
      >
        {loading ? t("redirecting") : label}
      </button>
      {error && <p className="mt-2 text-center text-xs text-[var(--accent-red)]">{error}</p>}
    </form>
  );
}
