import { describe, expect, it } from "vitest";
import { causeStatusToPill, testOutcomeToPill } from "@/lib/scan-diagnostics/pill-mapping";
import type { ScanCauseStatus, ScanTestOutcome } from "@/lib/types";

describe("causeStatusToPill", () => {
  it.each([
    ["untested", "not_tested"],
    ["supported", "supported"],
    ["ruled_out", "ruled_out"],
    ["confirmed", "confirmed"],
  ] as const)("maps cause status %s to pill value %s", (status: ScanCauseStatus, expected) => {
    expect(causeStatusToPill(status)).toBe(expected);
  });
});

describe("testOutcomeToPill", () => {
  it.each([
    ["pass", "passed_test"],
    ["fail", "failed_test"],
    ["not_tested", "not_tested"],
  ] as const)("maps test outcome %s to pill value %s", (outcome: ScanTestOutcome, expected) => {
    expect(testOutcomeToPill(outcome)).toBe(expected);
  });
});
