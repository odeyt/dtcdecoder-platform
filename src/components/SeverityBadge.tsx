import type { DtcSeverity } from "@/lib/types";

const SEVERITY_CONFIG: Record<DtcSeverity, { label: string; color: string; bg: string }> = {
  low: { label: "Low severity", color: "var(--severity-low)", bg: "rgba(107, 165, 201, 0.12)" },
  moderate: {
    label: "Moderate severity",
    color: "var(--severity-moderate)",
    bg: "rgba(217, 154, 63, 0.12)",
  },
  high: {
    label: "High severity",
    color: "var(--severity-high)",
    bg: "rgba(224, 103, 42, 0.14)",
  },
  critical: {
    label: "Critical severity",
    color: "var(--severity-critical)",
    bg: "rgba(225, 29, 46, 0.16)",
  },
};

// Severity is always conveyed by the label text, not color alone — the
// component renders the word "Low/Moderate/High/Critical" every time.
// `label` lets callers pass a localized override; the config label is only
// an English fallback for callers that don't localize.
export function SeverityBadge({ severity, label }: { severity: DtcSeverity; label?: string }) {
  const config = SEVERITY_CONFIG[severity];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
      style={{ color: config.color, backgroundColor: config.bg, borderColor: config.color }}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: config.color }} />
      {label ?? config.label}
    </span>
  );
}
