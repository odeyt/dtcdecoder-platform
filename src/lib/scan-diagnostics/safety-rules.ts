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

// The pattern above is already scoped to an actual bypass VERB next to the
// system name — "read immobilizer authorization status" never matches it.
// But collectAllText() scans the model's own free-text output (summary,
// rationale, safety warnings, etc.), and a model discussing a
// security-adjacent system will sometimes write a CAUTIONARY sentence that
// still contains the words "bypass" and "immobilizer" together — e.g.
// "confirm the technician does not need to bypass the immobilizer." A
// plain substring test can't distinguish that from an actual instruction,
// so any match is checked against nearby negation cues before counting as
// a genuine bypass finding.
const NEGATION_CUE_PATTERN =
  /\b(not|never|n't|without|avoid(?:ing)?|no need to|must not|cannot|do not|does not|did not|should not|shall not|never attempt|refrain from)\b/i;

function hasNonNegatedMatch(pattern: RegExp, text: string): boolean {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const global = new RegExp(pattern.source, flags);
  let match: RegExpExecArray | null;
  while ((match = global.exec(text)) !== null) {
    const precedingStart = Math.max(0, match.index - 60);
    const preceding = text.slice(precedingStart, match.index);
    if (!NEGATION_CUE_PATTERN.test(preceding)) return true;
    if (match[0].length === 0) global.lastIndex += 1; // avoid an infinite loop on a zero-width match
  }
  return false;
}

// Communication/network-fault context — a module replacement recommended
// in this context specifically needs power/ground/battery/network
// confirmation first (a "lost communication" code is very often a wiring,
// splice, termination, or power/ground issue upstream of the module the
// code happens to be reported against, not the module itself). Distinct
// from the generic HIGH_COST_MODULE_PATTERN rules above, which only check
// that SOME test was recommended, not that the RIGHT KIND of test was.
const COMM_FAULT_CONTEXT_PATTERN =
  /\b(lost communication|no communication|not communicating|network fault|can\s*bus|bus[- ]off|frame lost|node (missing|lost)|message (lost|timeout)|u0\d{3})\b/i;
const POWER_GROUND_NETWORK_TEST_PATTERN =
  /\b(power supply|ground (integrity|test|circuit)|battery (voltage|test|condition)|network (topology|resistance|termination)|bias voltage|voltage drop|continuity|short(?:s|ed)?\b|open circuit|splice|terminating resistor|can (high|low)|reference voltage)\b/i;

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
    matches: (text) => hasNonNegatedMatch(IMMOBILIZER_BYPASS_PATTERN, text),
  },
  {
    id: "comm-fault-module-replacement-without-power-ground-network-tests",
    severity: "warn",
    message:
      "A module replacement was suggested in the context of a communication/network fault, but none of the recommended tests cover power, ground, battery, or network-specific checks (voltage, resistance, termination, continuity, splice points) — a communication DTC is frequently a wiring/power/ground issue upstream of the named module, not the module itself. Confirm those first.",
    matches: (text, output) => {
      if (!COMM_FAULT_CONTEXT_PATTERN.test(text) || !HIGH_COST_MODULE_PATTERN.test(text)) return false;
      const testsText = output.recommendedTests.map((t) => `${t.step} ${t.purpose} ${t.expectedResult}`).join(" ");
      return !POWER_GROUND_NETWORK_TEST_PATTERN.test(testsText);
    },
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

const REDACTION_NOTICE =
  "[This recommendation required an in-person qualified technician review and was not included automatically — see safety warnings below.]";

// Maps each "block" rule to the pattern(s) that should trigger redaction of
// the specific text that tripped it — never a blanket wipe of the whole
// report, and never a silent deletion (the redaction notice is visible,
// and the rule's message is appended to safetyWarnings).
const BLOCK_RULE_PATTERNS: Record<string, RegExp[]> = {
  "high-cost-module-replacement-no-tests": [HIGH_COST_MODULE_PATTERN],
  "ev-high-voltage-missing-ppe-warning": [HIGH_VOLTAGE_PATTERN],
  "airbag-squib-circuit-probing": [AIRBAG_SQUIB_PATTERN, AIRBAG_SQUIB_PATTERN_REVERSE],
  "immobilizer-security-bypass": [IMMOBILIZER_BYPASS_PATTERN],
};

export function redactBlockedContent(
  output: DiagnosticAiOutput,
  findings: SafetyFinding[],
): DiagnosticAiOutput {
  const blockFindings = findings.filter((f) => f.severity === "block");
  if (blockFindings.length === 0) return output;

  const patterns = blockFindings.flatMap((f) => BLOCK_RULE_PATTERNS[f.ruleId] ?? []);
  const redactText = (text: string) => (patterns.some((p) => p.test(text)) ? REDACTION_NOTICE : text);

  return {
    ...output,
    rankedCauses: output.rankedCauses.map((c) => ({
      ...c,
      cause: redactText(c.cause),
      rationale: redactText(c.rationale),
    })),
    recommendedTests: output.recommendedTests.map((t) => ({
      ...t,
      step: redactText(t.step),
      purpose: redactText(t.purpose),
      expectedResult: redactText(t.expectedResult),
    })),
    safetyWarnings: [...output.safetyWarnings, ...blockFindings.map((f) => f.message)],
  };
}
