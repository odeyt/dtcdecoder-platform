import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { getCaseForOwner } from "@/lib/scan-diagnostics/cases";
import { FeatureDisabledError, toSafeErrorResponse } from "@/lib/scan-diagnostics/api-errors";

interface RouteParams {
  params: Promise<{ caseId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    if (!env.scanDiagnosticsEnabled()) throw new FeatureDisabledError();

    const { caseId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Sign in to view this case." }, { status: 401 });
    }

    const scanCase = await getCaseForOwner(user.id, caseId);

    const admin = createAdminClient();
    const [{ data: files }, { data: extraction }, { data: dtcRecords }, { data: report }] =
      await Promise.all([
        admin
          .from("scan_case_files")
          .select("*")
          .eq("case_id", caseId)
          .order("uploaded_at", { ascending: false }),
        admin.from("scan_extractions").select("*").eq("case_id", caseId).maybeSingle(),
        admin.from("scan_dtc_records").select("*").eq("case_id", caseId).order("code"),
        admin.from("scan_reports").select("*").eq("case_id", caseId).maybeSingle(),
      ]);

    return NextResponse.json({
      case: scanCase,
      files: files ?? [],
      extraction: extraction ?? null,
      dtcRecords: dtcRecords ?? [],
      report: report ?? null,
    });
  } catch (err) {
    return toSafeErrorResponse(err, "get case");
  }
}
