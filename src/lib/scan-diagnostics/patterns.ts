// Deterministic, pre-AI pattern detection over a CanonicalVehicleScan.
// Every pattern here is a rule-based finding computed from extracted facts
// only — never something the AI asserted (see canonical-scan.ts's
// "canonical vs AI interpretation" boundary). Persisted to scan_patterns
// (migration 0028) and also passed into the AI prompt as context so the
// model's own reasoning is informed by them, per
// docs/SCAN_PATTERN_AND_PRIORITY_ENGINE.md.
import type { CanonicalVehicleScan, CanonicalDtc } from "@/lib/scan-diagnostics/canonical-scan";
import type { ScanPatternSeverity } from "@/lib/types";

export const PATTERN_RULES_VERSION = "2026-07-pattern-v1";

export type PatternType =
  | "multi_module_low_voltage"
  | "network_communication_event"
  | "single_node_failure"
  | "bus_off_condition"
  | "current_powertrain_with_historical_secondary"
  | "safety_system_active_fault"
  | "possible_common_cause";

export interface DetectedPattern {
  patternType: PatternType;
  severity: ScanPatternSeverity;
  name: string;
  evidence: Record<string, unknown>;
  affectedModules: string[];
  ruleVersion: string;
}

function distinctSystems(dtcs: CanonicalDtc[]): string[] {
  return [...new Set(dtcs.map((d) => d.systemName).filter((s): s is string => Boolean(s)))];
}

