// Deterministic public diagnostic intake engine
// (docs/LANDING_DIAGNOSTIC_INTAKE.md). Pure rule-based conversation state
// machine over LandingDiagnosticIntake — NEVER calls a paid AI provider.
// Reuses the exact same local DTC lookup (searchDtcCodes) and free-tier
// rate-limit ledger (basic-search/usage.ts) the existing /dtc page already
// uses, so a visitor can't get a second, uncounted allowance by going
// through this endpoint instead.
import "server-only";
import { isValidDtcCodeFormat, deriveDtcCodeStructure } from "@/lib/dtc-category";
import { resolveDtcLookup } from "@/lib/dtc-lookup";
import {
  hasBasicSearchAllowanceRemaining,
  recordBasicSearchUsage,
  type BasicSearchIdentity,
} from "@/lib/basic-search/usage";
import { recordEvent } from "@/lib/analytics/events";
import type { SubscriptionPlan } from "@/lib/types";
import type { LandingDiagnosticIntake, PublicIntakeResponse } from "@/lib/landing-intake/types";

const DTC_CODE_PATTERN = /\b([PBCU][0-9A-Z]{3,4})\b/i;
const YEAR_PATTERN = /\b(19[5-9]\d|20[0-4]\d)\b/;
const STATUS_KEYWORDS: Array<{ pattern: RegExp; value: LandingDiagnosticIntake["currentCodeStatus"] }> = [
  { pattern: /\bhistor(y|ical)\b/i, value: "history" },
  { pattern: /\bpending\b/i, value: "pending" },
  { pattern: /\bpermanent\b/i, value: "permanent" },
  { pattern: /\bcurrent\b|\bactive\b|\bright now\b/i, value: "current" },
];

function extractDtcCode(text: string): string | null {
  const match = text.match(DTC_CODE_PATTERN);
  return match ? match[1].toUpperCase() : null;
}

// Deliberately heuristic (word-splitting, not a vehicle-data lookup) — this
// is a free-text intake question, not a VIN decode. Never presented as
// verified; downstream display always treats it as customer-entered detail.
function parseVehicleLine(text: string): { year?: string; make?: string; model?: string } {
  const year = text.match(YEAR_PATTERN)?.[1];
  const withoutYear = text.replace(YEAR_PATTERN, "").trim();
  const words = withoutYear.split(/\s+/).filter(Boolean);
  const make = words[0];
  const model = words.slice(1).join(" ") || undefined;
  return { year, make, model: model && model.length > 0 ? model : undefined };
}

function parseStatus(text: string): LandingDiagnosticIntake["currentCodeStatus"] {
  for (const { pattern, value } of STATUS_KEYWORDS) {
    if (pattern.test(text)) return value;
  }
  return "unknown";
}

async function buildBasicResult(
  code: string,
  identity: BasicSearchIdentity,
  plan: SubscriptionPlan,
): Promise<{ response: PublicIntakeResponse; recordedSearch: boolean }> {
  const structure = deriveDtcCodeStructure(code);
  const category = structure.category ?? "Unknown";

  const allowed = await hasBasicSearchAllowanceRemaining(identity, plan);
  if (!allowed) {
    return {
      recordedSearch: false,
      response: {
        status: "upgrade_required",
        message: "You have reached the free Quick Code Lookup limit. Upgrade to continue with DTC Technician and Guided Diagnosis.",
        preservedIntake: { dtcCodes: [code], locale: "en", currentStep: "complete" },
        actions: [{ key: "upgrade", label: "View plans" }],
      },
    };
  }

  // Database-first, deterministic — never fabricates a definition. This is
  // what distinguishes a manufacturer-specific code with no matching row
  // (e.g. U1003) from a generic code that's genuinely missing from the
  // reference database; the old code collapsed both into one message.
  const lookup = await resolveDtcLookup(code);
  const exact = lookup.definition;

  const basicResult = exact
    ? {
        dtcCode: code,
        definition: exact.meaning,
        category,
        genericSymptoms: exact.symptoms.slice(0, 5),
        genericCauses: exact.causes.slice(0, 5),
        basicChecks: exact.diagnostic_steps.slice(0, 3),
        safetyWarnings: exact.severity === "critical" || exact.severity === "high" ? [
          "This code can indicate a safety-relevant condition. Have it checked by a qualified technician before extended driving.",
        ] : [],
        manufacturerSpecificUncertainty: exact.make
          ? undefined
          : "This is the generic (non-manufacturer-specific) definition — your vehicle's actual meaning may differ. Confirm against your vehicle's own service data.",
        resolutionType: lookup.resolutionType,
        availableManufacturers: lookup.availableManufacturers,
        relatedCodes: lookup.relatedCodes.map((r) => r.code),
      }
    : lookup.resolutionType === "vehicle_context_required"
      ? {
          dtcCode: code,
          definition: "",
          category,
          genericSymptoms: [],
          genericCauses: [],
          basicChecks: [],
          safetyWarnings: [],
          resolutionType: "vehicle_context_required" as const,
          availableManufacturers: lookup.availableManufacturers,
          relatedCodes: [],
        }
      : {
          dtcCode: code,
          definition: "",
          category,
          genericSymptoms: [],
          genericCauses: [],
          basicChecks: [],
          safetyWarnings: [],
          resolutionType: "unknown" as const,
          availableManufacturers: [],
          relatedCodes: lookup.relatedCodes.map((r) => r.code),
        };

  return {
    recordedSearch: true,
    response: {
      status: "basic_result",
      message: `Here's what we know about ${code}.`,
      basicResult,
      preservedIntake: { dtcCodes: [code], locale: "en", currentStep: "complete" },
      actions: [
        { key: "unlock", label: "Unlock DTC Technician™" },
        { key: "import_scan", label: "Import Vehicle Scan" },
      ],
    },
  };
}

