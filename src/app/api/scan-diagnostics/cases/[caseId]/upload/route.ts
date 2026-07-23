import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { getCaseForOwner, transitionCaseStatus } from "@/lib/scan-diagnostics/cases";
import { validateScanFile } from "@/lib/scan-diagnostics/file-validation";
import { uploadScanFile } from "@/lib/scan-diagnostics/storage";
import {
  FeatureDisabledError,
  UnsupportedFileError,
  toSafeErrorResponse,
} from "@/lib/scan-diagnostics/api-errors";

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
      return NextResponse.json({ error: "Sign in to upload a scan report." }, { status: 401 });
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
    const validation = validateScanFile(buffer, file.name, file.type);
    if (!validation.ok) {
      throw new UnsupportedFileError(validation.reason);
    }

    const uploaded = await uploadScanFile(user.id, caseId, buffer, file.type || "application/octet-stream");

    const admin = createAdminClient();
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
