import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

const { getHypothesesForCase, saveHypotheses } = await import("@/lib/diagnostic-engine/probability");
import type { RankedHypothesis } from "@/lib/diagnostic-engine/types";

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

beforeEach(() => {
  fake().reset();
});

const hypotheses: RankedHypothesis[] = [
  { rank: 1, hypothesis: "Open ground", confidenceLevel: "high", reasoning: "r1", evidenceStrength: "strong", supportingEvidenceIds: ["e1"], missingEvidence: [], requiredTests: ["Ohm test"] },
  { rank: 2, hypothesis: "Crank sensor fault", confidenceLevel: "low", reasoning: "r2", evidenceStrength: "weak", supportingEvidenceIds: [], missingEvidence: [], requiredTests: [] },
];

describe("getHypothesesForCase / saveHypotheses", () => {
  it("returns [] for a case with no snapshot yet", async () => {
    expect(await getHypothesesForCase("case-1")).toEqual([]);
  });

  it("persists and reads back a ranked-hypothesis snapshot, ordered by rank", async () => {
    await saveHypotheses("case-1", hypotheses);
    const read = await getHypothesesForCase("case-1");
    expect(read.map((h) => h.hypothesis)).toEqual(["Open ground", "Crank sensor fault"]);
    expect(read[0].requiredTests).toEqual(["Ohm test"]);
  });

  it("replaces the previous snapshot rather than accumulating history", async () => {
    await saveHypotheses("case-1", hypotheses);
    await saveHypotheses("case-1", [{ ...hypotheses[0], hypothesis: "Revised cause" }]);
    const read = await getHypothesesForCase("case-1");
    expect(read).toHaveLength(1);
    expect(read[0].hypothesis).toBe("Revised cause");
  });

  it("clears the snapshot entirely when saved with an empty list", async () => {
    await saveHypotheses("case-1", hypotheses);
    await saveHypotheses("case-1", []);
    expect(await getHypothesesForCase("case-1")).toEqual([]);
  });
});
