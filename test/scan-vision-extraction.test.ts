import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    openaiApiKeyOptional: () => "test-key",
    openaiPrimaryModelOptional: () => "test-model",
    openaiFallbackModelOptional: () => undefined,
    openaiTranslationModelOptional: () => undefined,
  },
}));

// Image normalization has its own dedicated test file
// (scan-image-processing.test.ts) — mocked here so this file can exercise
// the OpenAI call/mapping logic against arbitrary (non-decodable) buffers.
vi.mock("@/lib/scan-diagnostics/image-processing", () => ({
  normalizeImage: vi.fn(async (buffer: Buffer) => ({
    buffer,
    mediaType: "image/jpeg" as const,
    format: "jpeg" as const,
    width: 100,
    height: 100,
  })),
}));

type MockState = { queue: unknown[]; calls: number };

vi.mock("openai", () => {
  const state: MockState = { queue: [], calls: 0 };
  (globalThis as Record<string, unknown>).__openaiVisionState = state;

  class FakeOpenAI {
    chat = {
      completions: {
        parse: async () => {
          state.calls += 1;
          const next = state.queue.shift();
          if (next instanceof Error) throw next;
          if (!next) throw new Error("no queued OpenAI response for this call");
          return next;
        },
      },
    };
    constructor(_opts: unknown) {}
  }
  return { default: FakeOpenAI };
});

const { extractFromImages } = await import("@/lib/scan-diagnostics/ai/vision-extraction");

function st() {
  return (globalThis as Record<string, unknown>).__openaiVisionState as MockState;
}

function completion(finishReason: string, parsed: unknown, refusal: string | null = null) {
  return {
    model: "test-model",
    usage: { prompt_tokens: 500, completion_tokens: 300 },
    choices: [{ finish_reason: finishReason, message: { parsed, refusal } }],
  };
}

const BASE_OUTPUT = {
  vin: "1FTFW1ET1EFA00001",
  make: "Ford",
  model: "F-150",
  modelYear: 2018,
  engine: null,
  odometerMiles: null,
  scannerBrand: "Autel MaxiCOM",
  testTime: null,
  modules: [{ name: "ECM", status: "faulted" }],
  dtcCodes: [
    {
      module: "ECM",
      code: "P0?17",
      status: "current",
      descriptionRaw: "Crankshaft position - camshaft correlation",
      sourceImageIndex: 1,
    },
  ],
  freezeFrame: [],
  liveData: [],
  warnings: ["Character 3 of one DTC was unclear due to glare."],
  perImageNotes: [
    { extractedText: "VIN plate photo", warnings: [] },
    { extractedText: "ECM DTC list screen", warnings: ["Third character of one code obscured by glare."] },
  ],
};

const IMAGES = [
  { buffer: Buffer.from("img0"), filename: "vin-plate.jpg", declaredFormat: "jpg" as const },
  { buffer: Buffer.from("img1"), filename: "ecm-dtcs.jpg", declaredFormat: "jpg" as const },
];

beforeEach(() => {
  const s = st();
  s.queue = [];
  s.calls = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("extractFromImages", () => {
  it("preserves an uncertain DTC character verbatim, never auto-correcting it", async () => {
    st().queue = [completion("stop", BASE_OUTPUT)];
    const { report } = await extractFromImages(IMAGES);
    expect(report.dtcCodes[0].code).toBe("P0?17");
  });

  it("zips per-image evidence positionally against the caller's own filenames/indices, not a model-provided index", async () => {
    st().queue = [completion("stop", BASE_OUTPUT)];
    const { report } = await extractFromImages(IMAGES);

    expect(report.evidence).toHaveLength(2);
    expect(report.evidence?.[0]).toMatchObject({
      sourceType: "image",
      sourceName: "vin-plate.jpg",
      sourceIndex: 0,
      extractedText: "VIN plate photo",
    });
    expect(report.evidence?.[1]).toMatchObject({
      sourceType: "image",
      sourceName: "ecm-dtcs.jpg",
      sourceIndex: 1,
      extractedText: "ECM DTC list screen",
    });
    expect(report.evidence?.[1].warnings).toEqual(["Third character of one code obscured by glare."]);
  });

  it("passes through the model's sourceImageIndex on each DTC", async () => {
    st().queue = [completion("stop", BASE_OUTPUT)];
    const { report } = await extractFromImages(IMAGES);
    expect(report.dtcCodes[0].sourceImageIndex).toBe(1);
  });

  it("marks extraction confidence medium when any warning is present, anywhere", async () => {
    st().queue = [completion("stop", BASE_OUTPUT)];
    const { report } = await extractFromImages(IMAGES);
    expect(report.extractionQuality.confidence).toBe("medium");
  });

  it("marks extraction confidence high only when there are no warnings at all", async () => {
    const clean = {
      ...BASE_OUTPUT,
      warnings: [],
      perImageNotes: [
        { extractedText: "VIN plate photo", warnings: [] },
        { extractedText: "ECM DTC list screen", warnings: [] },
      ],
    };
    st().queue = [completion("stop", clean)];
    const { report } = await extractFromImages(IMAGES);
    expect(report.extractionQuality.confidence).toBe("high");
  });

  it("propagates an unexpected provider error unchanged", async () => {
    st().queue = [new Error("network timeout")];
    const err = await extractFromImages(IMAGES).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("network timeout");
    expect(st().calls).toBe(1);
  });

  it("throws a truncation-specific error when finish_reason is length", async () => {
    st().queue = [completion("length", undefined)];
    await expect(extractFromImages(IMAGES)).rejects.toThrow(/output token limit/i);
  });

  it("throws a refusal-specific error when the model refuses", async () => {
    st().queue = [completion("stop", undefined, "I can't help with that.")];
    await expect(extractFromImages(IMAGES)).rejects.toThrow(/refused/i);
  });

  it("throws a generic structured-output error when parsing otherwise fails", async () => {
    st().queue = [completion("stop", undefined)];
    await expect(extractFromImages(IMAGES)).rejects.toThrow(/schema-conformant/i);
  });
});
