import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { listGlossaryForAdmin } from "@/lib/admin-glossary";
import { deleteGlossaryEntryAction } from "@/app/(app)/admin/actions/glossary";

type Props = {
  searchParams: Promise<{ locale?: string; status?: string }>;
};

export default async function AdminGlossaryPage({ searchParams }: Props) {
  await requireAdmin();
  const { locale, status } = await searchParams;
  const entries = await listGlossaryForAdmin({ locale, status });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Automotive Glossary</h1>
        <Link
          href="/admin/glossary/new"
          className="min-h-11 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white"
        >
          New term
        </Link>
      </div>

      <form className="mt-4 flex flex-wrap gap-3 text-sm">
        <select
          name="locale"
          defaultValue={locale ?? ""}
          className="min-h-11 rounded-lg border border-white/10 bg-white/5 px-3 text-white"
        >
          <option value="">All languages</option>
          <option value="es">Spanish (es)</option>
        </select>
        <select
          name="status"
          defaultValue={status ?? ""}
          className="min-h-11 rounded-lg border border-white/10 bg-white/5 px-3 text-white"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="reviewed">Reviewed</option>
          <option value="approved">Approved</option>
        </select>
        <button type="submit" className="min-h-11 rounded-lg border border-white/10 px-4 text-zinc-300">
          Filter
        </button>
      </form>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[800px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-zinc-400">
              <th className="py-2 pr-4">Term (EN)</th>
              <th className="py-2 pr-4">Locale</th>
              <th className="py-2 pr-4">Translation</th>
              <th className="py-2 pr-4">Do not translate</th>
              <th className="py-2 pr-4">Safety critical</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Version</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-zinc-500">
                  No glossary entries match this filter.
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className="border-b border-white/5 text-zinc-300">
                  <td className="py-2 pr-4">{e.term_en}</td>
                  <td className="py-2 pr-4 font-mono text-red-400">{e.locale_code}</td>
                  <td className="py-2 pr-4">{e.translated_term}</td>
                  <td className="py-2 pr-4">{e.do_not_translate ? "Yes" : "—"}</td>
                  <td className="py-2 pr-4">{e.safety_critical ? "Yes" : "—"}</td>
                  <td className="py-2 pr-4 text-zinc-500">{e.review_status}</td>
                  <td className="py-2 pr-4">{e.glossary_version}</td>
                  <td className="py-2 flex gap-3">
                    <Link href={`/admin/glossary/${e.id}/edit`} className="text-red-400 underline">
                      Edit
                    </Link>
                    <form action={deleteGlossaryEntryAction.bind(null, e.id)}>
                      <button type="submit" className="text-zinc-500 underline">
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
