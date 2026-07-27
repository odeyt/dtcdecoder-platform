import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordEvent, isAnalyticsEventType } from "@/lib/analytics/events";

// The only client-reachable analytics touch point — everything else in the
// funnel (searches, CTA views, AI diagnosis lifecycle) is recorded
// server-side. This exists solely for a genuine UI interaction (a CTA
// click) that only the browser observes. Never accepts arbitrary event
// types or free-text metadata from the client — validated against the
// fixed enum, and the metadata object is passed through as-is (callers on
// the client only ever send small structured tags, never diagnostic text).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || !isAnalyticsEventType(body.eventType)) {
    return NextResponse.json({ error: "Invalid event type." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const metadata =
    body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
      ? (body.metadata as Record<string, unknown>)
      : {};

  await recordEvent(body.eventType, { userId: user?.id ?? null, metadata });
  return new NextResponse(null, { status: 204 });
}
