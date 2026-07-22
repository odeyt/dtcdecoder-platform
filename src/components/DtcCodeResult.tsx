import Link from "next/link";
import type { DtcCode } from "@/lib/types";
import { EmailSignupForm } from "@/components/EmailSignupForm";
import { SeverityBadge } from "@/components/SeverityBadge";
import { SafetyAlert } from "@/components/SafetyAlert";
import { ResultSection } from "@/components/ResultSection";
import { CauseCard } from "@/components/CauseCard";
import { detectSafetyWarnings } from "@/lib/safety-warnings";

const DIFFICULTY_LABEL: Record<DtcCode["difficulty"], string> = {
  easy: "Easy — most DIYers can verify this",
  moderate: "Moderate — some diagnostic tools helpful",
  hard: "Hard — scan tool and experience recommended",
  professional: "Professional — a shop visit is the safer path",
};

export function DtcCodeResult({ dtc }: { dtc: DtcCode }) {
  const warningText = [dtc.meaning, dtc.symptoms.join(" "), dtc.causes.join(" "), dtc.drive_recommendation ?? ""].join(" ");
  const safetyWarnings = detectSafetyWarnings(warningText);

  return (
    <article className="container-app space-y-10 px-6 py-12">
      {/* Summary */}
      <header className="glass-panel rounded-[var(--radius-xl)] p-6 sm:p-8">
        <p className="font-mono text-sm tracking-widest text-[var(--accent-red)]">
          {dtc.code}
          {dtc.make ? ` · ${dtc.make.toUpperCase()}` : " · Generic"}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
          {dtc.title}
        </h1>
        <p className="mt-3 text-[var(--text-secondary)]">{dtc.meaning}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <SeverityBadge severity={dtc.severity} />
          <span className="rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs text-[var(--text-secondary)]">
            {DIFFICULTY_LABEL[dtc.difficulty]}
          </span>
          {dtc.related_makes.map((make) => (
            <span
              key={make}
              className="rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs text-[var(--text-muted)]"
            >
              {make}
            </span>
          ))}
        </div>
        <p className="mt-4 text-xs text-[var(--text-muted)]">
          Sourced from our reviewed reference database — not AI-generated.
        </p>
      </header>

      {/* Immediate safety guidance */}
      <SafetyAlert warnings={safetyWarnings} />
      {dtc.drive_recommendation && (
        <ResultSection title="Drive recommendation">
          <p className="text-sm text-[var(--text-secondary)]">{dtc.drive_recommendation}</p>
        </ResultSection>
      )}

      {/* Most likely causes */}
      <ResultSection title="Most likely causes">
        <div className="space-y-2">
          {dtc.causes.map((cause, i) => (
            <CauseCard key={i} cause={cause} rank={i + 1} />
          ))}
        </div>
      </ResultSection>

      {/* Evidence from reported symptoms */}
      <ResultSection title="Reported symptoms">
        <ul className="space-y-1 pl-5 text-sm text-[var(--text-secondary)]" style={{ listStyleType: "disc" }}>
          {dtc.symptoms.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </ResultSection>

      {/* Recommended diagnostic checks */}
      <ResultSection title="Recommended diagnostic checks">
        <ol className="space-y-1 pl-5 text-sm text-[var(--text-secondary)]" style={{ listStyleType: "decimal" }}>
          {dtc.diagnostic_steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </ResultSection>

      {/* What not to replace yet */}
      {dtc.common_mistakes && (
        <ResultSection title="What not to replace yet">
          <p
            className="rounded-[var(--radius-lg)] border p-4 text-sm text-[var(--text-secondary)]"
            style={{ borderColor: "var(--accent-amber)", background: "rgba(217, 154, 63, 0.08)" }}
          >
            {dtc.common_mistakes}
          </p>
        </ResultSection>
      )}

      {/* Downloadable / video content */}
      <section className="grid gap-4 sm:grid-cols-2">
        {dtc.pdf_url && (
          <a
            href={dtc.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-[var(--radius-lg)] border border-[var(--border-red)] bg-[var(--surface-burgundy)] p-5 text-center font-semibold text-[var(--text-primary)] transition hover:brightness-110"
            style={{ boxShadow: "var(--shadow-accent)" }}
          >
            Get the Full Repair PDF
          </a>
        )}
        {dtc.youtube_url && (
          <a
            href={dtc.youtube_url}
            target="_blank"
            rel="noopener noreferrer"
            className="glass-panel rounded-[var(--radius-lg)] p-5 text-center font-semibold text-[var(--text-primary)] transition hover:bg-white/5"
          >
            Watch the Diagnostic Walkthrough
          </a>
        )}
      </section>

      {/* FAQ */}
      {dtc.faq.length > 0 && (
        <ResultSection title="Frequently asked questions">
          <div className="space-y-3">
            {dtc.faq.map((entry, i) => (
              <div key={i} className="glass-panel rounded-[var(--radius-lg)] p-4">
                <p className="font-medium text-[var(--text-primary)]">{entry.q}</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{entry.a}</p>
              </div>
            ))}
          </div>
        </ResultSection>
      )}

      {/* Technical details */}
      <ResultSection title="Technical details">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-xs text-[var(--text-secondary)] sm:grid-cols-4">
          <div>
            <dt className="text-[var(--text-muted)]">Code</dt>
            <dd>{dtc.code}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">Make</dt>
            <dd>{dtc.make ?? "Generic"}</dd>
          </div>
          {dtc.model && (
            <div>
              <dt className="text-[var(--text-muted)]">Model</dt>
              <dd>{dtc.model}</dd>
            </div>
          )}
          {dtc.engine_code && (
            <div>
              <dt className="text-[var(--text-muted)]">Engine</dt>
              <dd>{dtc.engine_code}</dd>
            </div>
          )}
        </dl>
      </ResultSection>

      {/* Disclaimer — preserved */}
      <p className="border-t border-[var(--border-subtle)] pt-6 text-xs text-[var(--text-muted)]">
        This information is for diagnostic guidance only and is not a
        substitute for a qualified technician&apos;s in-person inspection.
        Always confirm a cause with the recommended tests before replacing
        parts.
      </p>

      <section className="glass-panel rounded-[var(--radius-xl)] p-6 text-center">
        <p className="text-sm text-[var(--text-secondary)]">
          Want a much larger monthly AI diagnostic allowance?
        </p>
        <Link
          href="/pricing"
          className="mt-3 inline-block min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-2.5 font-semibold text-white transition hover:brightness-110"
          style={{ boxShadow: "var(--shadow-accent)" }}
        >
          Upgrade to Pro
        </Link>
      </section>

      <EmailSignupForm />
    </article>
  );
}
