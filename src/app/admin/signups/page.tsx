import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminSignupsPage() {
  const supabase = createAdminClient();
  const { data: signups, error } = await supabase
    .from("email_signups")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Email Signups</h1>
      {!signups || signups.length === 0 ? (
        <p className="mt-6 text-zinc-400">No signups yet.</p>
      ) : (
        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-zinc-500">
              <th className="py-2">Name</th>
              <th className="py-2">Email</th>
              <th className="py-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {signups.map((s) => (
              <tr key={s.id} className="border-b border-white/5">
                <td className="py-2">{s.name ?? "—"}</td>
                <td className="py-2">{s.email}</td>
                <td className="py-2">{new Date(s.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
