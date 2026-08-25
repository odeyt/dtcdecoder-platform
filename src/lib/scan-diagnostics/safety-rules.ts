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

// --- M-DIAG0.1 additions: brakes / steering / fuel / unsafe road tests -----
// Owner decision #1 (M-DIAG0.1): close these four safety-rule gaps
// immediately. Same design as the rules above — a signal pattern detecting
// that the AI's own text touches a safety-critical procedure, paired with
// a required-language pattern that must ALSO be present, or the rule
// fires. Deliberately narrow signal patterns (specific verbs/nouns, not
// bare system names) so ordinary diagnostic discussion of these systems is
// never blocked — only unsafe or under-specified procedural guidance is.

const BRAKE_HYDRAULIC_WORK_PATTERN =
  /\b(open(?:ing)?\s+(?:the\s+)?(?:a\s+)?(brake\s+line|brake\s+hose|hydraulic\s+brake\s+system)|brake\s+(?:line|hose)\s+(?:repair|replace(?:ment)?|disconnect(?:ion)?)|bleed(?:ing)?\s+(?:the\s+)?brakes?|brake\s+bleed(?:ing)?|abs\s+(?:hydraulic\s+control\s+unit|hcu)\s+(?:bleed|service|repair)|brake\s+(?:pressure|line)\s+test(?:ing)?)\b/i;
