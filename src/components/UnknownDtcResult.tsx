import Link from "next/link";
import { AiDiagnosisCtaLink } from "@/components/AiDiagnosisCtaLink";
import { ResultSection } from "@/components/ResultSection";
import { LockedResultPanel } from "@/components/LockedResultCard";
import { LOCKED_SECTION_CATALOG } from "@/lib/ai-diagnostics/redaction";
import { deriveDtcCodeStructure } from "@/lib/dtc-category";
import type { DtcCode } from "@/lib/types";

// Shown for a syntactically valid DTC code that isn't in the local
// database yet — deliberately never calls an AI provider to fill the gap;
// everything here is either derived from the code's own structure (SAE
// J2012's public letter/digit convention, not manufacturer-specific
// knowledge) or a static, generic recommendation. English-only for now,
// same scoping as LockedResultCard.tsx elsewhere in this app — full
// localization of this net-new page is a follow-up, not done here given
// the size of everything else in this pass.
export function UnknownDtcResult({ code, relatedCodes }: { code: string; relatedCodes: DtcCode[] }) {
  const structure = deriveDtcCodeStructure(code);

  return (
    <div className="space-y-10">
      <header className="glass-panel rounded-[var(--radius-xl)] p-6 sm:p-8">
        <p className="font-mono text-sm tracking-widest text-[var(--accent-red)]">{code}</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
          This code is not currently available in the basic DTC database.
        </h1>
        <p className="mt-3 text-[var(--text-secondary)]">
          We haven&apos;t published a detailed entry for {code} yet. Here&apos;s what we can tell you from the code
          itself, and how to get a full, vehicle-specific diagnosis.
        </p>
      </header>

      {structure.isDerivable && (
        <ResultSection title="Code structure (inferred, not vehicle-verified)">
          <div className="glass-panel rounded-[var(--radius-lg)] p-5">
            <p className="text-xs text-[var(--text-muted)]">
              The fields below are derived from the code&apos;s own format (a public automotive standard), not from
              our verified database — they describe the general code family, not this specific vehicle.
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Category</dt>
                <dd className="mt-1 font-semibold text-[var(--text-primary)]">{structure.category}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Type</dt>
                <dd className="mt-1 font-semibold text-[var(--text-primary)]">{structure.type}</dd>
              </div>
              {structure.system && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Likely system</dt>
                  <dd className="mt-1 font-semibold text-[var(--text-primary)]">{structure.system}</dd>
                </div>
              )}
            </dl>
            {structure.type === "Manufacturer-specific" && (
              <p className="mt-4 rounded-[var(--radius-md)] border p-3 text-xs text-[var(--text-secondary)]" style={{ borderColor: "var(--accent-amber)", background: "rgba(217, 154, 63, 0.08)" }}>
                This code&apos;s digit pattern indicates a manufacturer-specific definition — its exact meaning varies
                by make and sometimes by model/year. Add your vehicle&apos;s make and model below for an accurate,
                vehicle-specific diagnosis instead of a generic guess.
              </p>
            )}
          </div>
        </ResultSection>
      )}

      <ResultSection title="Get an accurate answer for your vehicle">
        <div className="glass-panel rounded-[var(--radius-lg)] p-5">
          <p className="text-sm text-[var(--text-secondary)]">
            Add a few details and an AI diagnostic report can analyze this exact code for your specific vehicle:
          </p>
          <ul className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
            {["Year", "Make", "Model", "Engine", "Module", "Symptoms"].map((field) => (
              <li key={field} className="rounded-full border border-[var(--border-subtle)] px-3 py-1">
                {field}
              </li>
            ))}
          </ul>
          <AiDiagnosisCtaLink
            href={`/diagnostics/quick?code=${encodeURIComponent(code)}&returnTo=${encodeURIComponent(`/dtc/${code.toLowerCase()}`)}`}
            source="unknown_dtc_page"
            className="mt-4 inline-block min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-2.5 font-semibold text-white transition hover:brightness-110"
            style={{ boxShadow: "var(--shadow-accent)" }}
          >
            Run Full AI Diagnosis
          </AiDiagnosisCtaLink>
        </div>
      </ResultSection>

      {relatedCodes.length > 0 && (
        <ResultSection title="Related codes in the same family">
          <ul className="space-y-2">
            {relatedCodes.map((related) => (
              <li key={related.id}>
                <Link
                  href={`/dtc/${related.slug}`}
                  className="hover-lift glass-panel flex items-center justify-between gap-4 rounded-[var(--radius-lg)] p-4"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-[var(--accent-red)]">{related.code}</p>
                    <p className="mt-1 font-semibold text-[var(--text-primary)]">{related.title}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </ResultSection>
      )}

      <ResultSection title="Before you drive">
        <div role="alert" className="rounded-[var(--radius-lg)] border-2 p-5" style={{ borderColor: "var(--accent-red)", background: "rgba(225, 29, 46, 0.1)" }}>
          <p className="text-sm text-[var(--text-secondary)]">
            Any stored trouble code can indicate a condition that affects safe operation. If your vehicle is showing
            other warning signs (loss of power, unusual noises, warning lights beyond the check engine light,
            overheating, or handling changes), have it inspected before continuing to drive.
          </p>
        </div>
      </ResultSection>

      <section className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/repair-pdfs"
          className="hover-lift flex items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-[var(--border-red)] bg-[var(--surface-burgundy)] p-5 text-center font-semibold text-[var(--text-primary)]"
          style={{ boxShadow: "var(--shadow-accent)" }}
        >
          Browse repair PDFs
        </Link>
        <Link
          href="/videos"
          className="hover-lift glass-panel flex items-center justify-center gap-2 rounded-[var(--radius-lg)] p-5 text-center font-semibold text-[var(--text-primary)]"
        >
          Browse repair videos
        </Link>
      </section>

      <ResultSection title="Unlock Full AI Diagnosis">
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          Add your vehicle details and symptoms to receive a professional diagnostic workflow.
        </p>
        <LockedResultPanel sections={LOCKED_SECTION_CATALOG} />
      </ResultSection>
    </div>
  );
}
