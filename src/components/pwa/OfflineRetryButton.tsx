"use client";

export function OfflineRetryButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
    >
      {label}
    </button>
  );
}
