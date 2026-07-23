import Link from "next/link";
import { useTranslations } from "next-intl";

// Shown only when actually near a limit or gated feature — never as a
// generic sidebar ad, per the "no dark patterns" requirement. `reason` is
// supplied by the caller (each caller's copy is translated at its own call
// site) — this component only owns the static "View plans" CTA.
export function UpgradeCard({ reason }: { reason: string }) {
  const t = useTranslations("common");

  return (
    <div
      className="rounded-[var(--radius-lg)] border border-[var(--border-red)] p-5"
      style={{ background: "rgba(225, 29, 46, 0.06)" }}
    >
      <p className="text-sm text-[var(--text-primary)]">{reason}</p>
      <Link
        href="/pricing"
        className="mt-3 inline-block min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110"
      >
        {t("viewPlans")}
      </Link>
    </div>
  );
}
