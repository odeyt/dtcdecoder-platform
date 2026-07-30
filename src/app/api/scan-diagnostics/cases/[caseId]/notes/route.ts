import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { listNotes, createNote } from "@/lib/scan-diagnostics/workbench";
import { CreateNoteInputSchema } from "@/lib/scan-diagnostics/schemas";
import { FeatureDisabledError, toSafeErrorResponse } from "@/lib/scan-diagnostics/api-errors";
import { recordEvent } from "@/lib/analytics/events";

interface RouteParams {
  params: Promise<{ caseId: string }>;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { caseId } = await params;
  try {
    if (!env.scanDiagnosticsEnabled()) throw new FeatureDisabledError();
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Sign in to view notes." }, { status: 401 });

    const notes = await listNotes(user.id, caseId);
    return NextResponse.json({ notes });
  } catch (err) {
    return toSafeErrorResponse(err, "list notes");
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { caseId } = await params;
  try {
    if (!env.scanDiagnosticsEnabled()) throw new FeatureDisabledError();
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Sign in to add a note." }, { status: 401 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = CreateNoteInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid note" }, { status: 400 });
    }

    const note = await createNote(user.id, caseId, parsed.data);
    // Never send note body/content — only that a note was added.
    await recordEvent("diagnostic_report_note_added", { userId: user.id, metadata: { category: note.category } });
    return NextResponse.json({ note }, { status: 201 });
  } catch (err) {
    return toSafeErrorResponse(err, "create note");
  }
}
