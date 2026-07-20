import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

export function productFilePath(
  productId: string,
  fileId: string,
  fileName: string,
): string {
  return `${productId}/${fileId}-${safeFileName(fileName)}`;
}

export function productPreviewPath(productId: string, fileName: string): string {
  return `${productId}/${crypto.randomUUID()}-${safeFileName(fileName)}`;
}

function safeFileName(fileName: string): string {
  const normalized = fileName.normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g, "-");
  return normalized.replace(/^[-.]+|[-.]+$/g, "").slice(0, 120) || "file";
}

// Short-lived signed URL — regenerated on every download click, never
// cached or stored. Caller is responsible for verifying purchase ownership
// before calling this.
export async function createSignedDownloadUrl(
  storagePath: string,
  expiresInSeconds = 300,
): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(env.storageBucketFiles())
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data) {
    throw new Error(`Failed to create signed download URL: ${error?.message}`);
  }

  return data.signedUrl;
}

export function getPublicPreviewUrl(storagePath: string): string {
  const supabase = createAdminClient();
  const { data } = supabase.storage
    .from(env.storageBucketPreviews())
    .getPublicUrl(storagePath);
  return data.publicUrl;
}
