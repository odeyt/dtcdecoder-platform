import { describe, expect, it, beforeEach, vi } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fakeClient = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fakeClient;
  return { createAdminClient: () => fakeClient };
});

const {
  listNotes,
  createNote,
  updateNote,
  deleteNote,
  listTestProgress,
  upsertTestProgress,
  listCauseStatus,
  upsertCauseStatus,
  getVerification,
  upsertVerification,
  getCompletionSummary,
  markCaseComplete,
} = await import("@/lib/scan-diagnostics/workbench");
const { ScanCaseNotFoundError, InvalidCaseStatusError, InvalidReportIndexError } = await import(
  "@/lib/scan-diagnostics/api-errors"
);

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

const OWNER = "user-owner";
const OTHER = "user-other";
const CASE_ID = "case-1";
const REPORT_ID = "report-1";

function seedCaseAndReport(testCount = 2, causeCount = 2) {
  fake().seed("scan_cases", [{ id: CASE_ID, user_id: OWNER, status: "completed" }]);
  fake().seed("scan_reports", [
    {
      id: REPORT_ID,
      case_id: CASE_ID,
      recommended_tests: Array.from({ length: testCount }, (_, i) => ({ step: `Test ${i}` })),
      ranked_causes: Array.from({ length: causeCount }, (_, i) => ({ cause: `Cause ${i}` })),
    },
  ]);
}

beforeEach(() => {
  fake().reset();
});

describe("workbench — notes", () => {
  it("creates and lists notes for the owner, pinned first then newest first", async () => {
    seedCaseAndReport();
    await createNote(OWNER, CASE_ID, { category: "observation", body: "First note" });
    const pinned = await createNote(OWNER, CASE_ID, { category: "measurement", body: "Pinned note", pinned: true });

    const notes = await listNotes(OWNER, CASE_ID);
    expect(notes).toHaveLength(2);
    expect(notes[0].id).toBe(pinned.id);
  });

  it("rejects a non-owner from creating, listing, updating, or deleting notes", async () => {
    seedCaseAndReport();
    const note = await createNote(OWNER, CASE_ID, { category: "observation", body: "Owner's note" });

    await expect(createNote(OTHER, CASE_ID, { category: "observation", body: "x" })).rejects.toBeInstanceOf(
      ScanCaseNotFoundError,
    );
    await expect(listNotes(OTHER, CASE_ID)).rejects.toBeInstanceOf(ScanCaseNotFoundError);
    await expect(updateNote(OTHER, CASE_ID, note.id, { body: "hacked" })).rejects.toBeInstanceOf(
      ScanCaseNotFoundError,
    );
    await expect(deleteNote(OTHER, CASE_ID, note.id)).rejects.toBeInstanceOf(ScanCaseNotFoundError);
  });

  it("edits only the fields provided, leaving the rest untouched", async () => {
    seedCaseAndReport();
    const note = await createNote(OWNER, CASE_ID, { category: "observation", body: "Original", pinned: false });
    const edited = await updateNote(OWNER, CASE_ID, note.id, { body: "Updated" });
    expect(edited.body).toBe("Updated");
    expect(edited.category).toBe("observation");
    expect(edited.pinned).toBe(false);
  });

  it("deletes a note", async () => {
    seedCaseAndReport();
    const note = await createNote(OWNER, CASE_ID, { category: "follow_up", body: "Temp" });
    await deleteNote(OWNER, CASE_ID, note.id);
    expect(await listNotes(OWNER, CASE_ID)).toHaveLength(0);
  });
});

describe("workbench — test progress", () => {
  it("upserts idempotently — a second call updates the same row rather than creating a duplicate", async () => {
    seedCaseAndReport(3, 1);
    await upsertTestProgress(OWNER, CASE_ID, 0, { completed: true, outcome: "pass" });
    const second = await upsertTestProgress(OWNER, CASE_ID, 0, { actualResult: "12.6V" });

    const all = await listTestProgress(OWNER, CASE_ID);
    expect(all).toHaveLength(1);
    expect(second.completed).toBe(true);
    expect(second.outcome).toBe("pass");
    expect(second.actual_result).toBe("12.6V");
  });

  it("stamps completed_at when marked completed, clears it when un-marked", async () => {
    seedCaseAndReport(1, 1);
    const marked = await upsertTestProgress(OWNER, CASE_ID, 0, { completed: true });
    expect(marked.completed_at).not.toBeNull();

    const unmarked = await upsertTestProgress(OWNER, CASE_ID, 0, { completed: false });
    expect(unmarked.completed_at).toBeNull();
  });

  it("rejects a test index outside the report's recommended_tests range", async () => {
    seedCaseAndReport(2, 1);
    await expect(upsertTestProgress(OWNER, CASE_ID, 5, { completed: true })).rejects.toBeInstanceOf(
      InvalidReportIndexError,
    );
    await expect(upsertTestProgress(OWNER, CASE_ID, -1, { completed: true })).rejects.toBeInstanceOf(
      InvalidReportIndexError,
    );
  });

  it("requires a completed report to exist before recording progress", async () => {
    fake().seed("scan_cases", [{ id: CASE_ID, user_id: OWNER, status: "analyzing" }]);
    await expect(upsertTestProgress(OWNER, CASE_ID, 0, { completed: true })).rejects.toBeInstanceOf(
      InvalidCaseStatusError,
    );
  });
});