// Extracts the module a "lost communication" style description names as
// its target (e.g. "Lost Communication With EMS" -> "EMS"), when
// recognizable — used to detect a single node many other modules all lose
// contact with, distinct from a generic network-wide event.
const LOST_COMM_TARGET_PATTERN = /lost\s*com[mu]?u?nication\s*with\s+([a-z0-9 /&-]+?)(?:\s*\(|\.|,|$)/i;

function extractLostCommTarget(description: string | null): string | null {
  if (!description) return null;
  const match = description.match(LOST_COMM_TARGET_PATTERN);
  return match ? match[1].trim().toUpperCase() : null;
}

function multiModuleLowVoltage(scan: CanonicalVehicleScan): DetectedPattern | null {
  const batteryDtcs = scan.allDtcs.filter((d) => d.batteryRelevance);
  const systems = distinctSystems(batteryDtcs);
  if (batteryDtcs.length < 2 || systems.length < 2) return null;
  return {
    patternType: "multi_module_low_voltage",
    severity: "warn",
    name: "Multi-module low-voltage event",
    evidence: { codes: batteryDtcs.map((d) => d.normalizedCode), systems },
    affectedModules: systems,
    ruleVersion: PATTERN_RULES_VERSION,
  };
}

function networkCommunicationEvent(scan: CanonicalVehicleScan): DetectedPattern | null {
  const networkDtcs = scan.allDtcs.filter((d) => d.networkRelevance);
  const systems = distinctSystems(networkDtcs);
  if (networkDtcs.length < 3 || systems.length < 2) return null;
  return {
    patternType: "network_communication_event",
    severity: "warn",
    name: "Vehicle-wide network communication event",
    evidence: { codeCount: networkDtcs.length, codes: networkDtcs.map((d) => d.normalizedCode), systems },
    affectedModules: systems,
    ruleVersion: PATTERN_RULES_VERSION,
  };
}

const SINGLE_NODE_MIN_MENTIONS = 3;

function singleNodeFailure(scan: CanonicalVehicleScan): DetectedPattern | null {
  const targetCounts = new Map<string, { count: number; systems: Set<string>; codes: string[] }>();
  for (const dtc of scan.allDtcs) {
    const target = extractLostCommTarget(dtc.description);
    if (!target) continue;
    const entry = targetCounts.get(target) ?? { count: 0, systems: new Set<string>(), codes: [] };
    entry.count += 1;
    if (dtc.systemName) entry.systems.add(dtc.systemName);
    entry.codes.push(dtc.normalizedCode);
    targetCounts.set(target, entry);
  }

  let best: { target: string; count: number; systems: Set<string>; codes: string[] } | null = null;
  for (const [target, entry] of targetCounts) {
    if (entry.count >= SINGLE_NODE_MIN_MENTIONS && entry.systems.size >= 2) {
      if (!best || entry.count > best.count) best = { target, ...entry };
    }
  }
  if (!best) return null;

  return {
    patternType: "single_node_failure",
    severity: "critical",
    name: `Multiple modules report lost communication with ${best.target}`,
    evidence: { target: best.target, mentionCount: best.count, codes: best.codes, systems: [...best.systems] },
    affectedModules: [...best.systems],
    ruleVersion: PATTERN_RULES_VERSION,
  };
}

function busOffCondition(scan: CanonicalVehicleScan): DetectedPattern | null {
  const busOffDtcs = scan.allDtcs.filter((d) => d.busOffRelevance);
  if (busOffDtcs.length === 0) return null;
  return {
    patternType: "bus_off_condition",
    severity: "critical",
    name: "CAN bus-off condition reported",
    evidence: { codes: busOffDtcs.map((d) => d.normalizedCode), systems: distinctSystems(busOffDtcs) },
    affectedModules: distinctSystems(busOffDtcs),
    ruleVersion: PATTERN_RULES_VERSION,
  };
}

function currentPowertrainWithHistoricalSecondary(scan: CanonicalVehicleScan): DetectedPattern | null {
  const currentPowertrain = scan.allDtcs.filter((d) => d.status === "current" && /^P/i.test(d.normalizedCode));
  const historicalNetwork = scan.allDtcs.filter((d) => d.status === "history" && d.networkRelevance);
  if (currentPowertrain.length === 0 || historicalNetwork.length < 3) return null;
  return {
    patternType: "current_powertrain_with_historical_secondary",
    severity: "warn",
    name: "Current powertrain fault alongside broad historical network faults",
    evidence: {
      currentPowertrainCodes: currentPowertrain.map((d) => d.normalizedCode),
      historicalNetworkCodeCount: historicalNetwork.length,
    },
    affectedModules: distinctSystems([...currentPowertrain, ...historicalNetwork]),
    ruleVersion: PATTERN_RULES_VERSION,
  };
}

function safetySystemActiveFault(scan: CanonicalVehicleScan): DetectedPattern | null {
  const activeSafety = scan.allDtcs.filter((d) => d.safetyRelevance && d.status === "current");
  if (activeSafety.length === 0) return null;
  return {
    patternType: "safety_system_active_fault",
    severity: "critical",
    name: "Active safety-system fault",
    evidence: { codes: activeSafety.map((d) => d.normalizedCode), systems: distinctSystems(activeSafety) },
    affectedModules: distinctSystems(activeSafety),
    ruleVersion: PATTERN_RULES_VERSION,
  };
}

// A meta-pattern: only fires when a broad electrical/network condition
// (low-voltage or network-wide event) coexists with enough total fault
// volume that one shared power/ground/network cause plausibly explains
// many of the secondary codes — never asserted from a single isolated
// fault, and always phrased as a hypothesis requiring confirmation, never
// a certainty.
function possibleCommonCause(
  lowVoltage: DetectedPattern | null,
  networkEvent: DetectedPattern | null,
  scan: CanonicalVehicleScan,
): DetectedPattern | null {
  if (!lowVoltage && !networkEvent) return null;
  if (scan.allDtcs.length < 10) return null;
  const drivers = [lowVoltage, networkEvent].filter((p): p is DetectedPattern => p !== null);
  return {
    patternType: "possible_common_cause",
    severity: "warn",
    name: "Possible common-cause event explaining multiple secondary faults",
    evidence: {
      basedOn: drivers.map((d) => d.patternType),
      totalDtcCount: scan.allDtcs.length,
      note: "Hypothesis only — requires power/ground/network confirmation before treating any individual module as failed.",
    },
    affectedModules: [...new Set(drivers.flatMap((d) => d.affectedModules))],
    ruleVersion: PATTERN_RULES_VERSION,
  };
}

export function detectPatterns(scan: CanonicalVehicleScan): DetectedPattern[] {
  const lowVoltage = multiModuleLowVoltage(scan);
  const networkEvent = networkCommunicationEvent(scan);

  const patterns = [
    lowVoltage,
    networkEvent,
    singleNodeFailure(scan),
    busOffCondition(scan),
    currentPowertrainWithHistoricalSecondary(scan),
    safetySystemActiveFault(scan),
    possibleCommonCause(lowVoltage, networkEvent, scan),
  ].filter((p): p is DetectedPattern => p !== null);

  return patterns;
}
