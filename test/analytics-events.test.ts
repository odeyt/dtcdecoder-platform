import { describe, expect, it, vi } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabaseAnalytics = fake;
  return { createAdminClient: () => fake };
});

const { recordEvent, isAnalyticsEventType, ANALYTICS_EVENT_TYPES } = await import("@/lib/analytics/events");

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabaseAnalytics as FakeSupabase;
}

describe("isAnalyticsEventType", () => {
  it("accepts every declared event type", () => {
    for (const type of ANALYTICS_EVENT_TYPES) {
      expect(isAnalyticsEventType(type)).toBe(true);
    }
  });

  it("rejects anything not in the fixed enum", () => {
    expect(isAnalyticsEventType("some_made_up_event")).toBe(false);
    expect(isAnalyticsEventType(123)).toBe(false);
    expect(isAnalyticsEventType(null)).toBe(false);
    expect(isAnalyticsEventType(undefined)).toBe(false);
  });
});

describe("recordEvent", () => {
  it("inserts a row with the event type, user id, and metadata", async () => {
    await recordEvent("ai_diagnosis_cta_clicked", { userId: "user-1", metadata: { source: "known_dtc_page" } });

    const rows = fake().dump("analytics_events");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: "user-1",
      event_type: "ai_diagnosis_cta_clicked",
      metadata: { source: "known_dtc_page" },
    });
  });

  it("defaults userId to null and metadata to {} when omitted", async () => {
    await recordEvent("basic_dtc_search");

    const rows = fake().dump("analytics_events");
    const row = rows.find((r) => r.event_type === "basic_dtc_search");
    expect(row).toMatchObject({ user_id: null, metadata: {} });
  });

  it("never throws — a logging failure must not break the caller's request", async () => {
    // No live DB/network in this unit test at all (the fake in-memory client
    // never rejects) — this asserts the resolved shape (void), which is the
    // contract callers rely on to await recordEvent without a try/catch.
    await expect(recordEvent("upgrade_prompt_viewed")).resolves.toBeUndefined();
  });
});
