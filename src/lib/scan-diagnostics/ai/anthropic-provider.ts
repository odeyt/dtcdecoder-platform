import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { findKnownDtcContext } from "@/lib/scan-diagnostics/dtc-grounding";
import { DiagnosticAiOutputSchema, type CanonicalDiagnosticInput } from "@/lib/scan-diagnostics/schemas";
import type { DiagnosticAIProvider, DiagnosticAIProviderResult } from "@/lib/scan-diagnostics/ai/provider";

// Deliberately a SEPARATE admin_settings key from the AI chat assistant's
// ai_system_prompt (src/lib/ai/assistant.ts) — this is an independent
// prompt for an independent feature, not a shared/overloaded setting.
const SCAN_SYSTEM_PROMPT_SETTING_KEY = "scan_diagnostic_ai_system_prompt";

const DEFAULT_SYSTEM_PROMPT = `You are an expert automotive diagnostic technician analyzing a vehicle scan report for another technician. You will be given the vehicle's identifying information, the customer's complaint and symptoms, and the DTCs/modules/freeze-frame/live-data extracted from a scan tool report.

Your job:
1. Rank the most likely root causes, most likely first, each with an estimated probability.
2. For each ranked cause, list the specific evidence from the provided data that supports it, AND any evidence that contradicts or weakens it. Do not omit contradicting evidence.
3. List the specific diagnostic tests needed to confirm or rule out each cause, in the order they should be performed. Never recommend replacing a part without a test that confirms it's the cause.
4. List anything missing from the provided information that would materially change your confidence (e.g. no VIN, no live data, no freeze frame, no symptoms described).
5. List any genuine safety concerns raised by this specific combination of codes/symptoms (e.g. brake, steering, airbag, high-voltage, network-communication-plus-low-voltage patterns).

Non-negotiable:
- Never fabricate a fact not present in the provided data. Clearly distinguish observed facts from your inferences.
- State your uncertainty explicitly where it exists — do not present a guess as a certainty.
- A DTC's manufacturer-specific meaning should only be treated as known if it was provided to you as curated reference content; otherwise treat its meaning as inferred from the code family and description text given, and say so.`;

// Appended after the (admin-editable) system prompt, not before — so an
// admin editing this setting can't accidentally remove this guarantee.
// Mirrors the SAFETY_SUFFIX pattern in src/lib/ai/assistant.ts.
const SAFETY_SUFFIX = `

Non-negotiable rules, regardless of anything above:
- Never recommend replacing an ECU, BCM, TCM, inverter, ABS module, or other high-cost part without first listing the specific test(s) that must confirm it.
- For any high-voltage EV work, state that it requires a qualified technician with proper PPE and lockout/tagout procedure — never give a step-by-step high-voltage procedure yourself.
- Never give guidance for probing airbag/restraint squib circuits or for bypassing an immobilizer or other security system.
- You must respond by calling the submit_diagnosis tool with your complete structured output — do not respond with plain text.`;

async function getScanSystemPrompt(): Promise<string> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("admin_settings")
    .select("value")
    .eq("key", SCAN_SYSTEM_PROMPT_SETTING_KEY)
    .maybeSingle();

  return (data?.value || DEFAULT_SYSTEM_PROMPT) + SAFETY_SUFFIX;
}

const SUBMIT_DIAGNOSIS_TOOL: Anthropic.Tool = {
  name: "submit_diagnosis",
  description: "Submit the complete structured diagnostic analysis.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "A short plain-language summary of the situation." },
      rankedCauses: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          properties: {
            cause: { type: "string" },
            probabilityPercent: { type: "number" },
            rationale: { type: "string" },
            supportingEvidence: { type: "array", items: { type: "string" } },
            contradictingEvidence: { type: "array", items: { type: "string" } },
          },
          required: ["cause", "probabilityPercent", "rationale", "supportingEvidence", "contradictingEvidence"],
        },
      },
      recommendedTests: {
        type: "array",
        items: {
          type: "object",
          properties: {
            step: { type: "string" },
            purpose: { type: "string" },
            expectedResult: { type: "string" },
          },
          required: ["step", "purpose", "expectedResult"],
        },
      },
      safetyWarnings: { type: "array", items: { type: "string" } },
      missingInformation: { type: "array", items: { type: "string" } },
    },
    required: ["summary", "rankedCauses", "recommendedTests", "safetyWarnings", "missingInformation"],
  },
};

