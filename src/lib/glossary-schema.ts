import { z } from "zod";

// Validation for a controlled-glossary entry, shared by the admin server action
// and its unit tests. Inputs are length-limited (defense-in-depth: bounded,
// schema-validated admin input). Optional string fields collapse empty strings
// to undefined so blank form fields store NULL rather than "".
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => s.trim())
    .transform((s) => (s.length === 0 ? undefined : s))
    .optional();

export const glossaryEntrySchema = z.object({
  termEn: z.string().min(1).max(200),
  localeCode: z.string().min(2).max(10),
  translatedTerm: z.string().min(1).max(500),
  acronym: optionalText(50),
  category: optionalText(100),
  manufacturerContext: optionalText(100),
  systemContext: optionalText(100),
  alternativeTranslation: optionalText(500),
  notes: optionalText(2000),
  doNotTranslate: z.boolean(),
  safetyCritical: z.boolean(),
  reviewStatus: z.enum(["draft", "reviewed", "approved"]),
  reviewedBy: optionalText(200),
});

export type GlossaryEntryInput = z.infer<typeof glossaryEntrySchema>;

// A reviewed/approved entry is stamped with the current review time; a draft
// clears it. Kept here (pure) so the action and tests agree.
export function resolveReviewedAt(
  reviewStatus: GlossaryEntryInput["reviewStatus"],
  now: () => Date = () => new Date(),
): string | null {
  return reviewStatus === "reviewed" || reviewStatus === "approved"
    ? now().toISOString()
    : null;
}
