import { describe, expect, it } from "vitest";
import { buildCanonicalDiagnosticInput } from "@/lib/scan-diagnostics/canonical-input";
import type { ScanCase, ScanDtcRecord, ScanExtraction } from "@/lib/types";

function baseCase(overrides: Partial<ScanCase> = {}): ScanCase {
  return {
    id: "case-1",
    user_id: "user-1",
    status: "ready_for_analysis",
    status_updated_at: new Date(0).toISOString(),
    error_message: null,
    complaint: null,
    symptoms: [],
    mileage: null,
    recent_repairs: null,
    battery_condition: null,
    technician_notes: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    ...overrides,
  };
}

describe("buildCanonicalDiagnosticInput — missing DTC description (fixture 8)", () => {
  it("keeps the raw code and leaves description null rather than inventing a definition", () => {
    const dtcRecords: ScanDtcRecord[] = [
      {
        id: "dtc-1",
        case_id: "case-1",
        module: null,
        code: "P1ABC",
        status: null,
        description_raw: null,
        source: "extracted",
        created_at: new Date(0).toISOString(),
      },
    ];

    const input = buildCanonicalDiagnosticInput(baseCase(), null, dtcRecords);

    expect(input.dtcs).toHaveLength(1);
    expect(input.dtcs[0].code).toBe("P1ABC");
    expect(input.dtcs[0].descriptionRaw).toBeNull();
  });

  it("attaches vehicle fields as null (not fabricated) when extraction is absent entirely", () => {
    const input = buildCanonicalDiagnosticInput(baseCase(), null, []);
    expect(input.vehicle.vin).toBeNull();
    expect(input.vehicle.make).toBeNull();
    expect(input.vehicle.model).toBeNull();
    expect(input.vehicle.engine).toBeNull();
  });

  it("computes a dtcCategoryClassification consistent with the passed DTC records", () => {
    const dtcRecords: ScanDtcRecord[] = [
      {
        id: "dtc-1",
        case_id: "case-1",
        module: "ECM",
        code: "U0100",
        status: null,
        description_raw: null,
        source: "extracted",
        created_at: new Date(0).toISOString(),
      },
    ];
    const input = buildCanonicalDiagnosticInput(baseCase(), null, dtcRecords);
    expect(input.dtcCategoryClassification.networkFaults.status).toBe("found");
    expect(input.dtcCategoryClassification.pendingCodes.status).toBe("not_stated");
  });

  it("layers a user review correction (reviewed_fields) on top of extracted vehicle data without losing the original", () => {
    const extraction: ScanExtraction = {
      id: "ext-1",
      case_id: "case-1",
      file_id: "file-1",
      parser_id: "generic-txt",
      parser_version: "1.0.0",
      vin: "1FTFW1ET1EFA00001",
      make: "Ford",
      model: null,
      model_year: null,
      engine: null,
      odometer_miles: null,
      modules: [],
      freeze_frame: [],
      live_data: [],
      image_only_pdf: false,
      warnings: [],
      reviewed_fields: { model: "F-150" },
      extracted_at: new Date(0).toISOString(),
      reviewed_at: new Date(0).toISOString(),
    };
    const input = buildCanonicalDiagnosticInput(baseCase(), extraction, []);
    expect(input.vehicle.make).toBe("Ford");
    expect(input.vehicle.model).toBe("F-150");
  });
});
