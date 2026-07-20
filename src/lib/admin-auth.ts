import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export function isAllowedAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return env.adminAllowedEmails().includes(email.toLowerCase());
}

// Call at the top of every admin Server Action, not just in the layout —
// render-time gating alone isn't a security boundary for actions, which
// are reachable directly by anyone who can send the same POST.
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAllowedAdminEmail(user.email)) {
    redirect("/");
  }

  return user;
}
