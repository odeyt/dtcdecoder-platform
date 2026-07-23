// Deterministic, data-driven safety screening applied AFTER the AI model's
// reasoning — never relies on prompt text alone to enforce these. A rule
// firing at "block" severity causes the report-assembly step (see
// report.ts) to replace the offending recommendation text with a fixed
// notice rather than passing the AI's wording straight through.
import type { CanonicalDiagnosticInput, DiagnosticAiOutput } from "@/lib/scan-diagnostics/schemas";

export interface SafetyFinding {
  ruleId: string;
  severity: "block" | "warn";
  message: string;
}

export interface SafetyReviewResult {
  verdict: "pass" | "warn" | "block";
  findings: SafetyFinding[];
}

function collectAllText(output: DiagnosticAiOutput): string {
  return [
    output.summary,
    ...output.rankedCauses.flatMap((c) => [c.cause, c.rationale, ...c.supportingEvidence, ...c.contradictingEvidence]),
    ...output.recommendedTests.flatMap((t) => [t.step, t.purpose, t.expectedResult]),
    ...output.safetyWarnings,
  ].join(" \n ");
}

const HIGH_COST_MODULE_PATTERN =
  /\b(replac(?:e|ing|ement)(?: the)?)\s+(?:the\s+)?(ecu|pcm|ecm|bcm|tcm|becm|inverter|abs module|steering rack)\b/i;

const HIGH_VOLTAGE_PATTERN =
  /\b(high[- ]voltage battery|hv battery|traction battery|orange (cable|wiring)|disconnect(?:ing)? the high[- ]voltage)\b/i;
const PPE_LOCKOUT_PATTERN = /\b(ppe|lockout\s*\/?\s*tagout|lock ?out ?tag ?out|qualified (ev |hv )?technician)\b/i;

const AIRBAG_SQUIB_PATTERN = /\b(squib|airbag (deployment )?circuit)\b.*\b(ohmmeter|multimeter|resistance|probe|measure)\b/i;
const AIRBAG_SQUIB_PATTERN_REVERSE = /\b(ohmmeter|multimeter|resistance|probe|measure)\b.*\b(squib|airbag (deployment )?circuit)\b/i;

const IMMOBILIZER_BYPASS_PATTERN = /\bbypass(?:ing)?\s+(?:the\s+)?(immobilizer|security system|anti-?theft)\b/i;

interface SafetyRule {
  id: string;
  severity: "block" | "warn";
  message: string;
  matches(text: string, output: DiagnosticAiOutput, input: CanonicalDiagnosticInput): boolean;
}

const SAFETY_RULES: SafetyRule[] = [
  {
    id: "high-cost-module-replacement-no-tests",
    severity: "block",
    message:
      "A high-cost module replacement (ECU/PCM/BCM/TCM/inverter/ABS module/steering rack) was suggested with no diagnostic test recommended to confirm it first.",
    matches: (text, output) => HIGH_COST_MODULE_PATTERN.test(text) && output.recommendedTests.length === 0,
  },
  {
    id: "high-cost-module-replacement-untested",
    severity: "warn",
    message:
      "A high-cost module replacement was suggested, but none of the recommended tests mention that specific module — confirm a test result actually points to it before replacing it.",
    matches: (text, output) => {
      const match = HIGH_COST_MODULE_PATTERN.exec(text);
      if (!match || output.recommendedTests.length === 0) return false; // no-tests-at-all case is the block rule above
      const moduleName = match[2].toLowerCase();
      const testsMentionModule = output.recommendedTests.some((t) =>
        `${t.step} ${t.purpose} ${t.expectedResult}`.toLowerCase().includes(moduleName),
      );
      return !testsMentionModule;
    },
  },
  {
    id: "ev-high-voltage-missing-ppe-warning",
    severity: "block",
    message:
      "High-voltage EV system content was mentioned without a qualified-technician/PPE/lockout-tagout warning. High-voltage work must never be guided step-by-step here.",
    matches: (text) => HIGH_VOLTAGE_PATTERN.test(text) && !PPE_LOCKOUT_PATTERN.test(text),
  },
  {
    id: "airbag-squib-circuit-probing",
    severity: "block",
    message:
      "Guidance appeared to involve probing/measuring an airbag squib circuit — this is never safe to do with standard shop test equipment.",
    matches: (text) => AIRBAG_SQUIB_PATTERN.test(text) || AIRBAG_SQUIB_PATTERN_REVERSE.test(text),
  },
  {
    id: "immobilizer-security-bypass",
    severity: "block",
    message: "Guidance appeared to involve bypassing an immobilizer or security system, which is out of scope here.",
    matches: (text) => IMMOBILIZER_BYPASS_PATTERN.test(text),
  },
];

export function runSafetyReview(
  output: DiagnosticAiOutput,
  input: CanonicalDiagnosticInput,
): SafetyReviewResult {
  const text = collectAllText(output);
  const findings: SafetyFinding[] = [];

  for (const rule of SAFETY_RULES) {
    if (rule.matches(text, output, input)) {
      findings.push({ ruleId: rule.id, severity: rule.severity, message: rule.message });
    }
  }

  const verdict: SafetyReviewResult["verdict"] = findings.some((f) => f.severity === "block")
    ? "block"
    : findings.length > 0
      ? "warn"
      : "pass";

  return { verdict, findings };
}
