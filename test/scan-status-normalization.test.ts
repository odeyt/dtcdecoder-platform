import { describe, expect, it } from "vitest";
import { normalizeStoredDtcStatus } from "@/lib/scan-diagnostics/extraction";
import { dedupeDtcCodes } from "@/lib/scan-diagnostics/parsers/dtc-extraction";

describe("normalizeStoredDtcStatus", () => {
  it("returns null when no status text was present at all", () => {
    expect(normalizeStoredDtcStatus(undefined)).toBeNull();
  });

  it("recognizes current/history/pending/permanent/intermittent/stored", () => {
    expect(normalizeStoredDtcStatus("Current")).toBe("current");
    expect(normalizeStoredDtcStatus("History")).toBe("history");
    expect(normalizeStoredDtcStatus("Pending")).toBe("pending");
    expect(normalizeStoredDtcStatus("Permanent")).toBe("permanent");
    expect(normalizeStoredDtcStatus("Intermittent")).toBe("intermittent");
    expect(normalizeStoredDtcStatus("Confirmed")).toBe("stored");
  });

  it("recognizes 'Generic Type DTC, reference Only' as its own reference_only value, not silently discarded", () => {
    expect(normalizeStoredDtcStatus("Generic Type DTC,reference Only")).toBe("reference_only");
    expect(normalizeStoredDtcStatus("reference only")).toBe("reference_only");
  });

  it("maps any OTHER non-empty, unrecognized status text to 'unknown', distinct from null", () => {
    expect(normalizeStoredDtcStatus("Something the parser has never seen before")).toBe("unknown");
  });
});

describe("dedupeDtcCodes — system-aware dedup", () => {
  it("keeps two records with the same code, same status, no module, but DIFFERENT systems as distinct", () => {
    const codes = dedupeDtcCodes([
      { code: "U012100", status: "history", systemName: "Electric Power Steering (EPS)" },
      { code: "U012100", status: "history", systemName: "A/C System (AC)" },
    ]);
    expect(codes).toHaveLength(2);
  });

  it("still dedupes a genuine duplicate — same code, same status, same system", () => {
    const codes = dedupeDtcCodes([
      { code: "U012100", status: "history", systemName: "A/C System (AC)" },
      { code: "U012100", status: "history", systemName: "A/C System (AC)" },
    ]);
    expect(codes).toHaveLength(1);
  });
});
