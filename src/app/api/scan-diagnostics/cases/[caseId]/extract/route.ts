import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { getEffectivePlan } from "@/lib/subscriptions";
import { canAccessFullDiagnostics } from "@/lib/ai-diagnostics/entitlements";
import { getCaseForOwner, transitionCaseStatus } from "@/lib/scan-diagnostics/cases";
import { downloadScanFile } from "@/lib/scan-diagnostics/storage";
import { runExtraction } from "@/lib/scan-diagnostics/parsers/registry";
import { extractFromImages, SCAN_IMAGE_EXTRACTION_MODEL_ID } from "@/lib/scan-diagnostics/ai/vision-extraction";
import { persistExtraction } from "@/lib/scan-diagnostics/extraction";
import { FeatureDisabledError, toSafeErrorResponse } from "@/lib/scan-diagnostics/api-errors";
import { isImageScanFileFormat } from "@/lib/types";
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

    const admin = createAdminClient();
    // Every file uploaded for this case, in selection/capture order — a
    // photo upload has several rows here (see upload/route.ts's
    // upload_order); every other upload type has exactly one, same as
    // before this feature. Ordering by upload_order first (nulls last)
    // then uploaded_at means an old single-file case (upload_order always
    // null) behaves exactly as before: the query just returns its one row.
    const { data: fileRows, error: filesError } = await admin
      .from("scan_case_files")
      .select("*")
      .eq("case_id", caseId)
      .order("upload_order", { ascending: true, nullsFirst: false })
      .order("uploaded_at", { ascending: true });
    if (filesError) throw filesError;

    if (!fileRows || fileRows.length === 0) {
      await transitionCaseStatus(caseId, "uploaded", "failed", {
        error_message: "No uploaded file found for this case.",
      }).catch(() => undefined);
      return NextResponse.json({ error: "No uploaded file found for this case." }, { status: 400 });
    }

    const isPhotoUpload = fileRows.every((f) => isImageScanFileFormat(f.detected_format as ScanFileFormat | null));

    // Photo-upload extraction is a real Claude vision API call (unlike
    // every text-format parser, which only ever touches locally parsed
    // bytes) — gated behind the same full-diagnostics entitlement the
    // downstream diagnosis stage already requires. A Free-tier account can
    // never get a diagnosis at all, so letting it freely spend real
    // vision-API budget on extraction that leads nowhere makes no sense.
    // Text-format extraction stays exactly as it always was: free, ungated.
    if (isPhotoUpload) {
      const plan = await getEffectivePlan(user.id, user.email ?? null);
      if (!canAccessFullDiagnostics(plan)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "UPGRADE_REQUIRED",
              message: "Photo/screenshot upload is available on Pro Technician and Workshop plans.",
              upgradeRequired: true,
            },
          },
          { status: 403 },
        );
      }
    }

    await transitionCaseStatus(caseId, ["uploaded", "extraction_review", "failed"], "extracting");

    try {
      let parserId: string;
      let parserVersion: string;
      let report: Awaited<ReturnType<typeof runExtraction>>["report"];
      // Null for a photo upload — several files (several scan_case_files
      // rows) contributed to one extraction, so there's no single file to
      // attribute it to. See persistExtraction's own comment.
      let extractionFileId: string | null;

      if (isPhotoUpload) {
        const images = await Promise.all(
          fileRows.map(async (f) => ({
            buffer: await downloadScanFile(f.storage_path),
            filename: f.original_filename,
            declaredFormat: (f.detected_format ?? "unknown") as ScanFileFormat,
          })),
        );
        const result = await extractFromImages(images);
        parserId = "vision-extraction";
        parserVersion = SCAN_IMAGE_EXTRACTION_MODEL_ID;
        report = result.report;
        extractionFileId = null;
      } else {
        // Most recently uploaded file — same selection this route always
        // used, before this feature ever introduced the possibility of a
        // case holding more than one file.
        const fileRow = fileRows[fileRows.length - 1];
        const buffer = await downloadScanFile(fileRow.storage_path);
        const declaredFormat = (fileRow.detected_format ?? "unknown") as ScanFileFormat;
        const result = await runExtraction(buffer, declaredFormat, fileRow.original_filename);
        parserId = result.parserId;
        parserVersion = result.parserVersion;
        report = result.report;
        extractionFileId = fileRow.id;
      }

      const extraction = await persistExtraction(caseId, extractionFileId, parserId, parserVersion, report);
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
