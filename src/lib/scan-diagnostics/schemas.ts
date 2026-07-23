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
