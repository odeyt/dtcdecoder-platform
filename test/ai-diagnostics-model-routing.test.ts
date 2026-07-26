import { describe, expect, it } from "vitest";
import { MODEL_ROUTES, modelForTask, CLAUDE_SONNET_5, CLAUDE_HAIKU_4_5 } from "@/lib/ai-diagnostics/model-routing";
import { MODEL_PRICING } from "@/lib/ai-diagnostics/cost";

describe("modelForTask", () => {
  it("routes the wired tasks exactly as documented", () => {
    expect(modelForTask("chatGeneration")).toBe(CLAUDE_SONNET_5);
    expect(modelForTask("chatTranslation")).toBe(CLAUDE_HAIKU_4_5);
    expect(modelForTask("scanMainAnalysis")).toBe(CLAUDE_SONNET_5);
  });

  it("routes translation-shaped sub-tasks to the economical tier, main-analysis-shaped tasks to the stronger tier", () => {
    expect(modelForTask("chatTranslation")).toBe(CLAUDE_HAIKU_4_5);
    expect(modelForTask("scanReportTranslation")).toBe(CLAUDE_HAIKU_4_5);
    expect(modelForTask("languageDetection")).toBe(CLAUDE_HAIKU_4_5);
    expect(modelForTask("symptomNormalization")).toBe(CLAUDE_HAIKU_4_5);
    expect(modelForTask("dtcClassification")).toBe(CLAUDE_HAIKU_4_5);
    expect(modelForTask("independentSafetyReview")).toBe(CLAUDE_HAIKU_4_5);
    expect(modelForTask("chatGeneration")).toBe(CLAUDE_SONNET_5);
    expect(modelForTask("scanMainAnalysis")).toBe(CLAUDE_SONNET_5);
    expect(modelForTask("complexEscalation")).toBe(CLAUDE_SONNET_5);
  });

  it("every routed model has a corresponding MODEL_PRICING entry — a route can never point at an unpriced model", () => {
    for (const modelId of Object.values(MODEL_ROUTES)) {
      expect(MODEL_PRICING).toHaveProperty(modelId);
    }
  });
});
