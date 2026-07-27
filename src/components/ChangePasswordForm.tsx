"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Lets an already-authenticated user set a password for the first time
// (every existing account only has magic-link access today) or change an
// existing one. No current-password confirmation is required — Supabase's
// updateUser() call is authorized by the live session itself, the same
// trust boundary every other authenticated action in this app already
// relies on. Hardcoded English (not run through next-intl) — same scoping
// precedent as LockedResultCard/UnknownDtcResult: this is one small block
// on an otherwise-localized page, not worth a 12-locale translation pass.
export function ChangePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      setStatus("error");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("Passwords don't match.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setErrorMessage(error.message);
      setStatus("error");
      return;
    }

    setPassword("");
    setConfirmPassword("");
    setStatus("success");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        type="password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="New password"
        className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-2.5 text-[var(--text-primary)]"
      />
      <input
        type="password"
        required
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        placeholder="Confirm new password"
        className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-2.5 text-[var(--text-primary)]"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="min-h-11 self-start rounded-[var(--radius-md)] bg-[var(--accent-red)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {status === "loading" ? "Saving…" : "Set password"}
      </button>
      {status === "success" && (
        <p className="text-sm text-[var(--text-secondary)]">Password updated.</p>
      )}
      {status === "error" && errorMessage && (
        <p className="text-sm text-[var(--accent-red)]">{errorMessage}</p>
      )}
    </form>
  );
}
