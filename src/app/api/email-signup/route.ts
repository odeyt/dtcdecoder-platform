import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const signupSchema = z.object({
  name: z.string().trim().max(200).optional().default(""),
  email: z.string().trim().email(),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("email_signups")
    .upsert(
      { email: parsed.data.email.toLowerCase(), name: parsed.data.name || null },
      { onConflict: "email" },
    );

  if (error) {
    console.error("Email signup failed", error);
    return NextResponse.json({ error: "Unable to sign up right now" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
