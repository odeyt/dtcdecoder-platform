"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");

    const supabase = createClient();
    const redirectTo = new URL("/account/reset-password", window.location.origin).toString();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    // Supabase's resetPasswordForEmail resolves successfully regardless of
    // whether the address has an account (its own anti-enumeration design)
    // — `error` here only reflects a genuine send failure, not "no account".
    setStatus(error ? "error" : "sent");
  }

  if (status === "sent") {
    return (
      <p className="text-sm text-[var(--text-secondary)]">
        If an account exists for <strong className="text-[var(--text-primary)]">{email}</strong>,
        we&apos;ve sent a password reset link.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-2.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="min-h-11 self-start rounded-[var(--radius-md)] bg-[var(--accent-red)] px-5 py-2 font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        style={{ boxShadow: "var(--shadow-accent)" }}
      >
        {status === "loading" ? "Sending…" : "Send reset link"}
      </button>
      {status === "error" && <p className="text-sm text-[var(--accent-red)]">Something went wrong. Try again.</p>}
    </form>
  );
}