export async function processPublicIntake(params: {
  message: string;
  intake: LandingDiagnosticIntake;
  identity: BasicSearchIdentity;
  plan: SubscriptionPlan;
}): Promise<PublicIntakeResponse> {
  const { message, identity, plan } = params;
  const intake = { ...params.intake };
  const step = intake.currentStep || "issue";

  // Once a basic result has already been delivered, any further message
  // means the visitor wants to go beyond generic, code-only guidance —
  // which this deterministic, no-paid-provider endpoint cannot do. Hand off
  // to authentication rather than fabricate a deeper answer.
  if (step === "complete") {
    return {
      status: "sign_in_required",
      message: "Sign in to continue with a full, vehicle-specific Diagnostic Consultation.",
      preservedIntake: intake,
      actions: [{ key: "sign_in", label: "Sign In" }],
    };
  }

  if (step === "issue" || step === "issue_retry") {
    const code = extractDtcCode(message);
    if (code && isValidDtcCodeFormat(code)) {
      intake.dtcCodes = [code];
      intake.currentStep = "vehicle";
      recordEvent("public_intake_question_submitted", { userId: identity.type === "user" ? identity.id : null }).catch(() => {});
      return {
        status: "needs_more_information",
        message: "What is the vehicle's year, make, and model?",
        nextQuestion: { field: "vehicle", responseType: "text" },
        preservedIntake: intake,
        actions: [],
      };
    }

    if (step === "issue_retry") {
      // Two rounds with no identifiable code — provide value now rather
      // than continuing to interrogate (spec: "do not force every field
      // before providing basic value").
      intake.complaint = [intake.complaint, message].filter(Boolean).join(" ");
      intake.currentStep = "complete";
      return {
        status: "basic_result",
        message: "We couldn't identify a specific diagnostic code from that description.",
        basicResult: {
          dtcCode: "UNKNOWN",
          definition: "No specific DTC identified yet.",
          category: "Unknown",
          genericSymptoms: [],
          genericCauses: [],
          basicChecks: [
            "Retrieve the exact DTC with a scan tool — most parts stores will read codes for free.",
            "Note whether the issue is constant, intermittent, or tied to a specific condition (cold start, load, speed).",
          ],
          safetyWarnings: [],
          manufacturerSpecificUncertainty: "A specific code will let us give you a real definition instead of general guidance.",
          resolutionType: "unknown",
          availableManufacturers: [],
          relatedCodes: [],
        },
        preservedIntake: intake,
        actions: [{ key: "import_scan", label: "Import Vehicle Scan" }],
      };
    }

    intake.complaint = message;
    intake.currentStep = "issue_retry";
    return {
      status: "needs_more_information",
      message: "Do you have a specific DTC code (e.g. P0303)? If not, just describe more about when it happens.",
      nextQuestion: { field: "dtcCode", responseType: "text" },
      preservedIntake: intake,
      actions: [],
    };
  }

  if (step === "vehicle") {
    const { year, make, model } = parseVehicleLine(message);
    intake.year = year ?? intake.year;
    intake.make = make ?? intake.make;
    intake.model = model ?? intake.model;
    intake.currentStep = "status";
    return {
      status: "needs_more_information",
      message: "Is this code currently active, or from history?",
      nextQuestion: { field: "currentCodeStatus", responseType: "choice", choices: ["current", "history", "pending", "permanent", "unknown"] },
      preservedIntake: intake,
      actions: [],
    };
  }

  if (step === "status") {
    intake.currentCodeStatus = parseStatus(message);
    intake.currentStep = "complaint";
    return {
      status: "needs_more_information",
      message: "What's the main complaint or symptom you're noticing?",
      nextQuestion: { field: "complaint", responseType: "text" },
      preservedIntake: intake,
      actions: [],
    };
  }

  // step === "complaint" (final deterministic question before a result)
  intake.complaint = message;
  const code = intake.dtcCodes[0];
  if (!code) {
    intake.currentStep = "complete";
    return {
      status: "basic_result",
      message: "Here's what we can tell you without a specific code.",
      basicResult: {
        dtcCode: "UNKNOWN",
        definition: "No specific DTC identified yet.",
        category: "Unknown",
        genericSymptoms: [],
        genericCauses: [],
        basicChecks: ["Retrieve the exact DTC with a scan tool to get a specific definition."],
        safetyWarnings: [],
        resolutionType: "unknown",
        availableManufacturers: [],
        relatedCodes: [],
      },
      preservedIntake: intake,
      actions: [{ key: "import_scan", label: "Import Vehicle Scan" }],
    };
  }

  const { response, recordedSearch } = await buildBasicResult(code, identity, plan);
  response.preservedIntake = { ...intake, currentStep: response.status === "basic_result" ? "complete" : intake.currentStep };
  if (recordedSearch) {
    await recordBasicSearchUsage(identity, plan).catch((err) => console.error("[landing-intake] failed to record usage", err));
    await recordEvent("basic_dtc_search", { userId: identity.type === "user" ? identity.id : null, metadata: { source: "landing_intake" } });
  }
  return response;
}
