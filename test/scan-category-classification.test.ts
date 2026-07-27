import { describe, expect, it } from "vitest";
import { classifyDtcCategories } from "@/lib/scan-diagnostics/parsers/category-classification";
import type { ScanDtcRecord } from "@/lib/types";

function dtc(overrides: Partial<ScanDtcRecord>): ScanDtcRecord {
  return {
    id: "dtc-1",
    case_id: "case-1",
    module: null,
    code: "P0300",
    status: null,
    description_raw: null,
    source: "extracted",
    created_at: new Date(0).toISOString(),
    system_name: null,
    source_page: null,
    source_text: null,
    safety_relevance: false,
    network_relevance: false,
    battery_relevance: false,
    bus_off_relevance: false,
    ...overrides,
  };
}

describe("classifyDtcCategories", () => {
  it("returns not_stated for every category when there are no DTC records at all", () => {
    const result = classifyDtcCategories([], []);
    expect(result.pendingCodes.status).toBe("not_stated");
    expect(result.permanentCodes.status).toBe("not_stated");
    expect(result.networkFaults.status).toBe("not_stated");
    expect(result.lostCommunicationFaults.status).toBe("not_stated");
    expect(result.batteryRelatedFaults.status).toBe("not_stated");
  });

  it("never returns none_reported — this parser layer cannot detect an explicit textual 'none' claim", () => {
    const result = classifyDtcCategories([dtc({ code: "P0171", status: "current" })], []);
    for (const category of Object.values(result)) {
      expect(category.status).not.toBe("none_reported");
    }
  });

  // Fixture 1: Ford Ranger scan report — VIN present, model/engine/
  // transmission absent, continuous DTCs, ABS reported OK, no explicit
  // pending/permanent classification anywhere in the report.
  describe("Ford Ranger fixture — continuous DTCs, no explicit pending/permanent classification", () => {
    const records = [dtc({ code: "P0171", status: "current", module: "PCM" })];
    const modules = [{ name: "ABS", status: "reported_ok" }];

    it("classifies pendingCodes and permanentCodes as not_stated (never fabricated as none/zero)", () => {
      const result = classifyDtcCategories(records, modules);
      expect(result.pendingCodes.status).toBe("not_stated");
      expect(result.permanentCodes.status).toBe("not_stated");
    });

    it("does not classify ABS as having a network/lost-communication fault when it was only reported OK", () => {
      const result = classifyDtcCategories(records, modules);
      expect(result.networkFaults.status).toBe("not_stated");
      expect(result.lostCommunicationFaults.status).toBe("not_stated");
    });
  });

  // Fixture 2: a report containing a U-code.
  describe("U-code (network) fixture", () => {
    it("classifies a U-code as a found network fault", () => {
      const result = classifyDtcCategories([dtc({ code: "U0100", module: "ECM" })], []);
      expect(result.networkFaults.status).toBe("found");
      expect(result.networkFaults.codes).toContain("U0100");
    });

    it("classifies lost-communication as found only when the description or a module explicitly says so", () => {
      const withGenericText = classifyDtcCategories(
        [dtc({ code: "U0100", description_raw: "Control Module Signal Message Frequency Fault" })],
        [],
      );
      expect(withGenericText.lostCommunicationFaults.status).toBe("not_stated");

      const withExplicitLostComm = classifyDtcCategories(
        [dtc({ code: "U0100", description_raw: "Lost communication with ECM" })],
        [],
      );
      expect(withExplicitLostComm.lostCommunicationFaults.status).toBe("found");
    });

    it("also detects lost-communication from a module explicitly reported as not communicating", () => {
      const result = classifyDtcCategories(
        [dtc({ code: "U0155", module: "IPC" })],
        [{ name: "IPC", status: "not communicating" }],
      );
      expect(result.lostCommunicationFaults.status).toBe("found");
    });
  });

  // Fixture 3: a report containing low-voltage/battery-related codes.
  describe("low-voltage / battery-related fixture", () => {
    it("classifies a code with a battery/voltage-related description as a found battery-related fault", () => {
      const result = classifyDtcCategories(
        [dtc({ code: "P0562", description_raw: "System Voltage Low" })],
        [],
      );
      expect(result.batteryRelatedFaults.status).toBe("found");
      expect(result.batteryRelatedFaults.codes).toContain("P0562");
    });

    it("does not classify an unrelated code as battery-related just because it exists", () => {
      const result = classifyDtcCategories([dtc({ code: "P0300", description_raw: "Random Misfire Detected" })], []);
      expect(result.batteryRelatedFaults.status).toBe("not_stated");
    });
  });

  it("classifies pending/permanent codes as found when a matching status exists on a record", () => {
    const result = classifyDtcCategories(
      [dtc({ code: "P0171", status: "pending" }), dtc({ code: "P0420", status: "permanent" })],
      [],
    );
    expect(result.pendingCodes).toEqual({ status: "found", codes: ["P0171"] });
    expect(result.permanentCodes).toEqual({ status: "found", codes: ["P0420"] });
  });
});
