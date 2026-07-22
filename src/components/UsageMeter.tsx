import type { UsageSummary } from "@/lib/ai/assistant";

// Renders real usage only — `summary` always comes from the same counters
// that actually gate requests (checkRateLimit), never a placeholder value.
export function UsageMeter({ summary, planLabel }: { summary: UsageSummary; planLabel: string }) {
  const pct = Math.min(100, Math.round((summary.used / summary.limit) * 100));
  const nearLimit = pct >= 80;

  return (
    <div className="glass-panel rounded-[var(--radius-lg)] p-5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--text-secondary)]">{planLabel} AI usage</span>
        <span className="font-mono text-xs text-[var(--text-muted)]">
          {summary.used.toLocaleString()} / {summary.limit.toLocaleString()} {summary.unit}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${pct}%`,
            backgroundColor: nearLimit ? "var(--accent-red)" : "var(--accent-amber)",
          }}
        />
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        {summary.unit === "queries" ? "Resets daily." : "Resets at the start of next month."}
      </p>
    </div>
  );
}
