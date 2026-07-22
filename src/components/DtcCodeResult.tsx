import Link from "next/link";
import type { DtcCode } from "@/lib/types";
import { EmailSignupForm } from "@/components/EmailSignupForm";

const DIFFICULTY_LABEL: Record<DtcCode["difficulty"], string> = {
  easy: "Easy",
  moderate: "Moderate",
  hard: "Hard",
  professional: "Professional",
};

export function DtcCodeResult({ dtc }: { dtc: DtcCode }) {
  return (
    <article className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
        <p className="font-mono text-sm tracking-widest text-red-400">
          {dtc.code}
          {dtc.make ? ` · ${dtc.make.toUpperCase()}` : ""}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">
          {dtc.title}
        </h1>
        <p className="mt-3 text-zinc-300">{dtc.meaning}</p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-red-300">
            Repair difficulty: {DIFFICULTY_LABEL[dtc.difficulty]}
          </span>
          {dtc.related_makes.map((make) => (
            <span
              key={make}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300"
            >
              {make}
            </span>
          ))}
        </div>
      </header>

      <Section title="Symptoms" items={dtc.symptoms} />
      <Section title="Common Causes" items={dtc.causes} />
      <Section title="Diagnostic Steps" items={dtc.diagnostic_steps} ordered />

      {dtc.common_mistakes && (
        <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6">
          <h2 className="font-semibold text-amber-300">Common Mistakes</h2>
          <p className="mt-2 text-sm text-zinc-300">{dtc.common_mistakes}</p>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        {dtc.pdf_url && (
          <a
            href={dtc.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-600/20 to-red-900/10 p-5 text-center font-semibold text-white shadow-[0_0_20px_rgba(255,30,45,0.15)] transition hover:shadow-[0_0_30px_rgba(255,30,45,0.3)]"
          >
            Get the Full Repair PDF
          </a>
        )}
        {dtc.youtube_url && (
          <a
            href={dtc.youtube_url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center font-semibold text-white backdrop-blur-md transition hover:bg-white/10"
          >
            Watch the Diagnostic Walkthrough
          </a>
        )}
      </section>

      {dtc.faq.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">
            Frequently Asked Questions
          </h2>
          {dtc.faq.map((entry, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/10 bg-white/5 p-4"
            >
              <p className="font-medium text-white">{entry.q}</p>
              <p className="mt-1 text-sm text-zinc-300">{entry.a}</p>
            </div>
          ))}
        </section>
      )}

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-md">
        <p className="text-sm text-zinc-300">
          Want unlimited AI diagnostic help for codes like this one?
        </p>
        <Link
          href="/pricing"
          className="mt-3 inline-block rounded-full bg-red-600 px-6 py-2 font-semibold text-white shadow-[0_0_20px_rgba(255,30,45,0.35)] transition hover:bg-red-500"
        >
          Upgrade to Pro
        </Link>
      </section>

      <EmailSignupForm />
    </article>
  );
}

function Section({
  title,
  items,
  ordered = false,
}: {
  title: string;
  items: string[];
  ordered?: boolean;
}) {
  if (items.length === 0) return null;
  const ListTag = ordered ? "ol" : "ul";
  return (
    <section>
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <ListTag
        className={`mt-2 space-y-1 text-sm text-zinc-300 ${ordered ? "list-decimal" : "list-disc"} pl-5`}
      >
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ListTag>
    </section>
  );
}
