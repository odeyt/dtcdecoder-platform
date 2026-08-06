import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

// updateSearchHistoryQuery/deleteSearchHistoryEntry (src/lib/search-history.ts)
// back the history page's edit/delete UI — both are ownership-scoped (a
// caller can only touch rows where user_id matches), mirroring
// updateNote/deleteNote in workbench.ts. This tests that scoping directly
// against the fake Supabase client used elsewhere in this suite.
vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

const { updateSearchHistoryQuery, deleteSearchHistoryEntry, SearchHistoryNotFoundError } = await import(
  "@/lib/search-history"
);

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

beforeEach(() => {
  fake().reset();
  fake().seed("search_history", [
    { id: "entry-1", user_id: "user-1", kind: "ai", query: "original query", created_at: "2026-01-01T00:00:00Z" },
  ]);
});

describe("updateSearchHistoryQuery", () => {
  it("updates the query text for the owning user", async () => {
    const result = await updateSearchHistoryQuery("user-1", "entry-1", "renamed query");
    expect(result.query).toBe("renamed query");
    expect(fake().dump("search_history").find((r) => r.id === "entry-1")?.query).toBe("renamed query");
  });

  it("throws SearchHistoryNotFoundError for a different user's entry", async () => {
    await expect(updateSearchHistoryQuery("user-2", "entry-1", "hijacked")).rejects.toThrow(
      SearchHistoryNotFoundError,
    );
    // Never mutated despite the attempt.
    expect(fake().dump("search_history").find((r) => r.id === "entry-1")?.query).toBe("original query");
  });

  it("throws SearchHistoryNotFoundError for a nonexistent id", async () => {
    await expect(updateSearchHistoryQuery("user-1", "does-not-exist", "x")).rejects.toThrow(
      SearchHistoryNotFoundError,
    );
  });

  it("truncates to 500 chars like recordSearchHistory does", async () => {
    const longQuery = "x".repeat(600);
    const result = await updateSearchHistoryQuery("user-1", "entry-1", longQuery);
    expect(result.query).toHaveLength(500);
  });
});

describe("deleteSearchHistoryEntry", () => {
  it("deletes the entry for the owning user", async () => {
    await deleteSearchHistoryEntry("user-1", "entry-1");
    expect(fake().dump("search_history").find((r) => r.id === "entry-1")).toBeUndefined();
  });

  it("throws SearchHistoryNotFoundError and never deletes a different user's entry", async () => {
    await expect(deleteSearchHistoryEntry("user-2", "entry-1")).rejects.toThrow(SearchHistoryNotFoundError);
    expect(fake().dump("search_history").find((r) => r.id === "entry-1")).toBeDefined();
  });

  it("throws SearchHistoryNotFoundError for a nonexistent id", async () => {
    await expect(deleteSearchHistoryEntry("user-1", "does-not-exist")).rejects.toThrow(SearchHistoryNotFoundError);
  });
});
