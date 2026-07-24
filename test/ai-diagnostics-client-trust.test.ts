import { describe, expect, it } from "vitest";
import { CaseInfoInputSchema, ExtractionReviewInputSchema, FeedbackInputSchema } from "@/lib/scan-diagnostics/schemas";

// Required test: "Users cannot alter plan through client requests." Every
// request-body schema in this app is a plain zod object (default "strip"
// mode, not .passthrough()) — an unrecognized field like `plan`, `isPaid`,
// `unlimited`, or `remainingUsage` is silently dropped from the parsed
// result rather than being accepted or erroring, and no route ever reads
// such a field from a request body in the first place. Plan is always
// resolved server-side via getEffectivePlan(userId, email) — see
// src/lib/subscriptions.ts — never from client input.
describe("request schemas never carry a client-supplied plan/entitlement field", () => {
  const maliciousExtras = {
    plan: "workshop",
    isPaid: true,
    unlimited: true,
    remainingUsage: 999,
    subscriptionStatus: "active",
    role: "admin",
  };

  it("CaseInfoInputSchema strips unrecognized plan/entitlement fields", () => {
    const parsed = CaseInfoInputSchema.parse({ complaint: "Check engine light", ...maliciousExtras });
    expect(parsed).not.toHaveProperty("plan");
    expect(parsed).not.toHaveProperty("isPaid");
    expect(parsed).not.toHaveProperty("unlimited");
    expect(parsed).not.toHaveProperty("remainingUsage");
    expect(parsed).not.toHaveProperty("subscriptionStatus");
    expect(parsed).not.toHaveProperty("role");
  });

  it("ExtractionReviewInputSchema strips unrecognized plan/entitlement fields", () => {
    const parsed = ExtractionReviewInputSchema.parse({ vin: "1FTFW1ET1EFA00001", ...maliciousExtras });
    expect(parsed).not.toHaveProperty("plan");
    expect(parsed).not.toHaveProperty("unlimited");
  });

  it("FeedbackInputSchema strips unrecognized plan/entitlement fields", () => {
    const parsed = FeedbackInputSchema.parse({ diagnosisWasCorrect: true, ...maliciousExtras });
    expect(parsed).not.toHaveProperty("plan");
    expect(parsed).not.toHaveProperty("isPaid");
  });
});
