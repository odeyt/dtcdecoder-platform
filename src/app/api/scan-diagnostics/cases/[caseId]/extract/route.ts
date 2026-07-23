import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { getCaseForOwner, transitionCaseStatus } from "@/lib/scan-diagnostics/cases";
import { downloadScanFile } from "@/lib/scan-diagnostics/storage";
import { runExtraction } from "@/lib/scan-diagnostics/parsers/registry";
import { persistExtraction } from "@/lib/scan-diagnostics/extraction";
import { FeatureDisabledError, toSafeErrorResponse } from "@/lib/scan-diagnostics/api-errors";
import type { ScanFileFormat } from "@/lib/types";

interface RouteParams {
  params: Promise<{ caseId: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { caseId } = await params;

  try {
    if (!env.scanDiagnosticsEnabled()) throw new FeatureDisabledError();

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Sign in to run extraction." }, { status: 401 });
    }

    await getCaseForOwner(user.id, caseId);

    await transitionCaseStatus(caseId, ["uploaded", "extraction_review", "failed"], "extracting");

    const admin = createAdminClient();
    const { data: fileRow, error: fileError } = await admin
      .from("scan_case_files")
      .select("*")
      .eq("case_id", caseId)
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fileError) throw fileError;

    if (!fileRow) {
      await transitionCaseStatus(caseId, "extracting", "failed", {
        error_message: "No uploaded file found for this case.",
      });
      return NextResponse.json({ error: "No uploaded file found for this case." }, { status: 400 });
    }

    try {
      const buffer = await downloadScanFile(fileRow.storage_path);
      const declaredFormat = (fileRow.detected_format ?? "unknown") as ScanFileFormat;
      const { parserId, parserVersion, report } = await runExtraction(
        buffer,
        declaredFormat,
        fileRow.original_filename,
      );

      const extraction = await persistExtraction(caseId, fileRow.id, parserId, parserVersion, report);
      const scanCase = await transitionCaseStatus(caseId, "extracting", "extraction_review");

      return NextResponse.json({ case: scanCase, extraction });
    } catch (err) {
      console.error("[scan-diagnostics] extraction failed", err);
      const scanCase = await transitionCaseStatus(caseId, "extracting", "failed", {
        error_message: "Extraction failed. Please try again or contact support.",
      });
      return NextResponse.json({ case: scanCase, error: "Extraction failed." }, { status: 502 });
    }
  } catch (err) {
    return toSafeErrorResponse(err, "extract case");
  }
}
