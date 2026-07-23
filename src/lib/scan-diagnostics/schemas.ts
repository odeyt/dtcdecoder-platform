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
