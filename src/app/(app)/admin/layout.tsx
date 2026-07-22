import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAllowedAdminEmail } from "@/lib/admin-auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/account/login");
  if (!isAllowedAdminEmail(user.email)) redirect("/");

  return <div className="mx-auto max-w-4xl px-6 py-12">{children}</div>;
}
