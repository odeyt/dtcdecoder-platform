// Storage access for uploaded scan report files. Every read is a signed
// URL issued by the service-role client after an explicit ownership check
// done by the caller — the diagnostic-scan-files bucket itself grants no
// direct read/write access to anon or authenticated roles (see
// supabase/migrations/0014_scan_diagnostics_storage.sql).
import "server-only";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

const SIGNED_URL_TTL_SECONDS = 60 * 5;

export interface UploadedScanFile {
  storagePath: string;
  sha256: string;
}

// Randomized path — the original filename is preserved only as metadata
// (scan_case_files.original_filename), never used as or embedded in the
// storage key.
export async function uploadScanFile(
  userId: string,
  caseId: string,
  buffer: Buffer,
  contentType: string,
): Promise<UploadedScanFile> {
  const storagePath = `${userId}/${caseId}/${crypto.randomUUID()}`;
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from(env.scanFilesBucket())
    .upload(storagePath, buffer, { contentType, upsert: false });

  if (error) throw error;

  return { storagePath, sha256 };
}

export async function getSignedScanFileUrl(storagePath: string): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(env.scanFilesBucket())
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error) throw error;
  return data.signedUrl;
}

export async function downloadScanFile(storagePath: string): Promise<Buffer> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(env.scanFilesBucket()).download(storagePath);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

export async function deleteScanFile(storagePath: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(env.scanFilesBucket()).remove([storagePath]);
  if (error) throw error;
}
