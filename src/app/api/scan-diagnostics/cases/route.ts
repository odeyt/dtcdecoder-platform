import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { createCase } from "@/lib/scan-diagnostics/cases";
import { CaseInfoInputSchema } from "@/lib/scan-diagnostics/schemas";
import { FeatureDisabledError, toSafeErrorResponse } from "@/lib/scan-diagnostics/api-errors";

export async function POST(request: NextRequest) {
  try {
    if (!env.scanDiagnosticsEnabled()) throw new FeatureDisabledError();

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Sign in to start a diagnostic case." }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const parsed = CaseInfoInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid case information" }, { status: 400 });
    }

    const scanCase = await createCase(user.id, parsed.data);
    return NextResponse.json({ case: scanCase }, { status: 201 });
  } catch (err) {
    return toSafeErrorResponse(err, "create case");
  }
}
