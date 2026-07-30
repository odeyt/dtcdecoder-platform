// Zod schemas for every request payload and AI-provider structured output
// in the scan diagnostics workflow. AI responses are always safeParse'd
// against DiagnosticAiOutputSchema (added in slice 9) — a failed parse is
// treated as a provider failure, never passed through as free text.
import { z } from "zod";

export const CaseInfoInputSchema = z.object({
  complaint: z.string().trim().max(4000).optional(),
  symptoms: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  mileage: z.number().int().min(0).max(1_000_000).optional(),
  recentRepairs: z.string().trim().max(4000).optional(),
  batteryCondition: z.string().trim().max(500).optional(),
  technicianNotes: z.string().trim().max(4000).optional(),
});

export type CaseInfoInput = z.infer<typeof CaseInfoInputSchema>;

const DtcCodeInputSchema = z.object({
  module: z.string().trim().max(100).optional(),
  code: z.string().trim().min(1).max(20),
  status: z.string().trim().max(50).optional(),
  descriptionRaw: z.string().trim().max(500).optional(),
});

const DtcCodeEditSchema = DtcCodeInputSchema.partial().extend({
  id: z.string().uuid(),
});

// "Run Full AI Diagnosis" entry point reachable from DTC search results —
// a paid user requests an AI report from a DTC code + typed details, with
// no scan-report file uploaded at all. See createQuickDiagnosticCase
// (cases.ts) and migration 0025 (scan_extractions.file_id made nullable
// to support this case type).
export const QuickDiagnosticCaseInputSchema = z.object({
  dtcCode: z.string().trim().min(1).max(20),
  vin: z.string().trim().max(17).optional(),
  make: z.string().trim().max(100).optional(),
  model: z.string().trim().max(100).optional(),
  modelYear: z.number().int().min(1950).max(2100).optional(),
  engine: z.string().trim().max(200).optional(),
  module: z.string().trim().max(100).optional(),
  symptoms: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  freezeFrameNotes: z.string().trim().max(2000).optional(),
  repairHistory: z.string().trim().max(4000).optional(),
  scanToolNotes: z.string().trim().max(4000).optional(),
  reportLanguage: z.string().trim().max(10).optional(),
});

export type QuickDiagnosticCaseInput = z.infer<typeof QuickDiagnosticCaseInputSchema>;

export const ExtractionReviewInputSchema = z.object({
  vin: z.string().trim().max(17).optional(),
  make: z.string().trim().max(100).optional(),
  model: z.string().trim().max(100).optional(),
  modelYear: z.number().int().min(1950).max(2100).optional(),
  engine: z.string().trim().max(200).optional(),
  odometerMiles: z.number().int().min(0).max(1_000_000).optional(),
  addDtcs: z.array(DtcCodeInputSchema).max(100).optional(),
  editDtcs: z.array(DtcCodeEditSchema).max(100).optional(),
  removeDtcIds: z.array(z.string().uuid()).max(100).optional(),
  confirm: z.boolean().optional(),
});

export type ExtractionReviewInput = z.infer<typeof ExtractionReviewInputSchema>;

// --- AI diagnostic reasoning ---------------------------------------------
// The canonical, bounded payload sent to the AI provider — never the raw
// uploaded file. Built server-side from persisted extraction + review data
// (see the analyze route), not parsed directly from client input, but
// still validated through this schema before ever leaving the process.

const CanonicalDtcSchema = z.object({
  module: z.string().nullable().optional(),
  code: z.string(),
  status: z.string().nullable().optional(),
  descriptionRaw: z.string().nullable().optional(),
  knownMeaning: z.string().nullable().optional(),
  knownSeverity: z.string().nullable().optional(),
});

// --- Full-scan structured context (system/pattern/priority summary) ------
// Added alongside the existing flat `dtcs` list (kept unchanged/unlimited)
// so the AI receives compact, pre-digested structure for a multi-system
// report instead of only a bare code list — see
// docs/SCAN_PATTERN_AND_PRIORITY_ENGINE.md. Deterministic facts only;
// never populated from an AI response.

export const ScanSystemSummarySchema = z.object({
  systemName: z.string(),
  moduleName: z.string().nullable().optional(),
  status: z.enum(["faulted", "ok", "unknown"]),
  dtcCountReported: z.number().nullable().optional(),
  dtcCountExtracted: z.number(),
  extractionComplete: z.boolean(),
});
export type ScanSystemSummary = z.infer<typeof ScanSystemSummarySchema>;

