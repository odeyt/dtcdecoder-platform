import { describe, expect, it } from "vitest";
import { detectHvHazardCategory, HV_HAZARD_LABELS } from "@/lib/diagnostic-engine/hv-hazard-keywords";

describe("detectHvHazardCategory", () => {
  it("returns null for null/undefined/empty text", () => {
    expect(detectHvHazardCategory(null)).toBeNull();
    expect(detectHvHazardCategory(undefined)).toBeNull();
    expect(detectHvHazardCategory("")).toBeNull();
  });

  it("returns null for ordinary non-HV DTC descriptions", () => {
    expect(detectHvHazardCategory("System Voltage Low")).toBeNull();
    expect(detectHvHazardCategory("Cylinder 1 Misfire Detected")).toBeNull();
    expect(detectHvHazardCategory("Lost Communication With ECM/PCM")).toBeNull();
  });

  it("detects a real SAE/manufacturer HV isolation fault description", () => {
    expect(detectHvHazardCategory("Hybrid/EV Battery Isolation Fault")).toBe("hv_isolation_fault");
  });

  it("detects battery thermal event language", () => {
    expect(detectHvHazardCategory("HV Battery Overtemperature Detected")).toBe("battery_thermal_event");
  });

  it("detects thermal runaway explicitly, distinct from a generic thermal event", () => {
    expect(detectHvHazardCategory("Battery Thermal Runaway Warning")).toBe("thermal_runaway");
  });

  it("detects contactor fault language", () => {
    expect(detectHvHazardCategory("Main Contactor Welded Fault")).toBe("contactor_fault");
  });

  it("detects HV interlock loop fault language", () => {
    expect(detectHvHazardCategory("HVIL Circuit Open")).toBe("hv_interlock_fault");
  });

  it("detects orange cable damage", () => {
    expect(detectHvHazardCategory("Orange Cable Damage Detected")).toBe("orange_cable_damage");
  });

  it("detects water intrusion into HV components", () => {
    expect(detectHvHazardCategory("Water Intrusion Detected in Battery Pack")).toBe("water_intrusion");
  });

  it("detects charging connector overheating/arcing", () => {
    expect(detectHvHazardCategory("Charging Port Overheat Detected")).toBe("charging_connector_overheat_arc");
  });

  it("detects pyro-fuse/disconnect activation", () => {
    expect(detectHvHazardCategory("Pyro Fuse Activated")).toBe("pyro_fuse_or_disconnect_activated");
  });

  it("every declared category has a non-empty human-readable label", () => {
    for (const category of Object.keys(HV_HAZARD_LABELS)) {
      expect(HV_HAZARD_LABELS[category as keyof typeof HV_HAZARD_LABELS].length).toBeGreaterThan(0);
    }
  });
});