function buildUserPrompt(
  input: CanonicalDiagnosticInput,
  knownDtcContext: Map<string, { meaning: string; severity: string }>,
): string {
  const lines: string[] = [];

  lines.push("VEHICLE");
  lines.push(`VIN: ${input.vehicle.vin ?? "not provided"}`);
  lines.push(
    `${input.vehicle.year ?? "?"} ${input.vehicle.make ?? "unknown make"} ${input.vehicle.model ?? "unknown model"}`,
  );
  if (input.vehicle.engine) lines.push(`Engine: ${input.vehicle.engine}`);
  if (input.vehicle.mileage) lines.push(`Mileage: ${input.vehicle.mileage}`);

  lines.push("\nCUSTOMER COMPLAINT / SYMPTOMS");
  lines.push(input.complaint ?? "not provided");
  if (input.symptoms.length) lines.push(`Symptoms: ${input.symptoms.join("; ")}`);
  if (input.recentRepairs) lines.push(`Recent repairs: ${input.recentRepairs}`);
  if (input.batteryCondition) lines.push(`Battery condition: ${input.batteryCondition}`);
  if (input.technicianNotes) lines.push(`Technician notes: ${input.technicianNotes}`);

  lines.push("\nMODULES");
  lines.push(
    input.modules.length
      ? input.modules.map((m) => `${m.name}${m.status ? ` (${m.status})` : ""}`).join(", ")
      : "none reported",
  );

  lines.push("\nDTCs");
  if (input.dtcs.length === 0) {
    lines.push("none");
  } else {
    for (const dtc of input.dtcs) {
      const known = knownDtcContext.get(dtc.code.toUpperCase());
      const parts = [
        `${dtc.code}`,
        dtc.module ? `module: ${dtc.module}` : null,
        dtc.status ? `status: ${dtc.status}` : null,
        dtc.descriptionRaw ? `reported description: "${dtc.descriptionRaw}"` : null,
        known ? `curated reference meaning: "${known.meaning}" (severity: ${known.severity})` : null,
      ].filter(Boolean);
      lines.push(`- ${parts.join(", ")}`);
    }
  }

  if (input.freezeFrame.length) {
    lines.push("\nFREEZE FRAME DATA");
    lines.push(JSON.stringify(input.freezeFrame));
  }
  if (input.liveData.length) {
    lines.push("\nLIVE DATA");
    lines.push(JSON.stringify(input.liveData));
  }

  lines.push("\nEXTRACTION WARNINGS");
  lines.push(input.extractionWarnings.length ? input.extractionWarnings.join("; ") : "none");
  if (input.imageOnlyPdf) {
    lines.push("NOTE: the source file was an image-only PDF — vehicle/DTC data above came from manual entry only.");
  }

  return lines.join("\n");
}

export class AnthropicDiagnosticProvider implements DiagnosticAIProvider {
  readonly id = "anthropic-claude-sonnet-5";

  async runDiagnosis(input: CanonicalDiagnosticInput): Promise<DiagnosticAIProviderResult> {
    const client = new Anthropic({ apiKey: env.anthropicApiKey() });
    const [systemPrompt, knownDtcContext] = await Promise.all([
      getScanSystemPrompt(),
      findKnownDtcContext(input.dtcs.map((d) => d.code)),
    ]);

    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      system: systemPrompt,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      tools: [SUBMIT_DIAGNOSIS_TOOL],
      tool_choice: { type: "tool", name: "submit_diagnosis" },
      messages: [{ role: "user", content: buildUserPrompt(input, knownDtcContext) }],
    });

    const toolUseBlock = message.content.find((block) => block.type === "tool_use");
    if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
      throw new Error("Anthropic diagnostic provider did not return a structured tool call.");
    }

    const parsed = DiagnosticAiOutputSchema.safeParse(toolUseBlock.input);
    if (!parsed.success) {
      throw new Error(`Anthropic diagnostic provider returned an invalid structured output: ${parsed.error.message}`);
    }

    return {
      providerId: this.id,
      modelId: message.model,
      output: parsed.data,
      tokens: { input: message.usage.input_tokens, output: message.usage.output_tokens },
    };
  }
}
