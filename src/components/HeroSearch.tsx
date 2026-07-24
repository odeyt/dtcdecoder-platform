"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

const SUGGESTIONS = ["P0420", "P0171", "U0101", "P0300", "No crank", "Limp mode"];

// Client-side navigation via useTransition rather than a native form GET —
// this is what makes isPending an honest, real signal (true exactly as
// long as the /dtc server render actually takes), not a fabricated delay.
// See DiagnosticProgress.tsx's own comment for why this app never shows a
// fake progress state.
export function HeroSearch() {
  const t = useTranslations("hero");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);

  function decode(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setPendingLabel(trimmed);
    startTransition(() => {
      router.push(`/dtc?q=${encodeURIComponent(trimmed)}`);
    });
  }

  return (
    <div className="mx-auto w-full max-w-[900px]">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          decode(query);
        }}
      >
        <label htmlFor="hero-search" className="sr-only">
          {t("searchLabel")}
        </label>
        <div
          className="group flex items-center gap-2 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-1)]/90 p-2.5 pl-5 backdrop-blur-xl transition focus-within:border-[var(--border-red)]"
          style={{ boxShadow: "var(--shadow-ambient)" }}
        >
          {isPending ? (
            <svg
              aria-hidden="true"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              className="spinner shrink-0 text-[var(--accent-red)]"
            >
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              className="shrink-0 text-[var(--text-muted)] transition group-focus-within:text-[var(--accent-red)]"
            >
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
          <input
            id="hero-search"
            type="text"
            name="q"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isPending}
            placeholder={t("searchPlaceholder")}
            className="min-h-[60px] flex-1 bg-transparent text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none disabled:opacity-60 sm:text-lg"
          />
          <button
            type="submit"
            disabled={isPending}
            className="min-h-11 shrink-0 rounded-[var(--radius-lg)] bg-[var(--accent-red)] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-80 sm:px-8 sm:py-4 sm:text-base"
            style={{ boxShadow: "var(--shadow-accent)" }}
          >
            {isPending ? t("searching") : t("decode")}
          </button>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap justify-center gap-2" aria-live="polite">
        {SUGGESTIONS.map((s) => {
          const chipPending = isPending && pendingLabel === s;
          return (
            <Link
              key={s}
              href={`/dtc?q=${encodeURIComponent(s)}`}
              aria-disabled={isPending}
              onClick={(e) => {
                e.preventDefault();
                setQuery(s);
                decode(s);
              }}
              className={`min-h-11 rounded-full border px-3 py-1.5 font-mono text-xs transition sm:text-sm ${
                chipPending
                  ? "border-[var(--border-red)] text-[var(--accent-red)]"
                  : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-red)] hover:text-[var(--text-primary)]"
              } ${isPending && !chipPending ? "pointer-events-none opacity-40" : ""}`}
            >
              {chipPending ? `${s} …` : s}
            </Link>
          );
        })}
      </div>

      <p className="mt-6 text-center text-xs text-[var(--text-muted)]">{t("trustLine")}</p>
    </div>
  );
}
