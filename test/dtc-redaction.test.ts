import { describe, expect, it } from "vitest";
import { accessLevelForDtcContent, filterDtcCodeForAccessLevel } from "@/lib/dtc-redaction";
import type { DtcCode } from "@/lib/types";

function baseDtc(overrides: Partial<DtcCode> = {}): DtcCode {
  return {
    id: "dtc-1",
    code: "P0171",
    make: null,
    model: null,
    engine_code: null,
    slug: "p0171",
    title: "System Too Lean (Bank 1)",
    meta_description: null,
    meaning: "The engine control module detected a lean fuel condition.",
    symptoms: ["Rough idle", "Check engine light"],
    causes: ["Vacuum leak", "Failed PCV valve", "Cracked intake boot"],
    diagnostic_steps: ["Smoke test the intake system", "Inspect the PCV valve"],
    common_mistakes: "Don't replace the O2 sensor first.",
    difficulty: "moderate",
    severity: "moderate",
    drive_recommendation: "Safe to drive short distances.",
    related_makes: ["Ford", "Toyota"],
    faq: [],
    pdf_url: "https://example.com/repair.pdf",
    youtube_url: "https://example.com/video",
    search_count: 0,
    is_published: true,
    normalized_code: "P0171",
    family: "P",
    code_type: "generic",
    generic_definition: true,
    manufacturer_specific: false,
    reserved_code: false,
    source_type: "original",
    source_name: null,
    source_url: null,
    source_license: null,
    source_version: null,
    source_hash: null,
    review_status: "approved",
    reviewed_by: null,
    reviewed_at: null,
    active: true,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    ...overrides,
  };
}

describe("accessLevelForDtcContent", () => {
  it("is preview for free, full for pro and workshop", () => {
    expect(accessLevelForDtcContent("free")).toBe("preview");
    expect(accessLevelForDtcContent("pro")).toBe("full");
    expect(accessLevelForDtcContent("workshop")).toBe("full");
  });
});

describe("filterDtcCodeForAccessLevel — full", () => {
  it("passes every field through unchanged", () => {
    const dtc = baseDtc();
    const result = filterDtcCodeForAccessLevel(dtc, "full");

    expect(result.visible).toEqual(dtc);
    expect(result.hiddenCausesCount).toBe(0);
    expect(result.lockedSections).toEqual([]);
  });
});

describe("filterDtcCodeForAccessLevel — preview", () => {
  const dtc = baseDtc();
  const result = filterDtcCodeForAccessLevel(dtc, "preview");

  it("always shows meaning, symptoms, severity, and drive recommendation", () => {
    expect(result.visible.meaning).toBe(dtc.meaning);
    expect(result.visible.symptoms).toEqual(dtc.symptoms);
    expect(result.visible.severity).toBe(dtc.severity);
    expect(result.visible.drive_recommendation).toBe(dtc.drive_recommendation);
  });

  it("names no cause — only reports how many exist, to avoid giving away the answer for free", () => {
    expect(result.visible.causes).toEqual([]);
    expect(result.hiddenCausesCount).toBe(3);
  });

  it("strips diagnostic steps, repair resources, and common mistakes entirely", () => {
    expect(result.visible.diagnostic_steps).toEqual([]);
    expect(result.visible.pdf_url).toBeNull();
    expect(result.visible.youtube_url).toBeNull();
    expect(result.visible.common_mistakes).toBeNull();
  });

  it("never leaks any locked text anywhere in the serialized result", () => {
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("Smoke test the intake system");
    expect(serialized).not.toContain("Inspect the PCV valve");
    expect(serialized).not.toContain("repair.pdf");
    expect(serialized).not.toContain("Vacuum leak");
    expect(serialized).not.toContain("Failed PCV valve");
    expect(serialized).not.toContain("Cracked intake boot");
    expect(serialized).not.toContain("Don't replace the O2 sensor first.");
  });

  it("lists locked sections for diagnostic steps and repair resources", () => {
    expect(result.lockedSections.map((s) => s.key)).toEqual(
      expect.arrayContaining(["dtcDiagnosticSteps", "dtcRepairResources"]),
    );
  });

  it("locks the cause even when there is only one — naming it would fully answer the question for free", () => {
    const single = filterDtcCodeForAccessLevel(baseDtc({ causes: ["Only cause"] }), "preview");
    expect(single.visible.causes).toEqual([]);
    expect(single.hiddenCausesCount).toBe(1);
  });

  it("reports zero hidden causes when the DTC has no documented causes at all", () => {
    const none = filterDtcCodeForAccessLevel(baseDtc({ causes: [] }), "preview");
    expect(none.hiddenCausesCount).toBe(0);
  });

  it("does not list a locked section for resources that never existed", () => {
    const noResources = filterDtcCodeForAccessLevel(
      baseDtc({ pdf_url: null, youtube_url: null, diagnostic_steps: [] }),
      "preview",
    );
    expect(noResources.lockedSections).toEqual([]);
  });
});
