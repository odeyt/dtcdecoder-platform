import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { isSingleReportCheckoutConfigured, isSingleReportProductId } from "@/lib/payments/creem";

// Mirrors test/payments-creem-addon.test.ts's convention: no product id is
// configured in any environment yet, so these tests exercise both the
// disabled and configured states by toggling the env var directly.
const ENV_VAR = "CREEM_PROFESSIONAL_REPORT_PRODUCT_ID";
let originalValue: string | undefined;

beforeEach(() => {
  originalValue = process.env[ENV_VAR];
  delete process.env[ENV_VAR];
});

afterEach(() => {
  if (originalValue === undefined) delete process.env[ENV_VAR];
  else process.env[ENV_VAR] = originalValue;
});

describe("isSingleReportCheckoutConfigured", () => {
  it("is false when CREEM_PROFESSIONAL_REPORT_PRODUCT_ID is unset (today's real state)", () => {
    expect(isSingleReportCheckoutConfigured()).toBe(false);
  });

  it("is true once the product id is configured", () => {
    process.env[ENV_VAR] = "prod_professional_report";
    expect(isSingleReportCheckoutConfigured()).toBe(true);
  });
});

describe("isSingleReportProductId", () => {
  it("is false for an unconfigured/unrelated product id", () => {
    expect(isSingleReportProductId("prod_unrelated")).toBe(false);
    expect(isSingleReportProductId(undefined)).toBe(false);
  });

  it("matches only the configured product id", () => {
    process.env[ENV_VAR] = "prod_professional_report";
    expect(isSingleReportProductId("prod_professional_report")).toBe(true);
    expect(isSingleReportProductId("prod_something_else")).toBe(false);
  });
});