export const DetectedPatternSchema = z.object({
  patternType: z.string(),
  severity: z.enum(["info", "warn", "critical"]),
  name: z.string(),
  evidence: z.record(z.string(), z.unknown()),
  affectedModules: z.array(z.string()),
});
export type DetectedPatternSummary = z.infer<typeof DetectedPatternSchema>;

export const DiagnosticPrioritySummarySchema = z.object({
  fixFirstCodes: z.array(z.string()),
  diagnoseNextCodes: z.array(z.string()),
  monitorRecheckCodes: z.array(z.string()),
  historicalReferenceCodes: z.array(z.string()),
});
export type DiagnosticPrioritySummary = z.infer<typeof DiagnosticPrioritySummarySchema>;

export const ExtractionQualitySummarySchema = z.object({
  pagesExpected: z.number().nullable().optional(),
  pagesParsed: z.number().nullable().optional(),
  systemsExpected: z.number().nullable().optional(),
  systemsParsed: z.number().nullable().optional(),
  dtcsExpected: z.number().nullable().optional(),
  dtcsParsed: z.number().nullable().optional(),
  truncated: z.boolean(),
  confidence: z.enum(["high", "medium", "low"]),
});
export type ExtractionQualitySummary = z.infer<typeof ExtractionQualitySummarySchema>;

export const CanonicalDiagnosticInputSchema = z.object({
  caseId: z.string(),
  vehicle: z.object({
    vin: z.string().nullable().optional(),
    year: z.number().nullable().optional(),
    make: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    engine: z.string().nullable().optional(),
    mileage: z.number().nullable().optional(),
  }),
  complaint: z.string().nullable().optional(),
  symptoms: z.array(z.string()),
  recentRepairs: z.string().nullable().optional(),
  batteryCondition: z.string().nullable().optional(),
  technicianNotes: z.string().nullable().optional(),
  modules: z.array(z.object({ name: z.string(), status: z.string().optional() })),
  dtcs: z.array(CanonicalDtcSchema),
  // Present only when the total DTC count required trimming the per-code
  // prompt listing (see buildUserPrompt's size safeguard) — the count and
  // which codes were left out of the line-by-line listing (never a
  // current/safety/network/battery/bus-off one; those are always kept).
  omittedFromPrompt: z.object({ count: z.number(), codes: z.array(z.string()) }).nullable().optional(),
  systems: z.array(ScanSystemSummarySchema).default([]),
  patterns: z.array(DetectedPatternSchema).default([]),
  priority: DiagnosticPrioritySummarySchema.nullable().optional(),
  scanExtractionQuality: ExtractionQualitySummarySchema.nullable().optional(),
  freezeFrame: z.array(z.record(z.string(), z.unknown())),
  liveData: z.array(z.record(z.string(), z.unknown())),
  imageOnlyPdf: z.boolean(),
  extractionWarnings: z.array(z.string()),
  // Populated below (DtcCategoryClassificationSchema is defined after this
  // point since it doesn't depend on anything above it structurally, but is
  // referenced here via z.lazy to avoid reordering the whole file).
  dtcCategoryClassification: z.lazy(() => DtcCategoryClassificationSchema),
});

export type CanonicalDiagnosticInput = z.infer<typeof CanonicalDiagnosticInputSchema>;

// --- Diagnostic Safety v2 -------------------------------------------------
// Categorical confidence only. A DTC or a scan report is evidence, never
// proof — so the AI is never asked for (and this schema never accepts) an
// invented numerical probability or confidence percentage. See
// docs/DIAGNOSTIC_SCHEMA_V2.md and docs/DIAGNOSTIC_SAFETY_RULES.md.
export const ConfidenceLevelSchema = z.enum(["high", "medium", "low", "insufficient_evidence"]);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

const RankedCauseSchema = z.object({
  cause: z.string(),
  confidenceLevel: ConfidenceLevelSchema,
  rationale: z.string(),
  supportingEvidence: z.array(z.string()),
  contradictingEvidence: z.array(z.string()),
  confirmationTestsRequired: z.array(z.string()),
});

const RecommendedTestSchema = z.object({
  step: z.string(),
  purpose: z.string(),
  expectedResult: z.string(),
});

