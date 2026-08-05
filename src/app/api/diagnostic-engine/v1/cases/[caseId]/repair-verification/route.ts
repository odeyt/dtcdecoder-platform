// Phase 2 Diagnostic Engine — repair verification (spec item 8). POST
// generates a fresh checklist for the case (Clear Codes, Road Test,
// Monitor Live Data, Recheck Pending DTC, Confirm Readiness, Verify
// Customer Complaint — see repair-verification.ts's fixed template). GET
// returns the most recent one. PATCH marks a single checklist item
// complete/incomplete. Independent of a diagnostic-engine "turn" — a
// repair can be verified without ever calling the AI provider.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCaseForOwner } from "@/lib/scan-diagnostics/cases";
import { DIAGNOSTIC_ENGINE_FLAGS } from "@/lib/diagnostic-engine/feature-flags";
import { createRepairVerification, getLatestRepairVerification, updateRepairVerificationItem } from "@/lib/diagnostic-engine/repair-verification";
import { toSafeErrorResponse } from "@/lib/scan-diagnostics/api-errors";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";

interface RouteParams {
  params: Promise<{ caseId: string }>;
}

function featureDisabledResponse(t: Record<string, string>) {
  return NextResponse.json({ error: t.repairVerificationNotAvailable }, { status: 404 });
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { caseId } = await params;
  try {
    const locale = await resolveAppShellLocale();
    const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;
    if (!DIAGNOSTIC_ENGINE_FLAGS.repairVerificationEnabled()) return featureDisabledResponse(t);

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: t.signInToViewRepairVerification }, { status: 401 });
    }

    await getCaseForOwner(user.id, caseId);
    const verification = await getLatestRepairVerification(caseId);
    return NextResponse.json({ verification });
  } catch (err) {
    return toSafeErrorResponse(err, "get repair verification");
  }
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { caseId } = await params;
  try {
    const locale = await resolveAppShellLocale();
    const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;
    if (!DIAGNOSTIC_ENGINE_FLAGS.repairVerificationEnabled()) return featureDisabledResponse(t);

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: t.signInToGenerateRepairVerification }, { status: 401 });
    }

    await getCaseForOwner(user.id, caseId);
    const verification = await createRepairVerification(caseId);
    return NextResponse.json({ verification });
  } catch (err) {
    return toSafeErrorResponse(err, "create repair verification");
  }
}

const UpdateItemSchema = z.object({
  item: z.string().min(1),
  completed: z.boolean(),
  notes: z.string().optional(),
});

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { caseId } = await params;
  try {
    const locale = await resolveAppShellLocale();
    const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;
    if (!DIAGNOSTIC_ENGINE_FLAGS.repairVerificationEnabled()) return featureDisabledResponse(t);

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: t.signInToUpdateRepairVerification }, { status: 401 });
    }

    await getCaseForOwner(user.id, caseId);

    const parsed = UpdateItemSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: t.invalidChecklistUpdatePayload }, { status: 400 });
    }

    const verification = await updateRepairVerificationItem(caseId, parsed.data.item, parsed.data.completed, parsed.data.notes);
    return NextResponse.json({ verification });
  } catch (err) {
    return toSafeErrorResponse(err, "update repair verification");
  }
}
