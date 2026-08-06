import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";
import { updateSearchHistoryQuery, deleteSearchHistoryEntry, SearchHistoryNotFoundError } from "@/lib/search-history";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const updateSchema = z.object({
  query: z.string().trim().min(1).max(500),
});

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const locale = await resolveAppShellLocale();
  const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;

  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: t.signInRequired }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t.invalidRequestBody }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: t.invalidRequest }, { status: 400 });
  }

  try {
    const entry = await updateSearchHistoryQuery(user.id, id, parsed.data.query);
    return NextResponse.json({ entry });
  } catch (err) {
    if (err instanceof SearchHistoryNotFoundError) {
      return NextResponse.json({ error: t.historyEntryNotFound }, { status: 404 });
    }
    console.error("[history] update failed", err);
    return NextResponse.json({ error: t.genericError }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const locale = await resolveAppShellLocale();
  const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;

  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: t.signInRequired }, { status: 401 });
  }

  try {
    await deleteSearchHistoryEntry(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof SearchHistoryNotFoundError) {
      return NextResponse.json({ error: t.historyEntryNotFound }, { status: 404 });
    }
    console.error("[history] delete failed", err);
    return NextResponse.json({ error: t.genericError }, { status: 500 });
  }
}