const BRAKE_SAFETY_LANGUAGE_PATTERN =
  /\b(manufacturer(?:'s)?\s+(?:bleed(?:ing)?\s+)?procedure|proper\s+bleed(?:ing)?\s+sequence|bench\s+bleed|pressure\s+bleeder|vacuum\s+bleeder|stationary\s+(?:test|verification)|do\s+not\s+road\s+test|before\s+road\s+testing|qualified\s+technician|verify\s+(?:a\s+)?(?:firm\s+)?pedal\s+(?:feel|firmness)|firm\s+pedal\s+before)\b/i;

const BRAKE_ROAD_TEST_HAZARD_PATTERN =
  /\b(road\s+test|test\s+drive)\b(?:(?!\.).){0,80}\b(brake\s+(?:fault|defect|failure|fluid\s+loss)|spongy\s+(?:brake\s+)?pedal|pedal\s+(?:goes\s+to\s+the\s+floor|fades?|sinks?)|no\s+brakes?|loss\s+of\s+brak(?:e|ing))\b|\b(brake\s+(?:fault|defect|failure|fluid\s+loss)|spongy\s+(?:brake\s+)?pedal|pedal\s+(?:goes\s+to\s+the\s+floor|fades?|sinks?)|no\s+brakes?|loss\s+of\s+brak(?:e|ing))\b(?:(?!\.).){0,80}\b(road\s+test|test\s+drive)\b/i;
const ROAD_TEST_MITIGATION_PATTERN =
  /\b(stationary\s+test|lift\s+test|on\s+(?:the\s+)?(?:lift|hoist)|controlled(?:,?\s+low-speed)?\s+(?:private[- ]area\s+)?test|tow(?:ed|ing)?\s+(?:the\s+vehicle\s+)?(?:to|for)|do\s+not\s+road\s+test|never\s+road\s+test)\b/i;

const STEERING_WORK_PATTERN =
  /\b(steering\s+(?:rack|column)\s+removal|remov(?:e|ing)\s+(?:the\s+)?steering\s+(?:rack|column)|eps\s+power\s+circuit|pscm\s+power\s+circuit|steering[- ]angle\s+calibration|(?:steering|column)\s+lock\s+(?:actuator|solenoid|motor)\s+(?:removal|replace(?:ment)?)|disconnect(?:ing|ed)?\s+(?:the\s+)?steering\s+(?:shaft|coupler|column))\b/i;
const STEERING_SAFETY_LANGUAGE_PATTERN =
  /\b(secure(?:ly)?\s+(?:lift|support)|jack\s+stands|(?:proper|correct)\s+connector\s+orientation|verify\s+connector\s+orientation\s+before|calibration\s+procedure|programming\s+procedure|qualified\s+technician|do\s+not\s+road\s+test)\b/i;

const STEERING_LOCK_BYPASS_PATTERN =
  /\bbypass(?:ing)?\s+(?:the\s+)?(steering\s+lock|column\s+lock|electronic\s+steering\s+lock|esl)\b/i;

// Matches the hazard phrase regardless of word order ("intermittently lost
// power steering assist" vs. "power steering assist was intermittently
// lost") — real AI-generated prose puts the subject and the fault verb in
// either order.
const STEERING_ASSIST_HAZARD_PATTERN =
  /\b((?:no|heavy|intermittent(?:ly)?)\b(?:(?!\.).){0,20}\b(?:power\s+)?steering\s+assist|steering\s+assist\b(?:(?!\.).){0,20}\b(?:lost|unavailable|intermittent(?:ly)?|fault)|loss\s+of\s+(?:power\s+)?steering)\b/i;
const STEERING_ROAD_TEST_HAZARD_PATTERN =
  new RegExp(
    `\\b(road\\s+test|test\\s+drive)\\b(?:(?!\\.).){0,80}${STEERING_ASSIST_HAZARD_PATTERN.source}` +
      `|${STEERING_ASSIST_HAZARD_PATTERN.source}(?:(?!\\.).){0,80}\\b(road\\s+test|test\\s+drive)\\b`,
    "i",
  );

const FUEL_PRESSURIZED_WORK_PATTERN =
  /\b(open(?:ing)?\s+(?:the\s+)?(?:a\s+)?(?:pressurized\s+)?fuel\s+(?:line|rail|system)|gdi\s+(?:high[- ]pressure\s+)?fuel\s+(?:pump|rail|system)|common[- ]rail\s+diesel\s+(?:fuel\s+)?system|activat(?:e|ing)\s+(?:the\s+)?fuel\s+pump|fuel\s+pump\s+activation|leak\s+test(?:ing)?\s+(?:the\s+)?fuel|fuel\s+tank\s+(?:removal|repair|service)|(?:evap|vapor)\s+system\s+(?:service|repair|test))\b/i;
const FUEL_SAFETY_LANGUAGE_PATTERN =
  /\b(relieve\s+(?:fuel\s+system\s+)?pressure|pressure\s+relief\s+procedure|manufacturer(?:'s)?\s+(?:fuel\s+)?procedure|ventilat(?:e|ion|ed)|fire\s+extinguisher|no\s+open\s+flame|intrinsically\s+safe|qualified\s+technician)\b/i;

const FUEL_IGNITION_HAZARD_PATTERN =
  /\b(open\s+flame|lit\s+cigarette|non[- ]intrinsically[- ]safe|test\s+light|spark(?:s|ing)?)\b(?:(?!\.).){0,60}\bfuel\b|\bfuel\b(?:(?!\.).){0,60}\b(open\s+flame|lit\s+cigarette|non[- ]intrinsically[- ]safe|test\s+light|spark(?:s|ing)?)\b/i;

// General road-test hazard categories not already covered by the
// brake/steering-specific road-test rules above.
const GENERAL_ROAD_TEST_PATTERN = /\b(road\s+test|test\s+drive)\b/i;
const GENERAL_ROAD_TEST_HAZARD_PATTERN =
  /\b(fuel\s+leak|unsecured\s+(?:component|part|panel|cover)|(?:airbag|srs)\s+(?:hazard|fault|warning)|(?:high[- ]voltage|hv)\s+isolation\s+fault|severe(?:ly)?\s+overheat(?:ing|ed)?|engine\s+(?:severely\s+)?overheat(?:ing|ed)|unstable\s+charging\s+voltage|(?:unsafe|worn|damaged)\s+(?:tires?|wheels?|suspension)\s+for\s+travel)\b/i;

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
  // --- M-DIAG0.1 additions ------------------------------------------------
  {
    id: "brake-hydraulic-work-missing-safety-guidance",
    severity: "block",
    message:
      "Braking is safety-critical. Hydraulic brake system work (opening a brake line/hose, ABS hydraulic control unit service, bleeding, or pressure testing) was suggested without confirming the correct manufacturer procedure and equipment, verifying a firm pedal with a stationary test before any controlled road test, and prohibiting an unsafe road test. Escalate to a qualified technician if the correct procedure isn't confirmed.",
    matches: (text) => BRAKE_HYDRAULIC_WORK_PATTERN.test(text) && !BRAKE_SAFETY_LANGUAGE_PATTERN.test(text),
  },
  {
    id: "brake-unsafe-road-test-with-fault",
    severity: "block",
    message:
      "A road test was suggested while an unresolved braking fault (fluid loss, a spongy or fading pedal, or loss of braking) was present. Never road-test a vehicle with an unresolved brake defect — verify braking with a stationary or lift test first, or tow the vehicle for further diagnosis.",
    matches: (text) => BRAKE_ROAD_TEST_HAZARD_PATTERN.test(text) && !ROAD_TEST_MITIGATION_PATTERN.test(text),
  },
  {
    id: "steering-work-missing-safety-guidance",
    severity: "block",
    message:
      "Steering-system work (rack/column removal, EPS/PSCM power circuit work, steering-angle calibration, or steering/column-lock actuator work) was suggested without confirming secure lifting/support, correct connector orientation before probing, and the required calibration/programming procedure where applicable.",
    matches: (text) => STEERING_WORK_PATTERN.test(text) && !STEERING_SAFETY_LANGUAGE_PATTERN.test(text),
  },
  {
    id: "steering-lock-security-bypass",
    severity: "block",
    message:
      "Guidance appeared to involve bypassing a steering lock or column lock, which is out of scope here — this is distinct from legitimately diagnosing a faulted steering-lock or column-lock system.",
    matches: (text) => hasNonNegatedMatch(STEERING_LOCK_BYPASS_PATTERN, text),
  },
  {
    id: "steering-unsafe-road-test-with-fault",
    severity: "block",
    message:
      "A road test was suggested while steering assist was reported as heavy, intermittent, or unavailable. Never road-test a vehicle with unresolved loss of steering assist — verify with a stationary or lift test first, or tow the vehicle for further diagnosis.",
    matches: (text) => STEERING_ROAD_TEST_HAZARD_PATTERN.test(text) && !ROAD_TEST_MITIGATION_PATTERN.test(text),
  },
  {
    id: "fuel-system-pressurized-work-missing-safety-guidance",
    severity: "block",
    message:
      "Work on a pressurized fuel system (GDI high-pressure fuel, common-rail diesel, fuel pump activation, leak testing, or fuel tank/vapor-system work) was suggested without confirming a pressure-relief procedure, ventilation and fire precautions, or escalation to a qualified technician when the exact procedure isn't known. Never activate or probe a pressurized fuel system without relieving pressure first.",
    matches: (text) => FUEL_PRESSURIZED_WORK_PATTERN.test(text) && !FUEL_SAFETY_LANGUAGE_PATTERN.test(text),
  },
  {
    id: "fuel-system-ignition-source-hazard",
    severity: "block",
    message:
      "Guidance appeared to combine fuel-system work with an ignition source (open flame, spark-producing tool, or a test light not rated intrinsically safe) — this is never safe and must not be attempted.",
    matches: (text) => FUEL_IGNITION_HAZARD_PATTERN.test(text),
  },
  {
    id: "unsafe-road-test-general-hazard",
    severity: "block",
    message:
      "A road test was suggested in the presence of a hazard (fuel leak, unsecured component, airbag/SRS hazard, high-voltage isolation fault, severe overheating, unstable charging voltage, or tires/wheels/suspension unsafe for travel) without converting it to a stationary test, lift test, controlled low-speed test, or towing recommendation. A warning light alone does not establish roadworthiness — resolve or explicitly rule out the hazard before any road test.",
    matches: (text) =>
      GENERAL_ROAD_TEST_PATTERN.test(text) &&
      GENERAL_ROAD_TEST_HAZARD_PATTERN.test(text) &&
      !ROAD_TEST_MITIGATION_PATTERN.test(text),
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
  "brake-hydraulic-work-missing-safety-guidance": [BRAKE_HYDRAULIC_WORK_PATTERN],
  "brake-unsafe-road-test-with-fault": [BRAKE_ROAD_TEST_HAZARD_PATTERN],
  "steering-work-missing-safety-guidance": [STEERING_WORK_PATTERN],
  "steering-lock-security-bypass": [STEERING_LOCK_BYPASS_PATTERN],
  "steering-unsafe-road-test-with-fault": [STEERING_ROAD_TEST_HAZARD_PATTERN],
  "fuel-system-pressurized-work-missing-safety-guidance": [FUEL_PRESSURIZED_WORK_PATTERN],
  "fuel-system-ignition-source-hazard": [FUEL_IGNITION_HAZARD_PATTERN],
  "unsafe-road-test-general-hazard": [GENERAL_ROAD_TEST_HAZARD_PATTERN],
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
