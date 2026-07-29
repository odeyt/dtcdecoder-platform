import { describe, expect, it } from "vitest";
import { normalizeDtcInput } from "@/lib/dtc-normalization";

describe("normalizeDtcInput — valid generic codes", () => {
  it("accepts a clean uppercase generic P-code", () => {
    const r = normalizeDtcInput("P0300");
    expect(r).toMatchObject({
      normalizedCode: "P0300",
      family: "P",
      isValid: true,
      isGeneric: true,
      isManufacturerSpecific: false,
      isReserved: false,
      category: "Powertrain",
      validationError: null,
    });
  });

  it("uppercases a lowercase code", () => {
    expect(normalizeDtcInput("p0171").normalizedCode).toBe("P0171");
  });

  it("strips whitespace, hyphens, and periods before validating", () => {
    expect(normalizeDtcInput("  p-0420  ").normalizedCode).toBe("P0420");
    expect(normalizeDtcInput("p.0420").normalizedCode).toBe("P0420");
    expect(normalizeDtcInput("p_0420").normalizedCode).toBe("P0420");
  });

  it("classifies each family letter correctly", () => {
    expect(normalizeDtcInput("P0300").category).toBe("Powertrain");
    expect(normalizeDtcInput("B0001").category).toBe("Body");
    expect(normalizeDtcInput("C0035").category).toBe("Chassis");
    expect(normalizeDtcInput("U0100").category).toBe("Network/Communication");
  });
});

describe("normalizeDtcInput — manufacturer-specific codes", () => {
  it("classifies U1003 as manufacturer-specific, not generic and not invalid", () => {
    const r = normalizeDtcInput("U1003");
    expect(r.isValid).toBe(true);
    expect(r.isGeneric).toBe(false);
    expect(r.isManufacturerSpecific).toBe(true);
    expect(r.isReserved).toBe(false);
  });

  it("classifies second-digit 1 or 3 as manufacturer-specific across every family", () => {
    expect(normalizeDtcInput("P1234").isManufacturerSpecific).toBe(true);
    expect(normalizeDtcInput("B1000").isManufacturerSpecific).toBe(true);
    expect(normalizeDtcInput("C1200").isManufacturerSpecific).toBe(true);
    expect(normalizeDtcInput("U3001").isManufacturerSpecific).toBe(true);
  });
});

describe("normalizeDtcInput — reserved codes", () => {
  it("never claims a code is reserved purely from its shape", () => {
    // Reserved-ness is DB-only knowledge (see the module's header comment) —
    // the structural classifier must never guess this.
    expect(normalizeDtcInput("C0300").isReserved).toBe(false);
    expect(normalizeDtcInput("P0999").isReserved).toBe(false);
  });
});

describe("normalizeDtcInput — invalid/malformed input", () => {
  it("rejects an empty string", () => {
    const r = normalizeDtcInput("");
    expect(r.isValid).toBe(false);
    expect(r.validationError).toBeTruthy();
  });

  it("rejects a string that is only whitespace", () => {
    expect(normalizeDtcInput("   ").isValid).toBe(false);
  });

  it("rejects an unrecognized leading letter", () => {
    expect(normalizeDtcInput("X0300").isValid).toBe(false);
  });

  it("rejects too few digits", () => {
    expect(normalizeDtcInput("P03").isValid).toBe(false);
  });

  it("rejects too many digits", () => {
    expect(normalizeDtcInput("P030000").isValid).toBe(false);
  });

  it("rejects unsafe/malformed input without throwing", () => {
    expect(() => normalizeDtcInput("<script>alert(1)</script>")).not.toThrow();
    expect(normalizeDtcInput("<script>alert(1)</script>").isValid).toBe(false);
    expect(normalizeDtcInput("'; DROP TABLE dtc_codes; --").isValid).toBe(false);
  });

  it("does not classify an invalid code as generic, manufacturer-specific, or reserved", () => {
    const r = normalizeDtcInput("not-a-code");
    expect(r.isValid).toBe(false);
    expect(r.isGeneric).toBe(false);
    expect(r.isManufacturerSpecific).toBe(false);
    expect(r.isReserved).toBe(false);
  });
});

describe("normalizeDtcInput — subsystem inference", () => {
  it("infers a powertrain subsystem for generic P-codes", () => {
    expect(normalizeDtcInput("P0300").system).toBe("Ignition system or misfire");
    expect(normalizeDtcInput("P0420").system).toBe("Auxiliary emissions controls");
  });

  it("does not infer a subsystem for manufacturer-specific codes", () => {
    expect(normalizeDtcInput("P1234").system).toBeNull();
  });

  it("does not infer a powertrain subsystem for non-P families", () => {
    expect(normalizeDtcInput("U0100").system).toBeNull();
  });
});
