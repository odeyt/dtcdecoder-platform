import { describe, expect, it } from "vitest";
import { HV_VALIDATION_FIXTURES } from "@/lib/diagnostic-engine/validation/hv-fixtures";
import { evaluateHvFixture } from "@/lib/diagnostic-engine/validation/evaluate-hv";
import { deriveOperationalGuidance } from "@/lib/diagnostic-engine/safety";

describe("HV validation harness — fixture coverage", () => {
  it("covers all 12 required EV/HV fixture categories", () => {
    expect(HV_VALIDATION_FIXTURES).toHaveLength(12);
    const categories = new Set(HV_VALIDATION_FIXTURES.map((f) => f.category));
    expect(categories.size).toBe(12);
  });

  it("does not make every fixture an immediate_stop — at least 3 fixtures have a lower ceiling", () => {
    const nonHazard = HV_VALIDATION_FIXTURES.filter((f) => f.maximumAcceptableSafety !== "immediate_stop");
    expect(nonHazard.length).toBeGreaterThanOrEqual(3);
  });
});

for (const fixture of HV_VALIDATION_FIXTURES) {
  describe(fixture.category, () => {
    it(`classifies within [${fixture.minimumAcceptableSafety}, ${fixture.maximumAcceptableSafety}]`, () => {
      const result = evaluateHvFixture(fixture);
      expect(result.pass, result.reasons.join("; ")).toBe(true);
    });
  });
}

describe("HV validation harness — genuine hazards never fall below immediate_stop", () => {
  const hazardFixtures = HV_VALIDATION_FIXTURES.filter((f) => f.minimumAcceptableSafety === "immediate_stop");

  it("has exactly 9 genuine active-hazard fixtures", () => {
    expect(hazardFixtures).toHaveLength(9);
  });

  for (const fixture of hazardFixtures) {
    it(`${fixture.category} reaches immediate_stop from evidence alone`, () => {
      const result = evaluateHvFixture(fixture);
      expect(result.actualStatus).toBe("immediate_stop");
    });
  }
});

describe("HV validation harness — non-hazard fixtures never over-trigger", () => {
  const nonHazardFixtures = HV_VALIDATION_FIXTURES.filter((f) => f.maximumAcceptableSafety !== "immediate_stop");

  for (const fixture of nonHazardFixtures) {
    it(`${fixture.category} never reaches tow_recommended or immediate_stop`, () => {
      const result = evaluateHvFixture(fixture);
      expect(["safe_to_drive", "drive_with_caution"]).toContain(result.actualStatus);
    });
  }
});

describe("deriveOperationalGuidance", () => {
  it("immediate_stop prohibits driving and charging, requires towing and HV-qualified service", () => {
    const guidance = deriveOperationalGuidance("immediate_stop");
    expect(guidance).toEqual({
      drivingAllowed: false,
      chargingAllowed: false,
      towingRequired: true,
      hvQualifiedServiceRequired: true,
    });
  });

  it("safe_to_drive permits driving and charging, requires neither towing nor HV-qualified service", () => {
    const guidance = deriveOperationalGuidance("safe_to_drive");
    expect(guidance).toEqual({
      drivingAllowed: true,
      chargingAllowed: true,
      towingRequired: false,
      hvQualifiedServiceRequired: false,
    });
  });
});