describe("workbench — cause status", () => {
  it("upserts idempotently and rejects an out-of-range cause index", async () => {
    seedCaseAndReport(1, 3);
    await upsertCauseStatus(OWNER, CASE_ID, 1, { status: "supported" });
    const updated = await upsertCauseStatus(OWNER, CASE_ID, 1, { reviewed: true });

    const all = await listCauseStatus(OWNER, CASE_ID);
    expect(all).toHaveLength(1);
    expect(updated.status).toBe("supported");
    expect(updated.reviewed).toBe(true);

    await expect(upsertCauseStatus(OWNER, CASE_ID, 10, { status: "confirmed" })).rejects.toBeInstanceOf(
      InvalidReportIndexError,
    );
  });
});

describe("workbench — verification checklist", () => {
  it("upserts partial updates without clobbering previously-set fields", async () => {
    seedCaseAndReport();
    await upsertVerification(OWNER, CASE_ID, { dtcsCleared: true, roadTestCompleted: true });
    const updated = await upsertVerification(OWNER, CASE_ID, { calibrationCompleted: true });

    // Note: an untouched field's real-world default (false, set by the
    // column's DB default) isn't asserted here — the in-memory fake doesn't
    // simulate Postgres column defaults on insert, only what's explicitly
    // written. What matters, and what's actually under test, is that fields
    // set true by an earlier call are never clobbered by a later partial
    // upsert that doesn't mention them.
    expect(updated.dtcs_cleared).toBe(true);
    expect(updated.road_test_completed).toBe(true);
    expect(updated.calibration_completed).toBe(true);
  });

  it("returns null (not an error) when no verification row exists yet", async () => {
    seedCaseAndReport();
    expect(await getVerification(OWNER, CASE_ID)).toBeNull();
  });
});

describe("workbench — completion summary and mark-complete", () => {
  it("computes completed/open test counts and readiness accurately", async () => {
    seedCaseAndReport(2, 1);
    await upsertTestProgress(OWNER, CASE_ID, 0, { completed: true, outcome: "pass" });

    const summaryBefore = await getCompletionSummary(OWNER, CASE_ID);
    expect(summaryBefore.totalTests).toBe(2);
    expect(summaryBefore.completedTests).toBe(1);
    expect(summaryBefore.openTests).toBe(1);
    expect(summaryBefore.readyToComplete).toBe(false);

    await upsertTestProgress(OWNER, CASE_ID, 1, { completed: true, outcome: "pass" });
    await upsertCauseStatus(OWNER, CASE_ID, 0, { status: "confirmed" });
    await upsertVerification(OWNER, CASE_ID, {
      concernResolved: true,
      dtcsCleared: true,
      dtcsDidNotReturn: true,
      calibrationCompleted: true,
      roadTestCompleted: true,
      noNewWarningLights: true,
      postRepairScanReviewed: true,
      customerNotesRecorded: true,
    });

    const summaryAfter = await getCompletionSummary(OWNER, CASE_ID);
    expect(summaryAfter.completedTests).toBe(2);
    expect(summaryAfter.openTests).toBe(0);
    expect(summaryAfter.unresolvedCauses).toBe(0);
    expect(summaryAfter.readyToComplete).toBe(true);
  });

  it("marks a case complete and stamps who/when — never silently, only on explicit call", async () => {
    seedCaseAndReport(1, 1);
    const before = fake().dump("scan_cases")[0];
    expect(before.technician_completed_at).toBeUndefined();

    const completed = await markCaseComplete(OWNER, CASE_ID);
    expect(completed.technician_completed_at).not.toBeNull();
    expect(completed.technician_completed_by).toBe(OWNER);
  });

  it("rejects mark-complete for a non-owner", async () => {
    seedCaseAndReport(1, 1);
    await expect(markCaseComplete(OTHER, CASE_ID)).rejects.toBeInstanceOf(ScanCaseNotFoundError);
  });
});
