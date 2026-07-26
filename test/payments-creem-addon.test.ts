import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { isAddOnCheckoutConfigured, addonPackForProductId } from "@/lib/payments/creem";

// isAddOnCheckoutConfigured/addonPackForProductId read process.env directly
// through src/lib/env.ts — no product ids are set in any environment yet
// (per the task's own "do not enable checkout until valid Creem product
// IDs are configured" instruction), so these tests exercise both the
// current disabled state and the configured state by toggling the env
// vars directly, restoring them afterward.
const ADDON_ENV_VARS = ["CREEM_ADDON_10_PRODUCT_ID", "CREEM_ADDON_25_PRODUCT_ID", "CREEM_ADDON_50_PRODUCT_ID"];
let originalValues: Record<string, string | undefined> = {};

beforeEach(() => {
  originalValues = {};
  for (const key of ADDON_ENV_VARS) {
    originalValues[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ADDON_ENV_VARS) {
    if (originalValues[key] === undefined) delete process.env[key];
    else process.env[key] = originalValues[key];
  }
});

describe("isAddOnCheckoutConfigured", () => {
  it("is false for every pack when no product ids are configured (today's real state)", () => {
    expect(isAddOnCheckoutConfigured("addon-10")).toBe(false);
    expect(isAddOnCheckoutConfigured("addon-25")).toBe(false);
    expect(isAddOnCheckoutConfigured("addon-50")).toBe(false);
  });

  it("is false for an unrecognized pack id even if some product ids are configured", () => {
    process.env.CREEM_ADDON_10_PRODUCT_ID = "prod_123";
    expect(isAddOnCheckoutConfigured("addon-does-not-exist")).toBe(false);
  });

  it("becomes true for exactly the pack whose product id is set", () => {
    process.env.CREEM_ADDON_10_PRODUCT_ID = "prod_123";
    expect(isAddOnCheckoutConfigured("addon-10")).toBe(true);
    expect(isAddOnCheckoutConfigured("addon-25")).toBe(false);
    expect(isAddOnCheckoutConfigured("addon-50")).toBe(false);
  });
});

describe("addonPackForProductId", () => {
  it("returns null for an unconfigured/unknown product id", () => {
    expect(addonPackForProductId("prod_unknown")).toBeNull();
    expect(addonPackForProductId(undefined)).toBeNull();
  });

  it("returns the full registry entry (id + reports + priceUsd) for a configured product id", () => {
    process.env.CREEM_ADDON_25_PRODUCT_ID = "prod_addon25";
    const pack = addonPackForProductId("prod_addon25");
    expect(pack).toEqual({ id: "addon-25", reports: 25, priceUsd: 30 });
  });
});
