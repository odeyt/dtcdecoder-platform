"use client";

import { useTranslations } from "next-intl";

export default function DtcError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("dtcError");

  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      <div className="glass-panel rounded-[var(--radius-xl)] border border-[var(--border-red)] p-10">
        <p className="font-mono text-xs uppercase tracking-wide text-[var(--accent-red)]">
          {t("eyebrow")}
        </p>
        <h1 className="mt-3 text-xl font-bold text-[var(--text-primary)]">{t("heading")}</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{t("body")}</p>
        <button
          onClick={reset}
          className="mt-6 min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
        >
          {t("retry")}
        </button>
      </div>
    </div>
  );
}
