import type { Metadata } from "next";
import Link from "next/link";
import { searchDtcCodes } from "@/lib/dtc";
import { incrementDtcSearchCount } from "@/lib/admin-dtc";

export const metadata: Metadata = {
  title: "DTC Lookup",
  description:
    "Search any diagnostic trouble code, symptom, or vehicle issue for an instant explanation.",
};

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function DtcLookupPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const results = query ? await searchDtcCodes(query) : [];

  if (query && results[0]) {
    incrementDtcSearchCount(results[0].id).catch(() => {});
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold text-white">DTC Lookup</h1>
      <p className="mt-2 text-zinc-400">
        Enter a fault code, symptom, or vehicle issue.
      </p>

      <form className="mt-6 flex gap-3">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Enter DTC code, symptom, or vehicle issue..."
          className="flex-1 rounded-md border border-white/10 bg-black/30 px-4 py-3 text-white placeholder:text-zinc-500"
        />
        <button
          type="submit"
          className="rounded-md bg-red-600 px-6 py-3 font-semibold text-white transition hover:bg-red-500"
        >
          Decode
        </button>
      </form>

      {query && results.length === 0 && (
        <p className="mt-8 text-zinc-400">
          No published results for &ldquo;{query}&rdquo; yet. Try a specific
          code like P0420, or ask the{" "}
          <Link href="/ai-assistant" className="text-red-400 underline">
            AI assistant
          </Link>
          .
        </p>
      )}

      {results.length > 0 && (
        <ul className="mt-8 space-y-3">
          {results.map((dtc) => (
            <li key={dtc.id}>
              <Link
                href={dtc.make ? `/${dtc.make}/${dtc.slug}` : `/dtc/${dtc.slug}`}
                className="block rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-md transition hover:bg-white/10"
              >
                <p className="font-mono text-sm text-red-400">
                  {dtc.code}
                  {dtc.make ? ` · ${dtc.make.toUpperCase()}` : ""}
                </p>
                <p className="mt-1 font-semibold text-white">{dtc.title}</p>
                <p className="mt-1 line-clamp-2 text-sm text-zinc-400">
                  {dtc.meaning}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
