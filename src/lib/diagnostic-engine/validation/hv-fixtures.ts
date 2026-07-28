// Phase 2.2 Step 5 — EV/high-voltage validation fixtures
// (docs/PHASE_2_2_EV_SAFETY_AUDIT.md). No customer-identifying information
// — every fixture is a synthetic, generic scenario. Deliberately does NOT
// make every EV/HV code an immediate_stop: fixtures 10-12 specifically
// prove the rules distinguish a current active hazard from a
// non-hazardous communication fault or a historical/inactive code.
import type { EvidenceItem, DriveSafetyStatus } from "@/lib/diagnostic-engine/types";
import type { HvHazardCategory } from "@/lib/diagnostic-engine/hv-hazard-keywords";

export interface HvValidationFixture {
  id: string;
  category: string;
  vehicle: { year: number; make: string; model: string; engine: string };
  complaint: string;
  dtc: { code: string; description: string; status: "current" | "history" | "pending" };
  evidenceSequence: Array<{ type: EvidenceItem["type"]; value: unknown; confidence: EvidenceItem["confidence"] }>;
  // The actual classification must be >= minimumAcceptableSafety and
  // <= maximumAcceptableSafety (same severity ordering safety.ts uses).
  // For the 9 genuine hazard fixtures these are equal (immediate_stop
  // only, nothing lower is acceptable). For the 3 non-hazard fixtures
  // minimum is safe_to_drive and maximum caps it below tow/immediate_stop
  // — proving the engine doesn't over-trigger on every EV-adjacent code.
  minimumAcceptableSafety: DriveSafetyStatus;
  maximumAcceptableSafety: DriveSafetyStatus;
  // Substring expected somewhere in the classification's reasoning or
  // hvHazard detail when a hazard is expected; null when this fixture
  // should produce no hazard-specific warning at all.
  requiredWarningSubstring: string | null;
}

function hvHazardEvidenceItem(code: string, hazardCategory: HvHazardCategory, description: string): { type: EvidenceItem["type"]; value: unknown; confidence: EvidenceItem["confidence"] } {
  return { type: "hv_safety_hazard", value: { code, hazardCategory, description }, confidence: "high" };
}

const EV_VEHICLE = { year: 2022, make: "Generic", model: "EV Sedan", engine: "Electric" };

