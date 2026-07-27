import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

// Only a same-origin relative path is ever honored — a `next` value like
// "https://evil.example/phish" or "//evil.example" (protocol-relative,
// still an external host) is rejected and falls back to /account. This is
// the standard open-redirect guard for any post-login "return to" param.
function safeNextPath(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const siteUrl = env.siteUrl();
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      return NextResponse.redirect(new URL(next ?? "/account", siteUrl));
    }
  }

  return NextResponse.redirect(new URL("/account/login?error=auth", siteUrl));
}
