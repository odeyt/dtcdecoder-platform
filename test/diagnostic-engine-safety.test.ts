import { describe, expect, it } from "vitest";
import { classifyDriveSafety } from "@/lib/diagnostic-engine/safety";
import type { EvidenceItem } from "@/lib/diagnostic-engine/types";

function safetyIssueEvidence(count: number): EvidenceItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `e${i}`,
    caseId: "case-1",
    type: "safety_issue" as const,
    value: { code: "P0562", reason: "Flagged as a safety-relevant system fault." },
    source: "derived" as const,
    confidence: "medium" as const,
    recordedAt: "now",
  }));
}

describe("classifyDriveSafety", () => {
  it("classifies immediate_stop when a warning matches an immediate-stop keyword, even over other signals", () => {
    const result = classifyDriveSafety(safetyIssueEvidence(2), ["Do not drive — risk of fire from the affected wiring harness."]);
    expect(result.status).toBe("immediate_stop");
    expect(result.reasoning).toContain("Do not drive");
  });

  it("classifies tow_recommended when a warning matches a no-start/tow keyword", () => {
    const result = classifyDriveSafety([], ["The vehicle will not start reliably and should be towed for diagnosis."]);
    expect(result.status).toBe("tow_recommended");
  });

  it("classifies drive_with_caution from safety_issue evidence alone, with no safety warnings at all", () => {
    const result = classifyDriveSafety(safetyIssueEvidence(1), []);
    expect(result.status).toBe("drive_with_caution");
    expect(result.reasoning).toContain("1 safety-relevant DTC");
  });

  it("classifies drive_with_caution from a caution-keyword warning when there is no safety_issue evidence", () => {
    const result = classifyDriveSafety([], ["Intermittent stall reported at highway speed — use caution."]);
    expect(result.status).toBe("drive_with_caution");
  });

  it("falls back to drive_with_caution for an unrecognized but non-empty warning", () => {
    const result = classifyDriveSafety([], ["Something unusual was observed in the diagnostic session."]);
    expect(result.status).toBe("drive_with_caution");
  });

  it("classifies safe_to_drive when there is no safety evidence and no warnings at all", () => {
    const result = classifyDriveSafety([], []);
    expect(result.status).toBe("safe_to_drive");
  });

  it("immediate_stop keyword scanning takes priority over safety_issue evidence", () => {
    const result = classifyDriveSafety(safetyIssueEvidence(3), ["Loss of steering reported — do not drive."]);
    expect(result.status).toBe("immediate_stop");
  });
});
