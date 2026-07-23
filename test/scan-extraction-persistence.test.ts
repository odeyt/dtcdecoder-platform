import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

// vi.mock factories are hoisted above imports, so the fake is created
// inside the (async) factory itself via a dynamic import and stashed on
// globalThis for the test body to reach — see test/mocks/fake-supabase.ts.
vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

const { persistExtraction, applyExtractionReview } = await import("@/lib/scan-diagnostics/extraction");
const { emptyParsedScanReport } = await import("@/lib/scan-diagnostics/parsers/types");

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

beforeEach(() => {
  fake().reset();
});

describe("persistExtraction", () => {
  it("inserts DTC records and upserts a single extraction row", async () => {
    const report = emptyParsedScanReport();
    report.vin = "1FTFW1ET1EFA00001";
    report.dtcCodes = [{ module: "ECM", code: "P0300", status: "current", descriptionRaw: "Misfire" }];

    await persistExtraction("case-1", "file-1", "generic-txt", "1.0.0", report);

    expect(fake().dump("scan_extractions")).toHaveLength(1);
    expect(fake().dump("scan_dtc_records")).toHaveLength(1);
    expect(fake().dump("scan_dtc_records")[0]).toMatchObject({ code: "P0300", module: "ECM" });
  });

  it("re-running extraction for the same case does not duplicate DTC rows or extraction rows", async () => {
    const report = emptyParsedScanReport();
    report.dtcCodes = [{ module: "ECM", code: "P0300", status: "current" }];

    await persistExtraction("case-1", "file-1", "generic-txt", "1.0.0", report);
    await persistExtraction("case-1", "file-1", "generic-txt", "1.0.0", report);

    expect(fake().dump("scan_extractions")).toHaveLength(1);
    expect(fake().dump("scan_dtc_records")).toHaveLength(1);
  });

  it("treats different modules for the same code as distinct rows", async () => {
    const report = emptyParsedScanReport();
    report.dtcCodes = [
      { module: "ECM", code: "U0100" },
      { module: "TCM", code: "U0100" },
    ];

    await persistExtraction("case-1", "file-1", "generic-txt", "1.0.0", report);

    expect(fake().dump("scan_dtc_records")).toHaveLength(2);
  });
});

describe("applyExtractionReview", () => {
  it("layers field overrides into reviewed_fields without touching the original extracted values", async () => {
    fake().seed("scan_extractions", [
      { id: "ext-1", case_id: "case-1", vin: "1FTFW1ET1EFA00001", reviewed_fields: {} },
    ]);

    await applyExtractionReview("case-1", { vin: "CORRECTEDVIN000001" });

    const extraction = fake().dump("scan_extractions")[0];
    expect(extraction.vin).toBe("1FTFW1ET1EFA00001"); // original untouched
    expect(extraction.reviewed_fields).toEqual({ vin: "CORRECTEDVIN000001" }); // correction layered on top
  });

  it("adds user-added DTCs tagged with source user_added", async () => {
    fake().seed("scan_extractions", [{ id: "ext-1", case_id: "case-1", reviewed_fields: {} }]);

    await applyExtractionReview("case-1", { addDtcs: [{ code: "P0171" }] });

    const dtcs = fake().dump("scan_dtc_records");
    expect(dtcs).toHaveLength(1);
    expect(dtcs[0]).toMatchObject({ code: "P0171", source: "user_added" });
  });

  it("editing an extracted DTC preserves its extracted lineage as user_edited, not user_added", async () => {
    fake().seed("scan_extractions", [{ id: "ext-1", case_id: "case-1", reviewed_fields: {} }]);
    fake().seed("scan_dtc_records", [
      { id: "dtc-1", case_id: "case-1", module: "ECM", code: "P0300", source: "extracted" },
    ]);

    await applyExtractionReview("case-1", { editDtcs: [{ id: "dtc-1", status: "confirmed" }] });

    const dtc = fake().dump("scan_dtc_records")[0];
    expect(dtc.source).toBe("user_edited");
    expect(dtc.status).toBe("stored"); // normalized from "confirmed"
  });

  it("removes DTC records by id, scoped to the case", async () => {
    fake().seed("scan_extractions", [{ id: "ext-1", case_id: "case-1", reviewed_fields: {} }]);
    fake().seed("scan_dtc_records", [
      { id: "dtc-1", case_id: "case-1", code: "P0300", source: "extracted" },
      { id: "dtc-2", case_id: "case-1", code: "P0420", source: "extracted" },
    ]);

    await applyExtractionReview("case-1", { removeDtcIds: ["dtc-1"] });

    const remaining = fake().dump("scan_dtc_records");
    expect(remaining).toHaveLength(1);
    expect(remaining[0].code).toBe("P0420");
  });
});
