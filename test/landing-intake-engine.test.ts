import { describe, expect, it, vi, beforeEach } from "vitest";
import { emptyIntake } from "@/lib/landing-intake/types";
import type { DtcCode } from "@/lib/types";

const searchDtcCodesMock = vi.fn();
const hasAllowanceMock = vi.fn();
const recordUsageMock = vi.fn();

vi.mock("@/lib/dtc", () => ({ searchDtcCodes: (...args: unknown[]) => searchDtcCodesMock(...args) }));
vi.mock("@/lib/basic-search/usage", () => ({
  hasBasicSearchAllowanceRemaining: (...args: unknown[]) => hasAllowanceMock(...args),
  recordBasicSearchUsage: (...args: unknown[]) => recordUsageMock(...args),
}));
vi.mock("@/lib/analytics/events", () => ({ recordEvent: vi.fn().mockResolvedValue(undefined) }));

const { processPublicIntake } = await import("@/lib/landing-intake/engine");

const ANON_IDENTITY = { type: "anon" as const, id: "anon-1" };

const SAMPLE_DTC: DtcCode = {
  id: "dtc-1",
  code: "P0303",
  make: null,
  model: null,
  engine_code: null,
  slug: "p0303",
  title: "Cylinder 3 Misfire Detected",
  meta_description: null,
  meaning: "Cylinder 3 Misfire Detected",
  symptoms: ["Rough idle", "Check engine light"],
  causes: ["Faulty spark plug", "Faulty ignition coil", "Vacuum leak"],
  diagnostic_steps: ["Swap coil to another cylinder and retest", "Inspect spark plug"],
  common_mistakes: null,
  difficulty: "moderate",
  severity: "moderate",
  drive_recommendation: null,
  related_makes: [],
  faq: [],
  pdf_url: null,
  youtube_url: null,
  search_count: 0,
  is_published: true,
  created_at: "",
  updated_at: "",
};

beforeEach(() => {
  searchDtcCodesMock.mockReset();
  hasAllowanceMock.mockReset().mockResolvedValue(true);
  recordUsageMock.mockReset().mockResolvedValue(undefined);
});

describe("processPublicIntake — never calls a paid provider", () => {
  it("has no import of any AI/scan-diagnostics provider module anywhere in the engine file", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(new URL("../src/lib/landing-intake/engine.ts", import.meta.url), "utf-8");
    expect(source).not.toMatch(/anthropic|openai|gemini|ai-diagnostics\/(cost|usage|orchestrator)/i);
  });
});

describe("processPublicIntake — one focused question at a time", () => {
  it("detects a DTC code on the first message and asks for vehicle info next", async () => {
    const response = await processPublicIntake({
      message: "I have P0303 on my car",
      intake: emptyIntake("en"),
      identity: ANON_IDENTITY,
      plan: "free",
    });
    expect(response.status).toBe("needs_more_information");
    expect(response.nextQuestion?.field).toBe("vehicle");
    expect(response.preservedIntake.dtcCodes).toEqual(["P0303"]);
    expect(response.preservedIntake.currentStep).toBe("vehicle");
  });

  it("walks vehicle -> status -> complaint -> basic_result in order, one question per message", async () => {
    searchDtcCodesMock.mockResolvedValue([SAMPLE_DTC]);

    let intake = emptyIntake("en");
    let r = await processPublicIntake({ message: "P0303", intake, identity: ANON_IDENTITY, plan: "free" });
    intake = r.preservedIntake;
    expect(r.nextQuestion?.field).toBe("vehicle");

    r = await processPublicIntake({ message: "2018 Toyota Camry", intake, identity: ANON_IDENTITY, plan: "free" });
    intake = r.preservedIntake;
    expect(r.nextQuestion?.field).toBe("currentCodeStatus");
    expect(intake.year).toBe("2018");
    expect(intake.make).toBe("Toyota");

    r = await processPublicIntake({ message: "it's current", intake, identity: ANON_IDENTITY, plan: "free" });
    intake = r.preservedIntake;
    expect(r.nextQuestion?.field).toBe("complaint");
    expect(intake.currentCodeStatus).toBe("current");

    r = await processPublicIntake({ message: "Rough idle at stoplights", intake, identity: ANON_IDENTITY, plan: "free" });
    expect(r.status).toBe("basic_result");
    expect(r.basicResult?.dtcCode).toBe("P0303");
  });

  it("provides basic value after two rounds with no identifiable code, rather than interrogating forever", async () => {
    let intake = emptyIntake("en");
    let r = await processPublicIntake({ message: "the engine cranks but will not start", intake, identity: ANON_IDENTITY, plan: "free" });
    intake = r.preservedIntake;
    expect(r.status).toBe("needs_more_information");
    expect(intake.currentStep).toBe("issue_retry");

    r = await processPublicIntake({ message: "still no code, just won't start", intake, identity: ANON_IDENTITY, plan: "free" });
    expect(r.status).toBe("basic_result");
    expect(r.basicResult?.dtcCode).toBe("UNKNOWN");
  });
});

