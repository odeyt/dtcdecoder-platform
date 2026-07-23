import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { getCaseForOwner } from "@/lib/scan-diagnostics/cases";
import { getSignedScanFileUrl } from "@/lib/scan-diagnostics/storage";
import {
  FeatureDisabledError,
  ScanCaseNotFoundError,
  toSafeErrorResponse,
} from "@/lib/scan-diagnostics/api-errors";

interface RouteParams {
  params: Promise<{ caseId: string; fileId: string }>;
}

// First download route in this repo — every read is a short-lived signed
// URL issued only after confirming the requesting user owns the case the
// file belongs to (the diagnostic-scan-files bucket itself grants no
// direct read access).
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { caseId, fileId } = await params;

  try {
    if (!env.scanDiagnosticsEnabled()) throw new FeatureDisabledError();

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Sign in to download this file." }, { status: 401 });
    }

    await getCaseForOwner(user.id, caseId);

    const admin = createAdminClient();
    const { data: fileRow, error } = await admin
      .from("scan_case_files")
      .select("*")
      .eq("id", fileId)
      .eq("case_id", caseId)
      .maybeSingle();

    if (error) throw error;
    if (!fileRow) throw new ScanCaseNotFoundError();

    const signedUrl = await getSignedScanFileUrl(fileRow.storage_path);
    return NextResponse.json({ url: signedUrl, filename: fileRow.original_filename });
  } catch (err) {
    return toSafeErrorResponse(err, "download scan file");
  }
}