export const HV_VALIDATION_FIXTURES: HvValidationFixture[] = [
  {
    id: "hv-isolation-fault",
    category: "Isolation fault",
    vehicle: EV_VEHICLE,
    complaint: "High-voltage warning light, vehicle will not enter Ready mode.",
    dtc: { code: "P0AA6", description: "Hybrid/EV Battery Isolation Fault", status: "current" },
    evidenceSequence: [hvHazardEvidenceItem("P0AA6", "hv_isolation_fault", "Hybrid/EV Battery Isolation Fault")],
    minimumAcceptableSafety: "immediate_stop",
    maximumAcceptableSafety: "immediate_stop",
    requiredWarningSubstring: "isolation",
  },
  {
    id: "hv-battery-overtemperature",
    category: "Battery overtemperature",
    vehicle: EV_VEHICLE,
    complaint: "Battery temperature warning displayed during fast charging.",
    dtc: { code: "P0AA0", description: "HV Battery Overtemperature Detected", status: "current" },
    evidenceSequence: [hvHazardEvidenceItem("P0AA0", "battery_thermal_event", "HV Battery Overtemperature Detected")],
    minimumAcceptableSafety: "immediate_stop",
    maximumAcceptableSafety: "immediate_stop",
    requiredWarningSubstring: "thermal",
  },
  {
    id: "hv-orange-cable-damage",
    category: "Damaged orange cable",
    vehicle: EV_VEHICLE,
    complaint: "Visible damage to the orange high-voltage cable near the underbody.",
    dtc: { code: "P0AA3", description: "Orange Cable Damage Detected", status: "current" },
    evidenceSequence: [hvHazardEvidenceItem("P0AA3", "orange_cable_damage", "Orange Cable Damage Detected")],
    minimumAcceptableSafety: "immediate_stop",
    maximumAcceptableSafety: "immediate_stop",
    requiredWarningSubstring: "cable",
  },
  {
    id: "hv-charging-port-overheat",
    category: "Charging-port overheating",
    vehicle: EV_VEHICLE,
    complaint: "Charging port felt hot and charging stopped unexpectedly.",
    dtc: { code: "P0AA4", description: "Charging Port Overheat Detected", status: "current" },
    evidenceSequence: [hvHazardEvidenceItem("P0AA4", "charging_connector_overheat_arc", "Charging Port Overheat Detected")],
    minimumAcceptableSafety: "immediate_stop",
    maximumAcceptableSafety: "immediate_stop",
    requiredWarningSubstring: "overheat",
  },
  {
    id: "hv-contactor-fault",
    category: "Contactor fault",
    vehicle: EV_VEHICLE,
    complaint: "Vehicle failed to power up, audible click heard from the battery pack.",
    dtc: { code: "P0AA5", description: "Main Contactor Welded Fault", status: "current" },
    evidenceSequence: [hvHazardEvidenceItem("P0AA5", "contactor_fault", "Main Contactor Welded Fault")],
    minimumAcceptableSafety: "immediate_stop",
    maximumAcceptableSafety: "immediate_stop",
    requiredWarningSubstring: "contactor",
  },
  {
    id: "hv-interlock-fault",
    category: "HV interlock fault",
    vehicle: EV_VEHICLE,
    complaint: "High-voltage system fault after recent service work.",
    dtc: { code: "P0AA8", description: "HVIL Circuit Open", status: "current" },
    evidenceSequence: [hvHazardEvidenceItem("P0AA8", "hv_interlock_fault", "HVIL Circuit Open")],
    minimumAcceptableSafety: "immediate_stop",
    maximumAcceptableSafety: "immediate_stop",
    requiredWarningSubstring: "interlock",
  },
  {
    id: "hv-collision-damage",
    category: "Collision-damaged battery",
    vehicle: EV_VEHICLE,
    complaint: "Vehicle involved in a collision; high-voltage warning light is on.",
    dtc: { code: "P0AA9", description: "Collision Detected — Possible HV Battery Damage", status: "current" },
    evidenceSequence: [hvHazardEvidenceItem("P0AA9", "collision_hv_damage", "Collision Detected — Possible HV Battery Damage")],
    minimumAcceptableSafety: "immediate_stop",
    maximumAcceptableSafety: "immediate_stop",
    requiredWarningSubstring: "collision",
  },
  {
    id: "hv-water-intrusion",
    category: "Water intrusion",
    vehicle: EV_VEHICLE,
    complaint: "Vehicle was driven through deep water; high-voltage warning light is on.",
    dtc: { code: "P0AB0", description: "Water Intrusion Detected in Battery Pack", status: "current" },
    evidenceSequence: [hvHazardEvidenceItem("P0AB0", "water_intrusion", "Water Intrusion Detected in Battery Pack")],
    minimumAcceptableSafety: "immediate_stop",
    maximumAcceptableSafety: "immediate_stop",
    requiredWarningSubstring: "water",
  },
  {
    id: "hv-battery-smoke-odor",
    category: "Battery smoke or odor",
    vehicle: EV_VEHICLE,
    complaint: "Smoke and an unusual odor coming from the battery compartment.",
    dtc: { code: "P0AB1", description: "Battery Smoke Detected", status: "current" },
    evidenceSequence: [hvHazardEvidenceItem("P0AB1", "battery_smoke_odor_venting_swelling", "Battery Smoke Detected")],
    minimumAcceptableSafety: "immediate_stop",
    maximumAcceptableSafety: "immediate_stop",
    requiredWarningSubstring: "smoke",
  },
  {
    id: "hv-low-voltage-no-hazard",
    category: "Low-voltage fault with no HV hazard",
    vehicle: { year: 2018, make: "Toyota", model: "Camry", engine: "2.5L I4" },
    complaint: "Battery warning light on a conventional (non-EV) vehicle.",
    dtc: { code: "P0562", description: "System Voltage Low", status: "current" },
    // A conventional 12V system-voltage code — no HV hazard evidence at
    // all, since the description matches neither the HV keyword list nor
    // the generic safety-relevance pattern.
    evidenceSequence: [{ type: "dtc_stored", value: { code: "P0562", description: "System Voltage Low" }, confidence: "high" }],
    minimumAcceptableSafety: "safe_to_drive",
    maximumAcceptableSafety: "drive_with_caution",
    requiredWarningSubstring: null,
  },
  {
    id: "hv-comm-fault-not-auto-immediate-stop",
    category: "Communication fault that should not automatically trigger immediate stop",
    vehicle: EV_VEHICLE,
    complaint: "Intermittent warning light, gauge cluster occasionally blanks out.",
    dtc: { code: "U0100", description: "Lost Communication With ECM/PCM", status: "current" },
    // A generic communication fault — no HV hazard keyword match. Must
    // never automatically escalate to tow_recommended/immediate_stop on
    // its own.
    evidenceSequence: [{ type: "dtc_stored", value: { code: "U0100", description: "Lost Communication With ECM/PCM" }, confidence: "high" }],
    minimumAcceptableSafety: "safe_to_drive",
    maximumAcceptableSafety: "drive_with_caution",
    requiredWarningSubstring: null,
  },
  {
    id: "hv-historical-inactive-code",
    category: "Historical or inactive HV code with no current hazard evidence",
    vehicle: EV_VEHICLE,
    complaint: "No current warning lights; a historical HV code was found during a routine scan.",
    dtc: { code: "P0AA6", description: "Hybrid/EV Battery Isolation Fault", status: "history" },
    // Same hazard-matching description as fixture #1, but status "history"
    // — buildEvidenceFromCase never derives hv_safety_hazard for a
    // non-current DTC, so this evidence set intentionally contains only
    // the plain dtc_stored fact, proving the harness (and the real
    // pipeline) don't manufacture a hazard from an inactive code.
    evidenceSequence: [{ type: "dtc_stored", value: { code: "P0AA6", description: "Hybrid/EV Battery Isolation Fault", status: "history" }, confidence: "medium" }],
    minimumAcceptableSafety: "safe_to_drive",
    maximumAcceptableSafety: "drive_with_caution",
    requiredWarningSubstring: null,
  },
];
