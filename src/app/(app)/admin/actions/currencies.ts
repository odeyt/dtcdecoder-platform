"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { updateCurrency } from "@/lib/admin-currencies";

const currencyUpdateSchema = z.object({
  enabled: z.boolean(),
  displayOrder: z.number().int(),
  decimalPlaces: z.number().int().min(0).max(4),
});

export async function updateCurrencyAction(code: string, formData: FormData): Promise<void> {
  await requireAdmin();

  const input = currencyUpdateSchema.parse({
    enabled: formData.get("enabled") === "on",
    displayOrder: Number(formData.get("displayOrder")),
    decimalPlaces: Number(formData.get("decimalPlaces")),
  });

  await updateCurrency(code, input);
  revalidatePath("/admin/currencies");
}
