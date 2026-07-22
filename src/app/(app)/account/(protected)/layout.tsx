import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Route group (protected) — only wraps pages inside this folder, so
// /account/login and /account/auth/callback (siblings, outside the group)
// are unaffected and never hit this redirect.
export default async function ProtectedAccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/account/login");
  }

  return <div className="mx-auto max-w-3xl px-6 py-12">{children}</div>;
}
