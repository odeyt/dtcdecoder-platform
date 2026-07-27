import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

const {
  generateRepairVerificationChecklist,
  createRepairVerification,
  getLatestRepairVerification,
  updateRepairVerificationItem,
  allItemsCompleted,
  REPAIR_VERIFICATION_TEMPLATE,
} = await import("@/lib/diagnostic-engine/repair-verification");

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

beforeEach(() => {
  fake().reset();
});

describe("generateRepairVerificationChecklist", () => {
  it("returns the fixed template, all incomplete", () => {
    const checklist = generateRepairVerificationChecklist();
    expect(checklist).toHaveLength(REPAIR_VERIFICATION_TEMPLATE.length);
    expect(checklist.every((item) => item.completed === false)).toBe(true);
    expect(checklist.map((i) => i.item)).toContain("Clear all diagnostic trouble codes");
    expect(checklist.map((i) => i.item)).toContain("Verify the customer's original complaint no longer occurs");
  });
});

describe("allItemsCompleted", () => {
  it("is false for an empty checklist and for any incomplete item", () => {
    expect(allItemsCompleted([])).toBe(false);
    expect(allItemsCompleted([{ item: "a", completed: true }, { item: "b", completed: false }])).toBe(false);
  });

  it("is true only when every item is completed", () => {
    expect(allItemsCompleted([{ item: "a", completed: true }, { item: "b", completed: true }])).toBe(true);
  });
});

describe("createRepairVerification / getLatestRepairVerification", () => {
  it("creates a fresh checklist and reads it back for the case", async () => {
    await createRepairVerification("case-1");
    const latest = await getLatestRepairVerification("case-1");
    expect(latest?.checklist).toHaveLength(REPAIR_VERIFICATION_TEMPLATE.length);
    // The real schema leaves completed_at NULL until every item is done;
    // the in-memory fake doesn't apply column defaults on insert, so only
    // assert it isn't truthy rather than requiring the literal `null`.
    expect(latest?.completedAt).toBeFalsy();
  });

  it("returns null for a case with no checklist yet", async () => {
    expect(await getLatestRepairVerification("case-2")).toBeNull();
  });

  it("keeps prior repair-verification attempts as history rather than overwriting them", async () => {
    await createRepairVerification("case-1");
    await createRepairVerification("case-1");
    expect(fake().dump("repair_verifications")).toHaveLength(2);
  });
});

describe("updateRepairVerificationItem", () => {
  it("marks a single item complete without affecting the others", async () => {
    await createRepairVerification("case-1");
    const updated = await updateRepairVerificationItem("case-1", "Clear all diagnostic trouble codes", true);
    const target = updated.checklist.find((i) => i.item === "Clear all diagnostic trouble codes");
    expect(target?.completed).toBe(true);
    expect(updated.checklist.filter((i) => i.completed)).toHaveLength(1);
    expect(updated.completedAt).toBeNull();
  });

  it("sets completedAt only once every item is marked complete", async () => {
    await createRepairVerification("case-1");
    for (const item of REPAIR_VERIFICATION_TEMPLATE.slice(0, -1)) {
      const result = await updateRepairVerificationItem("case-1", item, true);
      expect(result.completedAt).toBeNull();
    }
    const final = await updateRepairVerificationItem("case-1", REPAIR_VERIFICATION_TEMPLATE.at(-1)!, true);
    expect(final.completedAt).not.toBeNull();
  });

  it("throws for a case with no checklist generated yet", async () => {
    await expect(updateRepairVerificationItem("case-none", "Clear all diagnostic trouble codes", true)).rejects.toThrow();
  });
});
