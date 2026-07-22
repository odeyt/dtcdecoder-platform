import Link from "next/link";
import { listAllDtcCodesForAdmin } from "@/lib/admin-dtc";
import { toggleDtcPublishAction } from "@/app/(app)/admin/actions";

export default async function AdminDtcCodesPage() {
  const codes = await listAllDtcCodesForAdmin();

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">DTC Codes</h1>
        <Link
          href="/admin/dtc-codes/new"
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
        >
          New DTC Code
        </Link>
      </div>

      {codes.length === 0 ? (
        <p className="mt-6 text-zinc-400">No DTC codes yet.</p>
      ) : (
        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-zinc-500">
              <th className="py-2">Code</th>
              <th className="py-2">Make</th>
              <th className="py-2">Title</th>
              <th className="py-2">Searches</th>
              <th className="py-2">Status</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {codes.map((dtc) => (
              <tr key={dtc.id} className="border-b border-white/5">
                <td className="py-2 font-mono">{dtc.code}</td>
                <td className="py-2">{dtc.make ?? "generic"}</td>
                <td className="py-2">{dtc.title}</td>
                <td className="py-2">{dtc.search_count}</td>
                <td className="py-2">
                  <form
                    action={toggleDtcPublishAction.bind(null, dtc.id, !dtc.is_published)}
                  >
                    <button
                      type="submit"
                      className={dtc.is_published ? "text-emerald-400" : "text-zinc-500"}
                    >
                      {dtc.is_published ? "Published" : "Draft"}
                    </button>
                  </form>
                </td>
                <td className="py-2 text-right">
                  <Link href={`/admin/dtc-codes/${dtc.id}/edit`} className="underline">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
