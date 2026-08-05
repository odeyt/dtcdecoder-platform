import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { getCaseForOwner, transitionCaseStatus } from "@/lib/scan-diagnostics/cases";
import { validateScanFile } from "@/lib/scan-diagnostics/file-validation";
import { uploadScanFile } from "@/lib/scan-diagnostics/storage";
import { isImageScanFileFormat } from "@/lib/types";
import type { ScanFileFormat } from "@/lib/types";
import {
  FeatureDisabledError,
  UnsupportedFileError,
  toSafeErrorResponse,
} from "@/lib/scan-diagnostics/api-errors";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";

interface RouteParams {
  params: Promise<{ caseId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    if (!env.scanDiagnosticsEnabled()) throw new FeatureDisabledError();

    const { caseId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const locale = await resolveAppShellLocale();
      const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;
      return NextResponse.json({ error: t.signInToUploadScanReport }, { status: 401 });
    }

    // Ownership + existence check before touching storage.
    await getCaseForOwner(user.id, caseId);

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "Expected multipart/form-data." }, { status: 400 });
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const validation = await validateScanFile(buffer, file.name, file.type);
    if (!validation.ok) {
      throw new UnsupportedFileError(validation.reason);
    }

    const admin = createAdminClient();
    const isImage = isImageScanFileFormat(validation.formatHint);

    // A case is either an all-photo upload or a single-text-file upload,
    // never a mix — the extract route's isPhotoUpload branch assumes this
    // (see its own comment). Existing single-text-file cases are
    // unaffected: this only ever rejects when the two uploads disagree on
    // image-ness, which never happens for the pre-existing one-file flow.
    const { data: existingFiles, error: existingFilesError } = await admin
      .from("scan_case_files")
      .select("detected_format, file_size_bytes")
      .eq("case_id", caseId);
    if (existingFilesError) throw existingFilesError;

    if (existingFiles && existingFiles.length > 0) {
      const existingIsImage = isImageScanFileFormat(existingFiles[0].detected_format as ScanFileFormat | null);
      if (existingIsImage !== isImage) {
        throw new UnsupportedFileError(
          existingIsImage
            ? "This case already has photo(s) uploaded — please start a new case for a non-photo scan report file."
            : "This case already has a scan report file uploaded — please start a new case to upload photos instead.",
        );
      }
    }

    let uploadOrder: number | null = null;
    if (isImage) {
      const existingImageCount = existingFiles?.length ?? 0;
      const maxCount = env.scanImageMaxCount();
      if (existingImageCount + 1 > maxCount) {
        throw new UnsupportedFileError(`This case already has the maximum of ${maxCount} photos.`);
      }

      const existingTotalBytes = (existingFiles ?? []).reduce((sum, f) => sum + (f.file_size_bytes as number), 0);
      const maxTotalBytes = env.scanImageMaxTotalSizeBytes();
      if (existingTotalBytes + buffer.length > maxTotalBytes) {
        throw new UnsupportedFileError(
          `Adding this photo would exceed the ${Math.floor(maxTotalBytes / (1024 * 1024))} MB combined limit for one case's photos.`,
        );
      }

      uploadOrder = existingImageCount;
    }

    const uploaded = await uploadScanFile(user.id, caseId, buffer, file.type || "application/octet-stream");

    const { data: fileRow, error: insertError } = await admin
      .from("scan_case_files")
      .insert({
        case_id: caseId,
        storage_path: uploaded.storagePath,
        original_filename: file.name,
        declared_mime_type: file.type || "application/octet-stream",
        detected_format: validation.formatHint,
        file_size_bytes: buffer.length,
        file_sha256: uploaded.sha256,
        upload_order: uploadOrder,
      })
      .select("*")
      .single();

    if (insertError) throw insertError;

    const scanCase = await transitionCaseStatus(caseId, ["draft", "uploaded"], "uploaded");

    return NextResponse.json({ case: scanCase, file: fileRow }, { status: 201 });
  } catch (err) {
    return toSafeErrorResponse(err, "upload scan file");
  }
}
