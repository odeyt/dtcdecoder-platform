"use client";

import { useState } from "react";

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
        setError(data.error ?? "Something went wrong. Try again.");
        setLoading(false);
        return;
      }

      window.location.href = data.checkoutUrl;
    } catch {
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className="w-full rounded-full bg-red-600 px-6 py-3 font-semibold text-white shadow-[0_0_20px_rgba(255,30,45,0.35)] transition hover:bg-red-500 disabled:opacity-60"
      >
        {loading ? "Redirecting…" : label}
      </button>
      {error && <p className="mt-2 text-center text-xs text-red-400">{error}</p>}
    </div>
  );
}
