import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cancelSubscription, resumeSubscription } from "@/lib/payments/creem";

// cancelSubscription/resumeSubscription are the first functions in this
// file to hit the network — mock global.fetch directly rather than the
// Creem SDK (this codebase doesn't use one, see creem.ts's plain-fetch
// pattern throughout).
const ENV_VARS = ["CREEM_API_KEY", "CREEM_API_BASE_URL"];
let originalValues: Record<string, string | undefined> = {};

beforeEach(() => {
  originalValues = {};
  for (const key of ENV_VARS) originalValues[key] = process.env[key];
  process.env.CREEM_API_KEY = "test-key";
  process.env.CREEM_API_BASE_URL = "https://test-api.creem.io/v1";
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  for (const key of ENV_VARS) {
    if (originalValues[key] === undefined) delete process.env[key];
    else process.env[key] = originalValues[key];
  }
  vi.unstubAllGlobals();
});

describe("cancelSubscription", () => {
  it("posts to /subscriptions/{id}/cancel with mode: scheduled and the x-api-key header", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "sub_123", status: "active" }),
    });

    const result = await cancelSubscription("sub_123");

    expect(fetch).toHaveBeenCalledWith(
      "https://test-api.creem.io/v1/subscriptions/sub_123/cancel",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-api-key": "test-key" }),
        body: JSON.stringify({ mode: "scheduled" }),
      }),
    );
    expect(result).toEqual({ id: "sub_123", status: "active" });
  });

  it("throws with the established error-message format on a non-ok response", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "subscription not found",
    });

    await expect(cancelSubscription("sub_missing")).rejects.toThrow(
      "Creem subscription cancel failed (404): subscription not found",
    );
  });
});

describe("resumeSubscription", () => {
  it("posts to /subscriptions/{id}/resume with the x-api-key header, no body needed beyond content-type", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "sub_123", status: "active" }),
    });

    const result = await resumeSubscription("sub_123");

    expect(fetch).toHaveBeenCalledWith(
      "https://test-api.creem.io/v1/subscriptions/sub_123/resume",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-api-key": "test-key" }),
      }),
    );
    expect(result).toEqual({ id: "sub_123", status: "active" });
  });

  it("throws with the established error-message format on a non-ok response", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "nothing to resume",
    });

    await expect(resumeSubscription("sub_123")).rejects.toThrow(
      "Creem subscription resume failed (400): nothing to resume",
    );
  });
});
