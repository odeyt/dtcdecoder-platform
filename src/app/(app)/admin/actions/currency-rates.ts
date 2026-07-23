"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { upsertCurrencyRate } from "@/lib/admin-currency-rates";

const rateSchema = z.object({
  quoteCurrency: z.string().trim().toUpperCase().length(3),
  rate: z.number().positive(),
  sourceLabel: z.string().trim().min(1),
  expiresAt: z.string().trim().optional(),
  enabled: z.boolean(),
});

export async function upsertCurrencyRateAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  const parsed = rateSchema.parse({
    quoteCurrency: formData.get("quoteCurrency"),
    rate: Number(formData.get("rate")),
    sourceLabel: formData.get("sourceLabel"),
    expiresAt: formData.get("expiresAt") || undefined,
    enabled: formData.get("enabled") === "on",
  });

  await upsertCurrencyRate({
    quoteCurrency: parsed.quoteCurrency,
    rate: parsed.rate,
    sourceLabel: parsed.sourceLabel,
    expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt).toISOString() : null,
    enabled: parsed.enabled,
    updatedBy: admin.email ?? admin.id,
  });

  revalidatePath("/admin/currencies");
}
