import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const siteUrl = env.siteUrl();
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      return NextResponse.redirect(new URL("/account", siteUrl));
    }
  }

  return NextResponse.redirect(new URL("/account/login?error=auth", siteUrl));
}
