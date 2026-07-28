// Phase 2.2 — high-voltage/EV hazard keyword detection
// (docs/PHASE_2_2_EV_SAFETY_AUDIT.md). Shared by evidence.ts (derives
// hv_safety_hazard evidence from DTC description text) and safety.ts
// (drives the deterministic immediate_stop rule + structured hazard
// category output) so the two never drift into two different keyword
// lists for the same concept.
//
// Every category here maps to the SAME immediate_stop outcome per the
// phase brief's own framing ("must classify immediate_stop when evidence
// indicates a plausible high-voltage hazard... at minimum, cover: [this
// list]") — this module's job is only to detect WHICH category matched,
// for structured output, not to differentiate severity between them.
export type HvHazardCategory =
  | "hv_isolation_fault"
  | "insulation_resistance_fault"
  | "battery_thermal_event"
  | "battery_smoke_odor_venting_swelling"
  | "contactor_fault"
  | "hv_interlock_fault"
  | "orange_cable_damage"
  | "collision_hv_damage"
  | "water_intrusion"
  | "exposed_hv_conductor"
  | "charging_connector_overheat_arc"
  | "repeated_charging_shutdown"
  | "battery_internal_short"
  | "thermal_runaway"
  | "pyro_fuse_or_disconnect_activated"
  | "hv_service_disconnect_improperly_installed"
  | "battery_enclosure_damage";

// Ordered — first match wins. Each pattern is a conservative, literal
// substring/regex match against a DTC's own description text (the same
// "never guess, only match what's actually stated" stance as
// scan-diagnostics/parsers/category-classification.ts's existing
// patterns), not a fuzzy/semantic classifier.
const HV_HAZARD_PATTERNS: Array<{ category: HvHazardCategory; pattern: RegExp }> = [
  { category: "hv_isolation_fault", pattern: /\bisolation\s*(fault|failure|resistance|loss)\b|\bhv\s*isolation\b/i },
  { category: "insulation_resistance_fault", pattern: /\binsulation\s*(resistance|fault|failure|breakdown)\b/i },
  { category: "thermal_runaway", pattern: /\bthermal\s*runaway\b/i },
  { category: "battery_thermal_event", pattern: /\b(battery|pack)\s*(over ?temperature|overheat|thermal event|high temperature)\b|\bhv\s*battery\s*temperature\b/i },
  { category: "battery_smoke_odor_venting_swelling", pattern: /\b(battery|pack)\s*(smoke|odor|vent(ing)?|swell(ing|en)?)\b|\bsmoke from (the )?battery\b/i },
  { category: "contactor_fault", pattern: /\bcontactor\s*(weld(ed|ing)?|stuck|fault|fail(ed|ure)?|abnormal)\b|\bmain relay\s*weld(ed|ing)?\b/i },
  { category: "hv_interlock_fault", pattern: /\b(hv\s*)?interlock\b|\bhvil\b/i },
  { category: "orange_cable_damage", pattern: /\borange\s*cable\b/i },
  { category: "collision_hv_damage", pattern: /\b(collision|crash|impact)\b.*\b(battery|hv|high[\s-]voltage)\b|\b(battery|hv|high[\s-]voltage)\b.*\b(collision|crash|impact)\b/i },
  { category: "water_intrusion", pattern: /\b(water|moisture|coolant)\s*intrusion\b/i },
  { category: "exposed_hv_conductor", pattern: /\bexposed\s*(high[\s-]voltage|hv)\s*conductor\b/i },
  { category: "charging_connector_overheat_arc", pattern: /\b(charg(e|ing)\s*(port|connector|inlet))\s*(overheat|arc(ing)?)\b|\barcing\b/i },
  { category: "repeated_charging_shutdown", pattern: /\brepeated\s*charg(e|ing)\s*(shutdown|interrupt|fault)\b/i },
  { category: "battery_internal_short", pattern: /\b(internal|cell)\s*short\b/i },
  { category: "pyro_fuse_or_disconnect_activated", pattern: /\bpyro[\s-]?(fuse|technic)\b|\bbattery\s*disconnect\s*(activated|open(ed)?)\b/i },
  { category: "hv_service_disconnect_improperly_installed", pattern: /\bservice\s*(plug|disconnect)\s*(not installed|missing|improperly|open)\b/i },
  { category: "battery_enclosure_damage", pattern: /\b(battery|pack)\s*enclosure\s*(damage|breach|compromised)\b/i },
  // Broad fallback — real SAE/manufacturer DTC descriptions frequently say
  // exactly this (e.g. P0AA6 "Hybrid/EV Battery Isolation Fault") without
  // matching any of the more specific patterns above verbatim.
  { category: "hv_isolation_fault", pattern: /\bhigh[\s-]voltage\b|\bhybrid\/ev battery\b|\bhv battery\b/i },
];

export function detectHvHazardCategory(descriptionText: string | null | undefined): HvHazardCategory | null {
  if (!descriptionText) return null;
  for (const { category, pattern } of HV_HAZARD_PATTERNS) {
    if (pattern.test(descriptionText)) return category;
  }
  return null;
}

// Human-readable label per category, used for the structured "Hazard"
// field (Step 4) and for the evidence item's own summarized value.
export const HV_HAZARD_LABELS: Record<HvHazardCategory, string> = {
  hv_isolation_fault: "Possible high-voltage isolation fault",
  insulation_resistance_fault: "Insulation resistance fault",
  battery_thermal_event: "High-voltage battery thermal event",
  battery_smoke_odor_venting_swelling: "Battery smoke, odor, venting, or swelling",
  contactor_fault: "High-voltage contactor fault",
  hv_interlock_fault: "High-voltage interlock loop fault",
  orange_cable_damage: "Damaged high-voltage (orange) cable",
  collision_hv_damage: "Collision damage affecting the high-voltage system",
  water_intrusion: "Water or moisture intrusion into a high-voltage component",
  exposed_hv_conductor: "Exposed high-voltage conductor",
  charging_connector_overheat_arc: "Charging connector overheating or arcing",
  repeated_charging_shutdown: "Repeated charging shutdown with a high-voltage fault",
  battery_internal_short: "Possible high-voltage battery internal short",
  thermal_runaway: "Thermal runaway warning",
  pyro_fuse_or_disconnect_activated: "Pyrotechnic fuse or battery disconnect activated",
  hv_service_disconnect_improperly_installed: "High-voltage service disconnect improperly installed",
  battery_enclosure_damage: "High-voltage battery enclosure damage",
};
