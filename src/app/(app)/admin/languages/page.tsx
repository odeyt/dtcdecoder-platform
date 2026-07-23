import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { listAllLanguagesForAdmin } from "@/lib/admin-languages";

const TIER_LABEL: Record<number, string> = {
  1: "Tier 1 — Fully verified",
  2: "Tier 2 — AI-supported",
  3: "Tier 3 — Experimental",
  4: "Tier 4 — Disabled",
};

export default async function AdminLanguagesPage() {
  await requireAdmin();
  const languages = await listAllLanguagesForAdmin();

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Language Registry</h1>
      <p className="mt-1 text-sm text-zinc-400">
        {languages.length} locales registered. Only rows with Enabled + AI output
        enabled are ever offered as an AI report language; only Enabled + Public
        rows appear in public switchers.
      </p>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-zinc-400">
              <th className="py-2 pr-4">Locale</th>
              <th className="py-2 pr-4">Native name</th>
              <th className="py-2 pr-4">Script / Dir</th>
              <th className="py-2 pr-4">Tier</th>
              <th className="py-2 pr-4">Enabled</th>
              <th className="py-2 pr-4">Public</th>
              <th className="py-2 pr-4">AI in/out</th>
              <th className="py-2 pr-4">Safety review</th>
              <th className="py-2 pr-4">UI %</th>
              <th className="py-2 pr-4">Glossary %</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {languages.map((l) => (
              <tr key={l.locale_code} className="border-b border-white/5 text-zinc-300">
                <td className="py-2 pr-4 font-mono text-red-400">{l.locale_code}</td>
                <td className="py-2 pr-4">{l.native_name}</td>
                <td className="py-2 pr-4 text-zinc-500">
                  {l.script} / {l.direction}
                </td>
                <td className="py-2 pr-4">{TIER_LABEL[l.support_tier] ?? l.support_tier}</td>
                <td className="py-2 pr-4">{l.enabled ? "Yes" : "—"}</td>
                <td className="py-2 pr-4">{l.public_available ? "Yes" : "—"}</td>
                <td className="py-2 pr-4">
                  {l.ai_input_enabled ? "In" : "—"} / {l.ai_output_enabled ? "Out" : "—"}
                </td>
                <td className="py-2 pr-4 text-zinc-500">{l.safety_review_status}</td>
                <td className="py-2 pr-4">{l.ui_translation_completion_percent}%</td>
                <td className="py-2 pr-4">{l.glossary_completion_percent}%</td>
                <td className="py-2">
                  <Link href={`/admin/languages/${l.locale_code}/edit`} className="text-red-400 underline">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
