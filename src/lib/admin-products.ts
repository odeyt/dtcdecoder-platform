import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { productFilePath, productPreviewPath } from "@/lib/storage";
import { slugify } from "@/lib/slug";
import type { Product, ProductCategory, ProductFile } from "@/lib/types";

export async function listAllProductsForAdmin(): Promise<Product[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getProductForAdmin(
  id: string,
): Promise<(Product & { files: ProductFile[] }) | null> {
  const supabase = createAdminClient();
  const { data: product, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !product) return null;

  const { data: files } = await supabase
    .from("product_files")
    .select("*")
    .eq("product_id", id);

  return { ...product, files: files ?? [] };
}

export interface ProductInput {
  title: string;
  description: string;
  category: ProductCategory;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYearStart: number | null;
  vehicleYearEnd: number | null;
  vehicleSystem: string;
  priceCents: number;
}

// Creates the product row, uploads the thumbnail to the public previews
// bucket, and uploads each provided file to the private files bucket.
// New products default is_published = false — the admin reviews and
// publishes explicitly.
export async function createProductWithFiles(
  input: ProductInput,
  thumbnail: File,
  files: File[],
): Promise<Product> {
  const supabase = createAdminClient();

  const { data: product, error } = await supabase
    .from("products")
    .insert({
      slug: slugify(input.title),
      title: input.title,
      description: input.description || null,
      category: input.category,
      vehicle_make: input.vehicleMake || null,
      vehicle_model: input.vehicleModel || null,
      vehicle_year_start: input.vehicleYearStart,
      vehicle_year_end: input.vehicleYearEnd,
      vehicle_system: input.vehicleSystem || null,
      price_cents: input.priceCents,
      thumbnail_path: "pending",
      is_published: false,
    })
    .select()
    .single();

  if (error || !product) throw error ?? new Error("Product insert failed");

  const thumbnailPath = productPreviewPath(product.id, thumbnail.name);
  const { error: thumbError } = await supabase.storage
    .from(env.storageBucketPreviews())
    .upload(thumbnailPath, thumbnail, { upsert: false });

  if (thumbError) throw thumbError;

  const { error: updateError } = await supabase
    .from("products")
    .update({ thumbnail_path: thumbnailPath })
    .eq("id", product.id);

  if (updateError) throw updateError;

  for (const file of files) {
    const fileId = crypto.randomUUID();
    const storagePath = productFilePath(product.id, fileId, file.name);

    const { error: uploadError } = await supabase.storage
      .from(env.storageBucketFiles())
      .upload(storagePath, file, { upsert: false });

    if (uploadError) throw uploadError;

    const { error: fileRowError } = await supabase.from("product_files").insert({
      product_id: product.id,
      storage_path: storagePath,
      file_name: file.name,
    });

    if (fileRowError) throw fileRowError;
  }

  return { ...product, thumbnail_path: thumbnailPath };
}

export async function updateProduct(
  id: string,
  input: ProductInput,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("products")
    .update({
      title: input.title,
      description: input.description || null,
      category: input.category,
      vehicle_make: input.vehicleMake || null,
      vehicle_model: input.vehicleModel || null,
      vehicle_year_start: input.vehicleYearStart,
      vehicle_year_end: input.vehicleYearEnd,
      vehicle_system: input.vehicleSystem || null,
      price_cents: input.priceCents,
    })
    .eq("id", id);

  if (error) throw error;
}

export async function setProductPublished(
  id: string,
  isPublished: boolean,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("products")
    .update({ is_published: isPublished })
    .eq("id", id);

  if (error) throw error;
}
