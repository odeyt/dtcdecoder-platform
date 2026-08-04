import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Same mocking pattern as scan-strict-tool-schema.test.ts and
// scan-anthropic-provider-truncation.test.ts: vision-extraction.ts imports
// isStrictSchemaRejection from anthropic-provider.ts, which pulls in
// dtc-grounding/supabase-admin/env transitively even though this file never
// exercises the main diagnosis path.

vi.mock("@/lib/scan-diagnostics/dtc-grounding", () => ({
  findKnownDtcContext: async () => new Map(),
}));
vi.mock("@/lib/env", () => ({ env: { anthropicApiKey: () => "test-key" } }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  }),
}));

// Image normalization has its own dedicated test file
// (scan-image-processing.test.ts) — mocked here so this file can exercise
// the Claude call/mapping logic against arbitrary (non-decodable) buffers.
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

vi.mock("@anthropic-ai/sdk", () => {
  const state: MockState = { queue: [], calls: 0 };
  (globalThis as Record<string, unknown>).__anthropicVisionState = state;

  class FakeAPIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }

  class FakeAnthropic {
    messages = {
      create: async () => {
        state.calls += 1;
        const next = state.queue.shift();
        if (next instanceof Error) throw next;
        if (!next) throw new Error("no queued Anthropic response for this call");
        return next;
      },
    };
    constructor(_opts: unknown) {}
    static APIError = FakeAPIError;
  }
  return { default: FakeAnthropic };
});

const { extractFromImages } = await import("@/lib/scan-diagnostics/ai/vision-extraction");

function st() {
  return (globalThis as Record<string, unknown>).__anthropicVisionState as MockState;
}

async function apiError(status: number, message: string) {
  const A = (await import("@anthropic-ai/sdk")).default as unknown as {
    APIError: new (s: number, m: string) => Error;
  };
  return new A.APIError(status, message);
}

function toolMessage(input: unknown, stopReason = "tool_use") {
  return {
    stop_reason: stopReason,
    usage: { input_tokens: 500, output_tokens: 300 },
    content: [{ type: "tool_use", name: "submit_scan_extraction", input }],
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
});

afterEach(() => vi.restoreAllMocks());

describe("extractFromImages", () => {
  it("preserves an uncertain DTC character verbatim, never auto-correcting it", async () => {
    st().queue = [toolMessage(BASE_OUTPUT)];
    const { report } = await extractFromImages(IMAGES);
    expect(report.dtcCodes[0].code).toBe("P0?17");
  });

  it("zips per-image evidence positionally against the caller's own filenames/indices, not a model-provided index", async () => {
    st().queue = [toolMessage(BASE_OUTPUT)];
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
    st().queue = [toolMessage(BASE_OUTPUT)];
    const { report } = await extractFromImages(IMAGES);
    expect(report.dtcCodes[0].sourceImageIndex).toBe(1);
  });

  it("marks extraction confidence medium when any warning is present, anywhere", async () => {
    st().queue = [toolMessage(BASE_OUTPUT)];
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
    st().queue = [toolMessage(clean)];
    const { report } = await extractFromImages(IMAGES);
    expect(report.extractionQuality.confidence).toBe("high");
  });

  it("falls back to the non-strict tool when the API rejects the strict schema", async () => {
    st().queue = [
      await apiError(400, "tools.0.strict: schema is not eligible for strict mode"),
      toolMessage(BASE_OUTPUT),
    ];

    const { report } = await extractFromImages(IMAGES);

    expect(st().calls).toBe(2);
    expect(report.vin).toBe("1FTFW1ET1EFA00001");
  });

  it("does not swallow an unrelated 400", async () => {
    st().queue = [await apiError(400, "messages.0: content must be non-empty")];
    const err = await extractFromImages(IMAGES).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("content must be non-empty");
    expect(st().calls).toBe(1);
  });

  it("throws a truncation-specific error when stop_reason is max_tokens", async () => {
    st().queue = [toolMessage(BASE_OUTPUT, "max_tokens")];
    await expect(extractFromImages(IMAGES)).rejects.toThrow(/output token limit/i);
  });

  it("throws when no tool_use block is returned", async () => {
    st().queue = [
      { stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: "text", text: "I can't help with that." }] },
    ];
    await expect(extractFromImages(IMAGES)).rejects.toThrow(/structured tool call/i);
  });

  it("throws when the tool input fails schema validation", async () => {
    st().queue = [toolMessage({ vin: "only a vin, nothing else" })];
    await expect(extractFromImages(IMAGES)).rejects.toThrow(/invalid structured output/i);
  });
});
