import Link from "next/link";

// Shown only when actually near a limit or gated feature — never as a
// generic sidebar ad, per the "no dark patterns" requirement.
export function UpgradeCard({ reason }: { reason: string }) {
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
        View plans
      </Link>
    </div>
  );
}
