import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";
import { decodeVin } from "@/lib/vin/decode";

// 17-char VIN, excluding I/O/Q which are never valid VIN characters — same
// character class as VIN_PATTERN in
// src/lib/scan-diagnostics/parsers/dtc-extraction.ts. NHTSA's own
// ErrorCode is the real check-digit/registration validator; this is just a
// format sanity check before spending a network call.
const requestSchema = z.object({
  vin: z
    .string()
    .trim()
    .toUpperCase()
    .length(17)
    .regex(/^[A-HJ-NPR-Z0-9]{17}$/),
});

export async function POST(request: NextRequest) {
  const locale = await resolveAppShellLocale();
  const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: t.signInRequiredVinDecode }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t.invalidRequestBody }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: t.invalidVinFormat }, { status: 400 });
  }

  try {
    const result = await decodeVin(parsed.data.vin);
    // Always 200 here — "not recognized" is a normal decode outcome
    // (result.valid === false), not an app error. Only a genuine upstream/
    // network failure below is a 502.
    return NextResponse.json(result);
  } catch (err) {
    console.error("[vin-decode] NHTSA decode failed", err);
    return NextResponse.json({ error: t.vinDecodeFailed }, { status: 502 });
  }
}
