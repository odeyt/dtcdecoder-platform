import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { safeRedirectPath } from "@/lib/safe-redirect";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const siteUrl = env.siteUrl();
  const code = searchParams.get("code");
  // Only a same-origin relative path is ever honored. See safeRedirectPath
  // for why this resolves the candidate rather than prefix-matching it.
  const next = safeRedirectPath(searchParams.get("next"), siteUrl);

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      return NextResponse.redirect(new URL(next ?? "/account", siteUrl));
    }
  }

  return NextResponse.redirect(new URL("/account/login?error=auth", siteUrl));
}
