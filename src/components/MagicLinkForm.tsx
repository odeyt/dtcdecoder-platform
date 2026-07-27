"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// `next` (a same-origin relative path, e.g. "/diagnostics/quick?code=P0420")
// round-trips through the magic-link email and back — see
// /account/auth/callback, which is what actually redirects there after
// verifying the sign-in. Lets a visitor sign in from the "Run Full AI
// Diagnosis" flow and land back exactly where they started, DTC code and
// all, instead of always landing on the generic /account page.
export function MagicLinkForm({ initialEmail = "", next }: { initialEmail?: string; next?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");

    const supabase = createClient();
    const callbackUrl = new URL("/account/auth/callback", window.location.origin);
    if (next) callbackUrl.searchParams.set("next", next);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: callbackUrl.toString(),
      },
    });

    setStatus(error ? "error" : "sent");
  }

  if (status === "sent") {
    return (
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        Check <strong>{email}</strong> for a login link.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="rounded-md bg-zinc-900 px-5 py-2 font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {status === "loading" ? "Sending…" : "Email me a login link"}
      </button>
      {status === "error" && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Something went wrong. Try again.
        </p>
      )}
    </form>
  );
}
