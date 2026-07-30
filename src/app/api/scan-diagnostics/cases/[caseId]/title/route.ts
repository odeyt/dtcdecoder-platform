import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { getCaseForOwner } from "@/lib/scan-diagnostics/cases";
import { FeatureDisabledError, toSafeErrorResponse } from "@/lib/scan-diagnostics/api-errors";

interface RouteParams {
  params: Promise<{ caseId: string }>;
}

// Empty string clears back to the default (complaint text, or "Untitled
// case") — the list page treats "" the same as null, so trim-to-null here
// rather than storing a distinct empty-string state.
const bodySchema = z.object({ title: z.string().trim().max(120) });

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    if (!env.scanDiagnosticsEnabled()) throw new FeatureDisabledError();

    const { caseId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Sign in to rename this case." }, { status: 401 });
    }

    // Throws (mapped to a safe 404 below) if this case doesn't exist or
    // isn't owned by the caller.
    await getCaseForOwner(user.id, caseId);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("scan_cases")
      .update({ title: parsed.data.title || null })
      .eq("id", caseId);
    if (error) throw error;

    return NextResponse.json({ success: true, title: parsed.data.title || null });
  } catch (err) {
    return toSafeErrorResponse(err, "rename case");
  }
}
