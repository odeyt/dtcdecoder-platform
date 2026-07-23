import Link from "next/link";
import { listTopSearchedDtcCodes } from "@/lib/admin-dtc";

export default async function AdminDashboardPage() {
  const topCodes = await listTopSearchedDtcCodes(10);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <AdminNavCard href="/admin/dtc-codes" title="DTC Codes" description="Add and edit fault codes" />
        <AdminNavCard href="/admin/blog" title="Blog Posts" description="Add and edit articles" />
        <AdminNavCard href="/admin/signups" title="Email Signups" description="View captured leads" />
        <AdminNavCard href="/admin/settings" title="AI Prompt Settings" description="Edit the assistant's system prompt" />
        <AdminNavCard href="/admin/languages" title="Language Registry" description="Enable languages, set support tiers" />
        <AdminNavCard href="/admin/glossary" title="Automotive Glossary" description="Approved terminology per language" />
        <AdminNavCard href="/admin/currencies" title="Currency Registry" description="Enable display currencies" />
      </div>

      <div className="mt-10">
        <h2 className="text-lg font-semibold text-white">Top Searched Codes</h2>
        {topCodes.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-400">No searches recorded yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {topCodes.map((dtc) => (
              <li
                key={dtc.id}
                className="flex justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm"
              >
                <span className="font-mono text-red-400">{dtc.code}</span>
                <span className="text-zinc-300">{dtc.title}</span>
                <span className="text-zinc-500">{dtc.search_count} searches</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AdminNavCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/10"
    >
      <p className="font-semibold text-white">{title}</p>
      <p className="mt-1 text-sm text-zinc-400">{description}</p>
    </Link>
  );
}
