"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-auth";
import {
  createProductWithFiles,
  updateProduct,
  setProductPublished,
  type ProductInput,
} from "@/lib/admin-products";

const productFieldsSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(""),
  category: z.enum(["wiring_diagram", "software_tool"]),
  vehicleMake: z.string().default(""),
  vehicleModel: z.string().default(""),
  vehicleYearStart: z.string().default(""),
  vehicleYearEnd: z.string().default(""),
  vehicleSystem: z.string().default(""),
  price: z.string().min(1),
});

const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;
const MAX_PRODUCT_FILE_BYTES = 100 * 1024 * 1024;
const MAX_PRODUCT_FILES = 10;
const ALLOWED_THUMBNAIL_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_PRODUCT_FILE_TYPES = new Set([
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
]);

function parseProductInput(formData: FormData): ProductInput {
  const parsed = productFieldsSchema.parse({
    title: formData.get("title"),
    description: formData.get("description"),
    category: formData.get("category"),
    vehicleMake: formData.get("vehicleMake"),
    vehicleModel: formData.get("vehicleModel"),
    vehicleYearStart: formData.get("vehicleYearStart"),
    vehicleYearEnd: formData.get("vehicleYearEnd"),
    vehicleSystem: formData.get("vehicleSystem"),
    price: formData.get("price"),
  });

  const priceCents = Math.round(parseFloat(parsed.price) * 100);
  if (!Number.isFinite(priceCents) || priceCents <= 0) {
    throw new Error("Invalid price");
  }

  return {
    title: parsed.title,
    description: parsed.description,
    category: parsed.category,
    vehicleMake: parsed.vehicleMake,
    vehicleModel: parsed.vehicleModel,
    vehicleYearStart: parsed.vehicleYearStart ? Number(parsed.vehicleYearStart) : null,
    vehicleYearEnd: parsed.vehicleYearEnd ? Number(parsed.vehicleYearEnd) : null,
    vehicleSystem: parsed.vehicleSystem,
    priceCents,
  };
}

export async function createProductAction(formData: FormData) {
  await requireAdmin();

  const input = parseProductInput(formData);

  const thumbnail = formData.get("thumbnail");
  if (!(thumbnail instanceof File) || thumbnail.size === 0) {
    throw new Error("Thumbnail image is required");
  }
  if (!ALLOWED_THUMBNAIL_TYPES.has(thumbnail.type) || thumbnail.size > MAX_THUMBNAIL_BYTES) {
    throw new Error("Thumbnail must be a JPEG, PNG, or WebP image no larger than 5 MB");
  }

  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (files.length === 0) {
    throw new Error("At least one downloadable file is required");
  }
  if (files.length > MAX_PRODUCT_FILES) {
    throw new Error(`No more than ${MAX_PRODUCT_FILES} downloadable files are allowed`);
  }
  if (files.some((file) => !ALLOWED_PRODUCT_FILE_TYPES.has(file.type))) {
    throw new Error("Download files must be PDF or ZIP files");
  }
  if (files.some((file) => file.size > MAX_PRODUCT_FILE_BYTES)) {
    throw new Error("Each downloadable file must be no larger than 100 MB");
  }

  const product = await createProductWithFiles(input, thumbnail, files);

  revalidatePath("/admin");
  redirect(`/admin/products/${product.id}/edit`);
}

export async function updateProductAction(id: string, formData: FormData) {
  await requireAdmin();

  const input = parseProductInput(formData);
  await updateProduct(id, input);

  revalidatePath("/admin");
  revalidatePath(`/admin/products/${id}/edit`);
}

export async function togglePublishAction(id: string, isPublished: boolean) {
  await requireAdmin();

  await setProductPublished(id, isPublished);

  revalidatePath("/admin");
  revalidatePath(`/admin/products/${id}/edit`);
}
