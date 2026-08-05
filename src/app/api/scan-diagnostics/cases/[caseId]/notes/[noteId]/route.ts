import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { updateNote, deleteNote } from "@/lib/scan-diagnostics/workbench";
import { UpdateNoteInputSchema } from "@/lib/scan-diagnostics/schemas";
import { FeatureDisabledError, toSafeErrorResponse } from "@/lib/scan-diagnostics/api-errors";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";

interface RouteParams {
  params: Promise<{ caseId: string; noteId: string }>;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { caseId, noteId } = await params;
  try {
    if (!env.scanDiagnosticsEnabled()) throw new FeatureDisabledError();
    const user = await requireUser();
    if (!user) {
      const locale = await resolveAppShellLocale();
      const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;
      return NextResponse.json({ error: t.signInToEditNote }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = UpdateNoteInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid note" }, { status: 400 });
    }

    const note = await updateNote(user.id, caseId, noteId, parsed.data);
    return NextResponse.json({ note });
  } catch (err) {
    return toSafeErrorResponse(err, "update note");
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { caseId, noteId } = await params;
  try {
    if (!env.scanDiagnosticsEnabled()) throw new FeatureDisabledError();
    const user = await requireUser();
    if (!user) {
      const locale = await resolveAppShellLocale();
      const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;
      return NextResponse.json({ error: t.signInToDeleteNote }, { status: 401 });
    }

    await deleteNote(user.id, caseId, noteId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toSafeErrorResponse(err, "delete note");
  }
}
