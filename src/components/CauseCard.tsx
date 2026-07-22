// Ranked, not scored — the underlying data is an admin-curated ordered list
// (most common cause first), not a per-cause probability, so we label rank
// honestly rather than attaching a fabricated percentage.
export function CauseCard({ cause, rank }: { cause: string; rank: number }) {
  return (
    <div className="glass-panel flex items-start gap-3 rounded-[var(--radius-lg)] p-4">
      <span
        className="mt-0.5 shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold"
        style={{
          borderColor: rank === 1 ? "var(--accent-red)" : "var(--border-subtle)",
          color: rank === 1 ? "var(--accent-red)" : "var(--text-muted)",
        }}
      >
        {rank === 1 ? "MOST LIKELY" : `#${rank}`}
      </span>
      <p className="text-sm text-[var(--text-secondary)]">{cause}</p>
    </div>
  );
}
