"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { updateLanguage, hasCollidingMake, type LanguageUpdateInput } from "@/lib/admin-languages";

const languageUpdateSchema = z.object({
  enabled: z.boolean(),
  publicAvailable: z.boolean(),
  paidOnly: z.boolean(),
  supportTier: z.number().int().min(1).max(4),
  aiInputEnabled: z.boolean(),
  aiOutputEnabled: z.boolean(),
  bilingualEnabled: z.boolean(),
  multilingualEnabled: z.boolean(),
  safetyReviewStatus: z.enum(["not_reviewed", "in_review", "approved", "rejected"]),
  glossaryCompletionPercent: z.number().int().min(0).max(100),
  uiTranslationCompletionPercent: z.number().int().min(0).max(100),
  seoEnabled: z.boolean(),
  displayOrder: z.number().int(),
});

function checked(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

export async function updateLanguageAction(
  localeCode: string,
  formData: FormData,
): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = languageUpdateSchema.safeParse({
    enabled: checked(formData, "enabled"),
    publicAvailable: checked(formData, "publicAvailable"),
    paidOnly: checked(formData, "paidOnly"),
    supportTier: Number(formData.get("supportTier")),
    aiInputEnabled: checked(formData, "aiInputEnabled"),
    aiOutputEnabled: checked(formData, "aiOutputEnabled"),
    bilingualEnabled: checked(formData, "bilingualEnabled"),
    multilingualEnabled: checked(formData, "multilingualEnabled"),
    safetyReviewStatus: String(formData.get("safetyReviewStatus")),
    glossaryCompletionPercent: Number(formData.get("glossaryCompletionPercent")),
    uiTranslationCompletionPercent: Number(formData.get("uiTranslationCompletionPercent")),
    seoEnabled: checked(formData, "seoEnabled"),
    displayOrder: Number(formData.get("displayOrder")),
  });

  if (!parsed.success) {
    return { error: "Invalid input." };
  }
  // The schema already constrains supportTier to an integer in [1,4] —
  // narrowing here is just satisfying the literal-union type, not skipping
  // validation.
  const input: LanguageUpdateInput = {
    ...parsed.data,
    supportTier: parsed.data.supportTier as 1 | 2 | 3 | 4,
  };

  // Enabling a language equal to an existing dtc_codes.make would silently
  // 404 that make's pages the moment the proxy starts treating the segment
  // as a locale prefix — block rather than let it happen invisibly.
  if (input.enabled && (await hasCollidingMake(localeCode))) {
    return {
      error: `Cannot enable "${localeCode}" — an existing DTC code uses "${localeCode}" as its make value, which would collide with the locale prefix.`,
    };
  }

  await updateLanguage(localeCode, input);
  revalidatePath("/admin/languages");
  revalidatePath(`/admin/languages/${localeCode}/edit`);
  return {};
}
