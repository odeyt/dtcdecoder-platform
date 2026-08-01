"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeRedirectPath } from "@/lib/safe-redirect";

// Password sign-in, added alongside the existing magic-link flow (see
// CLAUDE.md — password auth was explicitly requested and approved as an
// override of the original magic-link-only decision). Guest checkout is
// unaffected: buyers still never need a password to purchase, this only
// covers signing in to an existing account.
export function PasswordLoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setErrorMessage(
        error.message === "Invalid login credentials"
          ? "Incorrect email or password."
          : error.message,
      );
      setStatus("error");
      return;
    }

    // Same guard as the server auth callback — a `next` like
    // `/\evil.example` resolves to an external origin, so it must be
    // validated by resolution, not by prefix matching.
    router.push(safeRedirectPath(next, window.location.origin) ?? "/account");
    router.refresh();
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
      <input
        type="password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-2.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="min-h-11 self-start rounded-[var(--radius-md)] bg-[var(--accent-red)] px-5 py-2 font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        style={{ boxShadow: "var(--shadow-accent)" }}
      >
        {status === "loading" ? "Signing in…" : "Sign in"}
      </button>
      {status === "error" && errorMessage && (
        <p className="text-sm text-[var(--accent-red)]">{errorMessage}</p>
      )}
      <Link
        href="/account/forgot-password"
        className="text-sm text-[var(--text-secondary)] underline hover:text-[var(--text-primary)]"
      >
        Forgot password?
      </Link>
    </form>
  );
}
