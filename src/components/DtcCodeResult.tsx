import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { AiDiagnosisCtaLink } from "@/components/AiDiagnosisCtaLink";
import type { DtcCode } from "@/lib/types";
import { EmailSignupForm } from "@/components/EmailSignupForm";
import { SeverityBadge } from "@/components/SeverityBadge";
import { SafetyAlert } from "@/components/SafetyAlert";
import { ResultSection } from "@/components/ResultSection";
import { CauseCard } from "@/components/CauseCard";
import { LockedResultPanel } from "@/components/LockedResultCard";
import { LOCKED_SECTION_CATALOG } from "@/lib/ai-diagnostics/redaction";
import { detectSafetyWarnings } from "@/lib/safety-warnings";
import { deriveDtcCodeStructure } from "@/lib/dtc-category";

export function DtcCodeResult({ dtc }: { dtc: DtcCode }) {
  const t = useTranslations("dtcResult");
  const locale = useLocale();
  const structure = deriveDtcCodeStructure(dtc.code);

  const DIFFICULTY_LABEL: Record<DtcCode["difficulty"], string> = {
    easy: t("difficultyEasy"),
    moderate: t("difficultyModerate"),
    hard: t("difficultyHard"),
    professional: t("difficultyProfessional"),
  };

  const warningText = [dtc.meaning, dtc.symptoms.join(" "), dtc.causes.join(" "), dtc.drive_recommendation ?? ""].join(" ");
  const safetyWarnings = detectSafetyWarnings(warningText);

  return (
    <article className="container-app space-y-10 px-6 py-12">
      {/* Summary */}
      <header className="glass-panel rounded-[var(--radius-xl)] p-6 sm:p-8">
        <p className="font-mono text-sm tracking-widest text-[var(--accent-red)]">
          {dtc.code}
          {dtc.make ? ` · ${dtc.make.toUpperCase()}` : ` · ${t("generic")}`}
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
        <p className="mt-4 text-xs text-[var(--text-muted)]">{t("sourcedFrom")}</p>
        {locale !== "en" && (
          <p className="mt-1 text-xs text-[var(--text-muted)]">{t("contentNotLocalizedNote")}</p>
        )}
      </header>

      {/* Category/system — derived from the code's own structure (a public
          standard), not a verified database field, so labeled as such. */}
      {structure.isDerivable && (
        <ResultSection title="Category (inferred from code structure)">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
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
        </ResultSection>
      )}

      {/* Immediate safety guidance */}
      <SafetyAlert warnings={safetyWarnings} />
      {dtc.drive_recommendation && (
        <ResultSection title={t("driveRecommendation")}>
          <p className="text-sm text-[var(--text-secondary)]">{dtc.drive_recommendation}</p>
        </ResultSection>
      )}

      {/* Most likely causes */}
      <ResultSection title={t("mostLikelyCauses")}>
        <div className="space-y-2">
          {dtc.causes.map((cause, i) => (
            <CauseCard key={i} cause={cause} rank={i + 1} />
          ))}
        </div>
      </ResultSection>

      {/* Evidence from reported symptoms */}
      <ResultSection title={t("reportedSymptoms")}>
        <ul className="space-y-1 pl-5 text-sm text-[var(--text-secondary)]" style={{ listStyleType: "disc" }}>
          {dtc.symptoms.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </ResultSection>

      {/* Recommended diagnostic checks */}
      <ResultSection title={t("diagnosticChecks")}>
        <ol className="space-y-1 pl-5 text-sm text-[var(--text-secondary)]" style={{ listStyleType: "decimal" }}>
          {dtc.diagnostic_steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </ResultSection>

      {/* What not to replace yet */}
      {dtc.common_mistakes && (
        <ResultSection title={t("commonMistakes")}>
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
            className="hover-lift flex items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-[var(--border-red)] bg-[var(--surface-burgundy)] p-5 text-center font-semibold text-[var(--text-primary)]"
            style={{ boxShadow: "var(--shadow-accent)" }}
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {t("getRepairPdf")}
          </a>
        )}
        {dtc.youtube_url && (
          <a
            href={dtc.youtube_url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover-lift glass-panel flex items-center justify-center gap-2 rounded-[var(--radius-lg)] p-5 text-center font-semibold text-[var(--text-primary)]"
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M8 5v14l11-7z" fill="currentColor" />
            </svg>
            {t("watchWalkthrough")}
          </a>
        )}
      </section>

      {/* FAQ */}
      {dtc.faq.length > 0 && (
        <ResultSection title={t("faq")}>
          <div className="space-y-3">
            {dtc.faq.map((entry, i) => (
              <div key={i} className="hover-lift glass-panel rounded-[var(--radius-lg)] p-4">
                <p className="font-medium text-[var(--text-primary)]">{entry.q}</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{entry.a}</p>
              </div>
            ))}
          </div>
        </ResultSection>
      )}

      {/* Technical details */}
      <ResultSection title={t("technicalDetails")}>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-xs text-[var(--text-secondary)] sm:grid-cols-4">
          <div>
            <dt className="text-[var(--text-muted)]">{t("code")}</dt>
            <dd>{dtc.code}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">{t("make")}</dt>
            <dd>{dtc.make ?? t("generic")}</dd>
          </div>
          {dtc.model && (
            <div>
              <dt className="text-[var(--text-muted)]">{t("model")}</dt>
              <dd>{dtc.model}</dd>
            </div>
          )}
          {dtc.engine_code && (
            <div>
              <dt className="text-[var(--text-muted)]">{t("engine")}</dt>
              <dd>{dtc.engine_code}</dd>
            </div>
          )}
        </dl>
      </ResultSection>

      {/* Disclaimer — preserved */}
      <p className="border-t border-[var(--border-subtle)] pt-6 text-xs text-[var(--text-muted)]">
        {t("disclaimer")}
      </p>

      <ResultSection title="Unlock Full AI Diagnosis">
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          Add your vehicle details and symptoms to receive a professional diagnostic workflow.
        </p>
        <LockedResultPanel sections={LOCKED_SECTION_CATALOG} />
      </ResultSection>

      <section className="glass-panel rounded-[var(--radius-xl)] p-6 text-center">
        <p className="text-sm text-[var(--text-secondary)]">{t("upgradeCta")}</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          <AiDiagnosisCtaLink
            href={`/diagnostics/quick?code=${encodeURIComponent(dtc.code)}${dtc.make ? `&make=${encodeURIComponent(dtc.make)}` : ""}${dtc.model ? `&model=${encodeURIComponent(dtc.model)}` : ""}&returnTo=${encodeURIComponent(`/dtc/${dtc.slug}`)}`}
            source="known_dtc_page"
            className="inline-block min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-2.5 font-semibold text-white transition hover:brightness-110"
            style={{ boxShadow: "var(--shadow-accent)" }}
          >
            Run Full AI Diagnosis
          </AiDiagnosisCtaLink>
          <Link
            href="/pricing"
            className="inline-block min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-6 py-2.5 font-semibold text-[var(--text-primary)] transition hover:bg-white/5"
          >
            {t("upgradeButton")}
          </Link>
        </div>
      </section>

      <EmailSignupForm />
    </article>
  );
}
