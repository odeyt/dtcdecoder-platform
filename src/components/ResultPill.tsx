// The one centralized status/severity/safety/system-category pill for the
// Diagnostic Workbench redesign (docs/DIAGNOSTIC_WORKBENCH_ARCHITECTURE.md).
// Scope note: ScanReportView.tsx's existing badges (ConfidenceBadge,
// CategoryBadge, the module-health pill, the pattern-severity pill, the
// safety-finding pill) use their OWN literal vocabularies (e.g.
// ScanSystemStatus = "faulted"|"ok"|"unknown", ScanPatternSeverity =
// "info"|"warn"|"critical") that don't line up 1:1 with the categories below
// — forcing them through this component would mean inventing a severity/
// safety judgment call that the underlying data never actually made. Those
// badges stay as-is; this component is for the new Workbench data (cause
// status, test outcome, and any severity/safety/system classification
// introduced specifically for the redesigned report), via the small
// adapters in scan-diagnostics/pill-mapping.ts where the persisted enum
// spelling differs from this file's canonical labels.
//
// Color is never the only signal: every variant renders its label text.
// Print support is handled globally (see the [data-result-pill] rule in
// globals.css), not per-instance, so this component doesn't need its own
// print: classes.
const SEVERITY_CONFIG = {
  critical: { label: "Critical", color: "var(--pill-red)" },
  high: { label: "High", color: "var(--pill-orange)" },
  medium: { label: "Medium", color: "var(--pill-amber)" },
  low: { label: "Low", color: "var(--pill-blue)" },
  informational: { label: "Informational", color: "var(--pill-gray)" },
} as const;

const SAFETY_CONFIG = {
  do_not_drive: { label: "Do not drive", color: "var(--pill-red)" },
  limited_operation: { label: "Limited operation / caution", color: "var(--pill-orange)" },
  service_soon: { label: "Service soon", color: "var(--pill-amber)" },
  monitor: { label: "Monitor", color: "var(--pill-blue)" },
  no_restriction: { label: "No immediate restriction identified", color: "var(--pill-green)" },
} as const;

const STATUS_CONFIG = {
  confirmed: { label: "Confirmed", color: "var(--pill-green)" },
  supported: { label: "Supported", color: "var(--pill-teal)" },
  suspected: { label: "Suspected", color: "var(--pill-amber)" },
  unverified: { label: "Unverified", color: "var(--pill-gray)" },
  ruled_out: { label: "Ruled out", color: "var(--pill-slate)" },
  failed_test: { label: "Failed test", color: "var(--pill-red)" },
  passed_test: { label: "Passed test", color: "var(--pill-green)" },
  not_tested: { label: "Not tested", color: "var(--pill-gray)" },
  in_progress: { label: "In progress", color: "var(--pill-blue)" },
  action_required: { label: "Action required", color: "var(--pill-orange)" },
} as const;

const SYSTEM_CONFIG = {
  powertrain: { label: "Powertrain", color: "var(--pill-red)" },
  transmission: { label: "Transmission", color: "var(--pill-purple)" },
  electrical: { label: "Electrical", color: "var(--pill-blue)" },
  network_can: { label: "Network / CAN", color: "var(--pill-cyan)" },
  abs_brakes: { label: "ABS / Brakes", color: "var(--pill-orange)" },
  steering: { label: "Steering", color: "var(--pill-indigo)" },
  airbag_srs: { label: "Airbag / SRS", color: "var(--pill-amber)" },
  ev_hybrid: { label: "EV / Hybrid", color: "var(--pill-teal)" },
  hvac: { label: "HVAC", color: "var(--pill-sky)" },
  body: { label: "Body", color: "var(--pill-rose)" },
  informational: { label: "Informational", color: "var(--pill-gray)" },
} as const;

export type SeverityValue = keyof typeof SEVERITY_CONFIG;
export type SafetyValue = keyof typeof SAFETY_CONFIG;
export type DiagnosticStatusValue = keyof typeof STATUS_CONFIG;
export type SystemCategoryValue = keyof typeof SYSTEM_CONFIG;

type ResultPillProps =
  | { category: "severity"; value: SeverityValue; label?: string }
  | { category: "safety"; value: SafetyValue; label?: string }
  | { category: "status"; value: DiagnosticStatusValue; label?: string }
  | { category: "system"; value: SystemCategoryValue; label?: string };

function configFor(props: ResultPillProps): { label: string; color: string } {
  switch (props.category) {
    case "severity":
      return SEVERITY_CONFIG[props.value];
    case "safety":
      return SAFETY_CONFIG[props.value];
    case "status":
      return STATUS_CONFIG[props.value];
    case "system":
      return SYSTEM_CONFIG[props.value];
  }
}

// label prop overrides the default English text — the integration point
// for localized callers (useTranslations) without this component itself
// depending on next-intl, so it stays usable from both server and client
// components regardless of locale context.
export function ResultPill(props: ResultPillProps) {
  const config = configFor(props);
  const label = props.label ?? config.label;

  return (
    <span
      data-result-pill
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap"
      style={{
        color: config.color,
        backgroundColor: `color-mix(in srgb, ${config.color} 14%, transparent)`,
        borderColor: config.color,
      }}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: config.color }} />
      {label}
    </span>
  );
}