// Every AI response is safeParse'd against this schema (see
// AnthropicDiagnosticProvider) — a failed parse is treated as a provider
// failure, never passed through as free text. This is the v2 (schema_version
// "2.0") shape; existing schema_version "1.0" rows in scan_reports/
// scan_ai_runs predate this and are read as opaque JSON for display only —
// they are never re-validated against this schema (see the legacy-render
// handling in ScanReportView.tsx).
export const DiagnosticAiOutputSchema = z.object({
  summary: z.string(),
  rankedCauses: z.array(RankedCauseSchema).min(1),
  recommendedTests: z.array(RecommendedTestSchema),
  safetyWarnings: z.array(z.string()),
  missingInformation: z.array(z.string()),
});

export type DiagnosticAiOutput = z.infer<typeof DiagnosticAiOutputSchema>;
export type RankedCause = z.infer<typeof RankedCauseSchema>;
export type RecommendedTest = z.infer<typeof RecommendedTestSchema>;

// --- DTC category classification ------------------------------------------
// "found" and "not_stated" are the only values this app's parsers can
// currently produce honestly — none of them attempt to detect an explicit
// textual "no pending codes" statement in a scan report, so claiming
// "none_reported" would itself be an unsupported inference. "none_reported"
// is accepted here (forward-compatible) for a future parser that adds real
// none-detection, but is never emitted today — see
// src/lib/scan-diagnostics/parsers/category-classification.ts.
export const DtcCategoryStatusSchema = z.enum(["found", "none_reported", "not_stated"]);
export type DtcCategoryStatus = z.infer<typeof DtcCategoryStatusSchema>;

export const DtcCategorySchema = z.object({
  status: DtcCategoryStatusSchema,
  codes: z.array(z.string()),
});
export type DtcCategory = z.infer<typeof DtcCategorySchema>;

export const DtcCategoryClassificationSchema = z.object({
  pendingCodes: DtcCategorySchema,
  permanentCodes: DtcCategorySchema,
  networkFaults: DtcCategorySchema,
  lostCommunicationFaults: DtcCategorySchema,
  batteryRelatedFaults: DtcCategorySchema,
});
export type DtcCategoryClassification = z.infer<typeof DtcCategoryClassificationSchema>;

// --- Technician repair-confirmation feedback ------------------------------

export const FeedbackInputSchema = z.object({
  diagnosisWasCorrect: z.boolean().optional(),
  actualRootCause: z.string().trim().max(1000).optional(),
  confirmedFix: z.string().trim().max(1000).optional(),
  partsReplaced: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  notes: z.string().trim().max(4000).optional(),
});

export type FeedbackInput = z.infer<typeof FeedbackInputSchema>;

// --- Diagnostic Workbench interactive state (migration 0042) -------------

export const ScanCaseNoteCategorySchema = z.enum(["observation", "measurement", "repair_performed", "follow_up"]);

export const CreateNoteInputSchema = z.object({
  category: ScanCaseNoteCategorySchema,
  body: z.string().trim().min(1).max(4000),
  pinned: z.boolean().optional(),
});
export type CreateNoteInput = z.infer<typeof CreateNoteInputSchema>;

export const UpdateNoteInputSchema = z.object({
  category: ScanCaseNoteCategorySchema.optional(),
  body: z.string().trim().min(1).max(4000).optional(),
  pinned: z.boolean().optional(),
});
export type UpdateNoteInput = z.infer<typeof UpdateNoteInputSchema>;

export const ScanTestOutcomeSchema = z.enum(["pass", "fail", "not_tested"]);

export const TestProgressInputSchema = z.object({
  completed: z.boolean().optional(),
  outcome: ScanTestOutcomeSchema.optional(),
  actualResult: z.string().trim().max(2000).optional(),
  technicianNote: z.string().trim().max(2000).optional(),
});
export type TestProgressInput = z.infer<typeof TestProgressInputSchema>;

export const ScanCauseStatusSchema = z.enum(["untested", "supported", "ruled_out", "confirmed"]);

export const CauseStatusInputSchema = z.object({
  status: ScanCauseStatusSchema.optional(),
  reviewed: z.boolean().optional(),
});
export type CauseStatusInput = z.infer<typeof CauseStatusInputSchema>;

export const VerificationInputSchema = z.object({
  concernResolved: z.boolean().optional(),
  dtcsCleared: z.boolean().optional(),
  dtcsDidNotReturn: z.boolean().optional(),
  calibrationCompleted: z.boolean().optional(),
  roadTestCompleted: z.boolean().optional(),
  noNewWarningLights: z.boolean().optional(),
  postRepairScanReviewed: z.boolean().optional(),
  customerNotesRecorded: z.boolean().optional(),
});
export type VerificationInput = z.infer<typeof VerificationInputSchema>;
