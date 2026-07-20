"use client";

import { useState } from "react";

export function PurchaseButton({
  productId,
  priceLabel,
}: {
  productId: string;
  priceLabel: string;
}) {
  const billingEnabled = process.env.NEXT_PUBLIC_BILLING_ENABLED === "true";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, email }),
      });

      const data = await res.json();

      if (!res.ok || !data.checkoutUrl) {
        setErrorMessage(data.error ?? "Something went wrong. Try again.");
        setStatus("error");
        return;
      }

      window.location.href = data.checkoutUrl;
    } catch {
      setErrorMessage("Something went wrong. Try again.");
      setStatus("error");
    }
  }

  return (
    !billingEnabled ? (
      <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
        Purchasing is temporarily unavailable while checkout is being configured.
      </p>
    ) :
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Email (for your receipt and download link)
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      <button
        type="submit"
        disabled={status === "loading"}
        className="rounded-md bg-zinc-900 px-5 py-3 font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {status === "loading" ? "Redirecting to checkout…" : `Buy now — ${priceLabel}`}
      </button>
      {errorMessage && (
        <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
      )}
    </form>
  );
}
