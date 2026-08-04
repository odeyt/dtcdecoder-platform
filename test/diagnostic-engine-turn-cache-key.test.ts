import { describe, expect, it } from "vitest";

// turn-localization.ts imports "server-only" and Supabase admin — import
// only computeTurnCacheKey's pure logic by re-implementing the hash call
// through the real module (server-only is a no-op under vitest's node
// environment, matching how other server-only modules are already tested
// directly in this repo, e.g. test/scan-extraction-persistence.test.ts).
import { computeTurnCacheKey } from "@/lib/diagnostic-engine/turn-localization";
import type { DiagnosticTurnTranslatable } from "@/lib/diagnostic-engine/turn-translation";

const payloadA: DiagnosticTurnTranslatable = {
  hypotheses: [
    {
      rank: 1,
      hypothesis: "Vacuum leak",
      confidenceLevel: "medium",
      reasoning: "Lean code",
      evidenceStrength: "moderate",
      supportingEvidenceIds: [],
      missingEvidence: [],
      requiredTests: [],
    },
  ],
  testPlan: [],
};

const payloadB: DiagnosticTurnTranslatable = {
  ...payloadA,
  hypotheses: [{ ...payloadA.hypotheses[0], hypothesis: "Different hypothesis text" }],
};

describe("computeTurnCacheKey", () => {
  it("is deterministic for the same case + content", () => {
    expect(computeTurnCacheKey("case-1", payloadA)).toBe(computeTurnCacheKey("case-1", payloadA));
  });

  it("changes when the content changes (new evidence re-ranked a hypothesis) — never a stale cache hit", () => {
    expect(computeTurnCacheKey("case-1", payloadA)).not.toBe(computeTurnCacheKey("case-1", payloadB));
  });

  it("changes when the case changes, even with identical content", () => {
    expect(computeTurnCacheKey("case-1", payloadA)).not.toBe(computeTurnCacheKey("case-2", payloadA));
  });

  it("is prefixed with the case id for debuggability", () => {
    expect(computeTurnCacheKey("case-1", payloadA).startsWith("case-1:")).toBe(true);
  });
});
