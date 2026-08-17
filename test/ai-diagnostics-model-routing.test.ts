import { describe, expect, it } from "vitest";
import { MODEL_ROUTES, modelForTask } from "@/lib/ai-diagnostics/model-routing";

// Models are resolved from OPENAI_PRIMARY_MODEL/OPENAI_TRANSLATION_MODEL at
// module load (see model-routing.ts) rather than hardcoded literals — these
// tests assert the TIER GROUPING (same env var backs the same set of
// tasks), not specific model id strings, since no model id is ever
// hardcoded in this codebase.
describe("modelForTask", () => {
  it("routes the wired tasks to the same tier as documented", () => {
    expect(modelForTask("chatGeneration")).toBe(modelForTask("scanMainAnalysis"));
    expect(modelForTask("chatGeneration")).toBe(modelForTask("scanImageExtraction"));
    expect(modelForTask("chatTranslation")).toBe(modelForTask("scanReportTranslation"));
  });

  it("routes translation-shaped sub-tasks to the economical tier, main-analysis-shaped tasks to the stronger tier", () => {
    const economical = modelForTask("chatTranslation");
    const strong = modelForTask("chatGeneration");

    expect(modelForTask("scanReportTranslation")).toBe(economical);
    expect(modelForTask("languageDetection")).toBe(economical);
    expect(modelForTask("symptomNormalization")).toBe(economical);
    expect(modelForTask("dtcClassification")).toBe(economical);
    expect(modelForTask("independentSafetyReview")).toBe(economical);

    expect(modelForTask("scanMainAnalysis")).toBe(strong);
    expect(modelForTask("complexEscalation")).toBe(strong);
  });

  it("every AiTaskType has a routing entry", () => {
    const tasks: (keyof typeof MODEL_ROUTES)[] = [
      "chatGeneration",
      "chatTranslation",
      "scanMainAnalysis",
      "scanImageExtraction",
      "scanReportTranslation",
      "languageDetection",
      "symptomNormalization",
      "dtcClassification",
      "independentSafetyReview",
      "complexEscalation",
    ];
    for (const task of tasks) {
      expect(MODEL_ROUTES).toHaveProperty(task);
    }
  });
});