describe("processPublicIntake — basic result uses local data only", () => {
  it("returns a basic_result sourced from searchDtcCodes, with symptoms/causes/checks capped and populated", async () => {
    searchDtcCodesMock.mockResolvedValue([SAMPLE_DTC]);
    const intake = { ...emptyIntake("en"), dtcCodes: ["P0303"], currentStep: "complaint" };
    const response = await processPublicIntake({ message: "rough idle", intake, identity: ANON_IDENTITY, plan: "free" });

    expect(response.status).toBe("basic_result");
    expect(response.basicResult).toMatchObject({
      dtcCode: "P0303",
      definition: SAMPLE_DTC.meaning,
      category: "Powertrain",
    });
    expect(response.basicResult?.genericCauses).toEqual(SAMPLE_DTC.causes.slice(0, 5));
    expect(searchDtcCodesMock).toHaveBeenCalledWith("P0303");
  });

  it("falls back to a generic 'not in database yet' result for a valid-format but unknown code", async () => {
    searchDtcCodesMock.mockResolvedValue([]);
    const intake = { ...emptyIntake("en"), dtcCodes: ["P9999"], currentStep: "complaint" };
    const response = await processPublicIntake({ message: "x", intake, identity: ANON_IDENTITY, plan: "free" });

    expect(response.status).toBe("basic_result");
    expect(response.basicResult?.definition).toMatch(/isn't in our reference database/i);
  });
});

describe("processPublicIntake — free-tier rate limiting", () => {
  it("returns upgrade_required (never calls searchDtcCodes) once the free allowance is exhausted", async () => {
    hasAllowanceMock.mockResolvedValue(false);
    const intake = { ...emptyIntake("en"), dtcCodes: ["P0303"], currentStep: "complaint" };
    const response = await processPublicIntake({ message: "rough idle", intake, identity: ANON_IDENTITY, plan: "free" });

    expect(response.status).toBe("upgrade_required");
    expect(searchDtcCodesMock).not.toHaveBeenCalled();
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it("records basic-search usage exactly once per successful lookup", async () => {
    searchDtcCodesMock.mockResolvedValue([SAMPLE_DTC]);
    const intake = { ...emptyIntake("en"), dtcCodes: ["P0303"], currentStep: "complaint" };
    await processPublicIntake({ message: "rough idle", intake, identity: ANON_IDENTITY, plan: "free" });
    expect(recordUsageMock).toHaveBeenCalledTimes(1);
  });
});

describe("processPublicIntake — post-result hand-off", () => {
  it("requires sign-in for any further message after a basic_result has already been delivered", async () => {
    const intake = { ...emptyIntake("en"), dtcCodes: ["P0303"], currentStep: "complete" };
    const response = await processPublicIntake({ message: "tell me more", intake, identity: ANON_IDENTITY, plan: "free" });
    expect(response.status).toBe("sign_in_required");
    expect(response.preservedIntake.dtcCodes).toEqual(["P0303"]);
  });
});
