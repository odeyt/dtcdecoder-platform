// Shared zod schema for LandingDiagnosticIntake, validated identically by
// both the public intake API (Slice 3) and the authenticated
// create-from-intake handoff (Slice 4) — one validation source for
// anything a browser can send us shaped like an intake.
import { z } from "zod";

export const IntakeSchema = z.object({
  year: z.string().trim().max(4).optional(),
  make: z.string().trim().max(60).optional(),
  model: z.string().trim().max(60).optional(),
  engine: z.string().trim().max(60).optional(),
  vin: z.string().trim().max(17).optional(),
  dtcCodes: z.array(z.string().trim().max(10)).max(10).default([]),
  symptoms: z.string().trim().max(2000).optional(),
  complaint: z.string().trim().max(2000).optional(),
  currentCodeStatus: z.enum(["current", "history", "pending", "permanent", "unknown"]).optional(),
  scanUploadRequested: z.boolean().optional(),
  locale: z.string().trim().max(10).default("en"),
  currentStep: z.string().trim().max(30).default("issue"),
});
