import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

const { selectNextQuestion, recordQuestion, recordAnswer, getQuestionsForCase, QUESTION_BANK } = await import(
  "@/lib/diagnostic-engine/question"
);
import type { EvidenceItem } from "@/lib/diagnostic-engine/types";

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

beforeEach(() => {
  fake().reset();
});

describe("selectNextQuestion", () => {
  it("picks the lowest-priority-tier candidate not yet asked", () => {
    const candidate = selectNextQuestion(new Set(), []);
    expect(candidate?.fieldKey).toBe("complaint");
  });

  it("never re-selects a fieldKey already asked, even if its evidence type is still missing", () => {
    const candidate = selectNextQuestion(new Set(["complaint"]), []);
    expect(candidate?.fieldKey).not.toBe("complaint");
    expect(["symptom_onset", "dtc_status"]).toContain(candidate?.fieldKey);
  });

  it("skips a candidate whose skipIfEvidenceType is already present, even if unasked", () => {
    const evidence: EvidenceItem[] = [
      { id: "e1", caseId: "case-1", type: "complaint", value: "x", source: "user_reported", confidence: "high", recordedAt: "now" },
    ];
    const candidate = selectNextQuestion(new Set(), evidence);
    expect(candidate?.fieldKey).not.toBe("complaint");
  });

  it("returns null once every candidate has been asked or is redundant", () => {
    const allFieldKeys = new Set(QUESTION_BANK.map((q) => q.fieldKey));
    expect(selectNextQuestion(allFieldKeys, [])).toBeNull();
  });
});

describe("recordQuestion / getQuestionsForCase / recordAnswer", () => {
  it("assigns sequential sequence numbers per case", async () => {
    const q1 = await recordQuestion("case-1", QUESTION_BANK[0]);
    const q2 = await recordQuestion("case-1", QUESTION_BANK[1]);
    expect(q1.sequence).toBe(1);
    expect(q2.sequence).toBe(2);

    const questions = await getQuestionsForCase("case-1");
    expect(questions.map((q) => q.fieldKey)).toEqual([QUESTION_BANK[0].fieldKey, QUESTION_BANK[1].fieldKey]);
  });

  it("marks a question answered and persists the answer", async () => {
    const question = await recordQuestion("case-1", QUESTION_BANK[3]);
    // The real schema defaults `answered` to false (migration 0031); the
    // in-memory fake doesn't apply column defaults on insert, so only
    // assert it isn't truthy rather than requiring the literal `false`.
    expect(question.answered).toBeFalsy();

    const answer = await recordAnswer(question.id, "case-1", "Yes", "yes");
    expect(answer.answerText).toBe("Yes");

    const [updated] = await getQuestionsForCase("case-1");
    expect(updated.answered).toBe(true);
  });
});
