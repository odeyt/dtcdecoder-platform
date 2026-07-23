import { describe, expect, it } from "vitest";
import {
  dedupeDtcCodes,
  extractDtcCodesFromText,
  extractVinFromText,
  normalizeDtcCode,
} from "@/lib/scan-diagnostics/parsers/dtc-extraction";

describe("normalizeDtcCode", () => {
  it("uppercases and trims", () => {
    expect(normalizeDtcCode(" p0300 ")).toBe("P0300");
  });

  it("preserves a manufacturer-specific subcode suffix", () => {
    expect(normalizeDtcCode("p1234-16")).toBe("P1234-16");
  });

  it("removes internal whitespace", () => {
    expect(normalizeDtcCode("P 0300")).toBe("P0300");
  });
});

describe("extractDtcCodesFromText", () => {
  it("finds standard OBD-II codes with descriptions", () => {
    const text = "DTC P0300 - Random/Multiple Cylinder Misfire Detected\nDTC U0100 - Lost Comm with ECM";
    const codes = extractDtcCodesFromText(text);
    expect(codes.map((c) => c.code)).toEqual(["P0300", "U0100"]);
    expect(codes[0].descriptionRaw).toMatch(/Misfire/);
  });

  it("finds manufacturer-specific codes with subcodes", () => {
    const codes = extractDtcCodesFromText("Fault: B1234-56 Seat Belt Circuit");
    expect(codes[0].code).toBe("B1234-56");
  });

  it("returns no codes for text with none", () => {
    expect(extractDtcCodesFromText("No faults detected, all systems normal.")).toEqual([]);
  });
});

describe("extractVinFromText", () => {
  it("finds a 17-character VIN near the VIN keyword", () => {
    const text = "Vehicle Info\nVIN: 1FTFW1ET1EFA00001\nMileage: 45000";
    expect(extractVinFromText(text)).toBe("1FTFW1ET1EFA00001");
  });

  it("returns undefined when no VIN-shaped string exists", () => {
    expect(extractVinFromText("no vehicle identifiers here")).toBeUndefined();
  });
});

describe("dedupeDtcCodes", () => {
  it("dedupes on module+code+status and keeps the first entry", () => {
    const codes = dedupeDtcCodes([
      { module: "ECM", code: "P0300", status: "current", descriptionRaw: "Misfire" },
      { module: "ECM", code: "P0300", status: "current", descriptionRaw: "Duplicate" },
    ]);
    expect(codes).toHaveLength(1);
    expect(codes[0].descriptionRaw).toBe("Misfire");
  });

  it("treats different modules for the same code as distinct records", () => {
    const codes = dedupeDtcCodes([
      { module: "ECM", code: "U0100" },
      { module: "TCM", code: "U0100" },
    ]);
    expect(codes).toHaveLength(2);
  });

  it("backfills a missing description from a later duplicate", () => {
    const codes = dedupeDtcCodes([
      { code: "P0420" },
      { code: "P0420", descriptionRaw: "Catalyst Efficiency Below Threshold" },
    ]);
    expect(codes).toHaveLength(1);
    expect(codes[0].descriptionRaw).toBe("Catalyst Efficiency Below Threshold");
  });
});
