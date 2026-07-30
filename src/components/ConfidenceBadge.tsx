import { CONFIDENCE_LABEL, resolveConfidenceLabel } from "@/lib/scan-diagnostics/report-presentation";

// Confidence (how sure the AI is about a conclusion) is a distinct
// dimension from ResultPill's severity/safety/status/system categories —
// "high confidence" is reassuring (green) while "high severity" is a
// warning (red), so this isn't unified with ResultPill; see the scope note
// at the top of ResultPill.tsx.
const CONFIDENCE_COLOR: Record<string, string> = {
  high: "var(--severity-low)",
  medium: "var(--accent-amber)",
  low: "var(--severity-high)",
  insufficient_evidence: "var(--text-muted)",
};

// `label` overrides the English default from resolveConfidenceLabel — the
// integration point for localized callers (useTranslations/getTranslations),
// same pattern as ResultPill's label prop.
export function ConfidenceBadge({ level, label: labelOverride }: { level?: string | null; label?: string }) {
  const label = labelOverride ?? resolveConfidenceLabel(level);
  const isEstablished = level && CONFIDENCE_LABEL[level];
  return (
    <span
      aria-label={`Diagnostic confidence: ${label}`}
      className="rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold"
      style={{
        borderColor: isEstablished ? CONFIDENCE_COLOR[level as string] : "var(--border-subtle)",
        color: isEstablished ? CONFIDENCE_COLOR[level as string] : "var(--text-muted)",
      }}
    >
      {label.toUpperCase()}
    </span>
  );
}
