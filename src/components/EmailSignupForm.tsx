"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

export function EmailSignupForm() {
  const t = useTranslations("emailSignup");
  const locale = useLocale();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">(
    "idle",
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");

    try {
      const res = await fetch("/api/email-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // signup_locale records which language the visitor was using at
        // the moment they signed up — informational only, doesn't change
        // anonymous-submission behavior.
        body: JSON.stringify({ name, email, signupLocale: locale }),
      });
      setStatus(res.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <p className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-center text-sm text-emerald-300">
        {t("success")}
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-md"
    >
      <p className="font-semibold text-white">{t("heading")}</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          placeholder={t("namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-zinc-500"
        />
        <input
          type="email"
          required
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-zinc-500"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="rounded-md bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-60"
        >
          {status === "loading" ? t("sending") : t("submit")}
        </button>
      </div>
      {status === "error" && <p className="mt-2 text-xs text-red-400">{t("error")}</p>}
    </form>
  );
}
