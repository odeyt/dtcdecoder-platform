import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

const { submitFeedback, listFeedbackHistory } = await import("@/lib/scan-diagnostics/feedback");
const { InvalidCaseStatusError, ScanCaseNotFoundError } = await import("@/lib/scan-diagnostics/api-errors");

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

function seedCompletedCase(caseId: string, userId: string, reportId: string) {
  fake().seed("scan_cases", [{ id: caseId, user_id: userId, status: "completed" }]);
  fake().seed("scan_reports", [{ id: reportId, case_id: caseId, confidence: 70 }]);
}

beforeEach(() => {
  fake().reset();
});

describe("submitFeedback", () => {
  it("creates feedback for a completed case", async () => {
    seedCompletedCase("case-1", "user-1", "report-1");

    const feedback = await submitFeedback("user-1", "case-1", {
      diagnosisWasCorrect: true,
      confirmedFix: "Replaced intake gasket",
      partsReplaced: ["Intake manifold gasket"],
    });

    expect(feedback.diagnosis_was_correct).toBe(true);
    expect(feedback.report_id).toBe("report-1");
    expect(fake().dump("scan_feedback")).toHaveLength(1);
  });

  it("resubmitting feedback for the same case updates it rather than duplicating", async () => {
    seedCompletedCase("case-1", "user-1", "report-1");

    await submitFeedback("user-1", "case-1", { diagnosisWasCorrect: false });
    await submitFeedback("user-1", "case-1", { diagnosisWasCorrect: true, actualRootCause: "O2 sensor" });

    const rows = fake().dump("scan_feedback");
    expect(rows).toHaveLength(1);
    expect(rows[0].diagnosis_was_correct).toBe(true);
    expect(rows[0].actual_root_cause).toBe("O2 sensor");
  });

  it("throws for a case with no report yet", async () => {
    fake().seed("scan_cases", [{ id: "case-2", user_id: "user-1", status: "analyzing" }]);

    await expect(submitFeedback("user-1", "case-2", { diagnosisWasCorrect: true })).rejects.toBeInstanceOf(
      InvalidCaseStatusError,
    );
  });

  it("throws ScanCaseNotFoundError for a case owned by someone else", async () => {
    seedCompletedCase("case-1", "user-1", "report-1");

    await expect(submitFeedback("user-2", "case-1", { diagnosisWasCorrect: true })).rejects.toBeInstanceOf(
      ScanCaseNotFoundError,
    );
  });
});

describe("listFeedbackHistory", () => {
  it("returns only the requesting user's feedback, newest first", async () => {
    fake().seed("scan_feedback", [
      { id: "fb-1", case_id: "case-1", user_id: "user-1", submitted_at: "2026-01-01T00:00:00Z" },
      { id: "fb-2", case_id: "case-2", user_id: "user-1", submitted_at: "2026-02-01T00:00:00Z" },
      { id: "fb-3", case_id: "case-3", user_id: "user-2", submitted_at: "2026-03-01T00:00:00Z" },
    ]);

    const history = await listFeedbackHistory("user-1");
    expect(history.map((f) => f.id)).toEqual(["fb-2", "fb-1"]);
  });
});
