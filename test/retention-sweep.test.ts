import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

const deleteScanFileMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/scan-diagnostics/storage", () => ({ deleteScanFile: deleteScanFileMock }));

const { runRetentionSweep, PAID_RETENTION_DAYS } = await import("@/lib/scan-diagnostics/retention");

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

beforeEach(() => {
  fake().reset();
  deleteScanFileMock.mockClear();
});

describe("runRetentionSweep — selection", () => {
  it("selects a completed case older than the retention window, owned by an active pro/workshop subscriber", async () => {
    fake().seed("scan_cases", [
      { id: "case-old-paid", user_id: "user-pro", status: "completed", created_at: daysAgoIso(PAID_RETENTION_DAYS + 1) },
    ]);
    fake().seed("subscriptions", [{ user_id: "user-pro", plan: "pro", status: "active" }]);

    const result = await runRetentionSweep({ dryRun: true });
    expect(result.candidateCaseIds).toEqual(["case-old-paid"]);
    expect(result.deletedCaseIds).toEqual([]); // dry run never deletes
  });

  it("does not select a case younger than the retention window", async () => {
    fake().seed("scan_cases", [
      { id: "case-recent", user_id: "user-pro", status: "completed", created_at: daysAgoIso(PAID_RETENTION_DAYS - 1) },
    ]);
    fake().seed("subscriptions", [{ user_id: "user-pro", plan: "pro", status: "active" }]);

    const result = await runRetentionSweep({ dryRun: true });
    expect(result.candidateCaseIds).toEqual([]);
  });

  it("does not select a case whose owner has no active pro/workshop subscription", async () => {
    fake().seed("scan_cases", [
      { id: "case-free-user", user_id: "user-free", status: "completed", created_at: daysAgoIso(PAID_RETENTION_DAYS + 1) },
    ]);
    // No subscriptions row at all for user-free — never paid.

    const result = await runRetentionSweep({ dryRun: true });
    expect(result.candidateCaseIds).toEqual([]);
  });

  it("does not select a case with an active (unexpired) single-report purchase unlock — that follows its own 30-day rule instead", async () => {
    fake().seed("scan_cases", [
      { id: "case-unlocked", user_id: "user-pro", status: "completed", created_at: daysAgoIso(PAID_RETENTION_DAYS + 1) },
    ]);
    fake().seed("subscriptions", [{ user_id: "user-pro", plan: "pro", status: "active" }]);
    fake().seed("single_report_purchases", [
      {
        user_id: "user-pro",
        case_id: "case-unlocked",
        status: "consumed",
        expires_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ]);

    const result = await runRetentionSweep({ dryRun: true });
    expect(result.candidateCaseIds).toEqual([]);
  });

  it("does not select a draft/failed case that never produced a report", async () => {
    fake().seed("scan_cases", [
      { id: "case-draft", user_id: "user-pro", status: "draft", created_at: daysAgoIso(PAID_RETENTION_DAYS + 1) },
    ]);
    fake().seed("subscriptions", [{ user_id: "user-pro", plan: "pro", status: "active" }]);

    const result = await runRetentionSweep({ dryRun: true });
    expect(result.candidateCaseIds).toEqual([]);
  });
});

describe("runRetentionSweep — deletion", () => {
  it("deletes the storage file(s) and the case row (cascade covers the rest) when not a dry run", async () => {
    fake().seed("scan_cases", [
      { id: "case-to-delete", user_id: "user-pro", status: "completed", created_at: daysAgoIso(PAID_RETENTION_DAYS + 1) },
    ]);
    fake().seed("subscriptions", [{ user_id: "user-pro", plan: "pro", status: "active" }]);
    fake().seed("scan_case_files", [{ case_id: "case-to-delete", storage_path: "user-pro/case-to-delete/abc123" }]);

    const result = await runRetentionSweep({ dryRun: false });

    expect(result.deletedCaseIds).toEqual(["case-to-delete"]);
    expect(deleteScanFileMock).toHaveBeenCalledWith("user-pro/case-to-delete/abc123");
    expect(fake().dump("scan_cases")).toHaveLength(0);
  });

  it("a dry run reports candidates but deletes nothing", async () => {
    fake().seed("scan_cases", [
      { id: "case-dry-run", user_id: "user-pro", status: "completed", created_at: daysAgoIso(PAID_RETENTION_DAYS + 1) },
    ]);
    fake().seed("subscriptions", [{ user_id: "user-pro", plan: "pro", status: "active" }]);
    fake().seed("scan_case_files", [{ case_id: "case-dry-run", storage_path: "user-pro/case-dry-run/xyz" }]);

    const result = await runRetentionSweep({ dryRun: true });

    expect(result.candidateCaseIds).toEqual(["case-dry-run"]);
    expect(result.deletedCaseIds).toEqual([]);
    expect(deleteScanFileMock).not.toHaveBeenCalled();
    expect(fake().dump("scan_cases")).toHaveLength(1);
  });
});
