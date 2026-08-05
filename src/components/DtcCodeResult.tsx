import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { AiDiagnosisCtaLink } from "@/components/AiDiagnosisCtaLink";
import type { DtcCode } from "@/lib/types";
import type { DtcRedactionResult } from "@/lib/dtc-redaction";
import { EmailSignupForm } from "@/components/EmailSignupForm";
import { SeverityBadge } from "@/components/SeverityBadge";
import { SafetyAlert } from "@/components/SafetyAlert";
import { ResultSection } from "@/components/ResultSection";
import { RankedCauseList } from "@/components/RankedCauseList";
import { DiagnosticStepList } from "@/components/DiagnosticStepList";
import { ProfessionalReportUpsell } from "@/components/ProfessionalReportUpsell";
import { LockedResultPanel } from "@/components/LockedResultCard";
import { deriveDtcCodeStructure } from "@/lib/dtc-category";

export function DtcCodeResult({
  dtc,
  redaction,
  signedIn = false,
  safetyWarnings,
  showUntranslatedNote = false,
}: {
  dtc: DtcCode;
  redaction: DtcRedactionResult;
  signedIn?: boolean;
  /** Always derived from the CANONICAL English text by the caller — an
   *  English-keyword regex scanner would silently miss real danger
   *  conditions if run against translated content instead. */
  safetyWarnings: string[];
  /** True only when this locale couldn't be translated (not AI-output
   *  eligible, or the translation attempt fell back to English) — not a
   *  blanket "locale !== en" check, since real translated content now
   *  exists for eligible locales. */
  showUntranslatedNote?: boolean;
}) {
  const t = useTranslations("dtcResult");
  const structure = deriveDtcCodeStructure(dtc.code);
  const isPreview = redaction.accessLevel === "preview";
  const lockedSectionTitle: Record<string, string> = {
    dtcDiagnosticSteps: t("diagnosticChecks"),
    dtcRepairResources: t("repairResourcesLocked"),
  };
  const localizedLockedSections = redaction.lockedSections.map((section) => ({
    key: section.key,
    title: lockedSectionTitle[section.key] ?? section.title,
  }));
  const diagnosticStepsLocked = localizedLockedSections.some((s) => s.key === "dtcDiagnosticSteps");
  const repairResourcesLocked = localizedLockedSections.some((s) => s.key === "dtcRepairResources");

  const DIFFICULTY_LABEL: Record<DtcCode["difficulty"], string> = {
    easy: t("difficultyEasy"),
    moderate: t("difficultyModerate"),
    hard: t("difficultyHard"),
    professional: t("difficultyProfessional"),
  };

  return (
    // container-report, not container-app: this is a diagnostic document,
    // not a dashboard. space-y-12 gives the 48px inter-section rhythm.
    <article data-testid="dtc-result-page" className="container-report space-y-12 px-6 py-12">
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
        {isPreview && (
          <p className="mt-3 text-xs text-[var(--text-muted)]">{t("previewNote")}</p>
        )}
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
        {showUntranslatedNote && (
          <p className="mt-1 text-xs text-[var(--text-muted)]">{t("contentNotLocalizedNote")}</p>
        )}
      </header>

      {/* Category/system — derived from the code's own structure (a public
          standard), not a verified database field, so labeled as such. */}
      {structure.isDerivable && (
        <ResultSection title={t("categoryStructureTitle")}>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{t("categoryLabel")}</dt>
              <dd className="mt-1 font-semibold text-[var(--text-primary)]">{structure.category}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{t("typeLabel")}</dt>
              <dd className="mt-1 font-semibold text-[var(--text-primary)]">{structure.type}</dd>
            </div>
            {structure.system && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{t("likelySystemLabel")}</dt>
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

      {/* Most likely causes — ranked, not scored. The source is an ordered
          string[], so no reasoning or confidence is shown; see
          RankedCauseList for why none is synthesised here. */}
      <div data-testid="most-likely-causes">
        <ResultSection title={t("mostLikelyCauses")}>
          <div className="report-measure space-y-3">
            <RankedCauseList
              causes={dtc.causes.map((cause, i) => ({ rank: i + 1, text: cause }))}
            />
            {redaction.hiddenCausesCount > 0 && (
              <p className="text-sm text-[var(--text-secondary)]">
                {t("moreCausesLocked", { count: redaction.hiddenCausesCount })}{" "}
                <Link href="/pricing" className="font-semibold text-[var(--accent-red)] hover:underline">
                  {t("upgradeButton")}
                </Link>
              </p>
            )}
          </div>
        </ResultSection>
      </div>

      {/* Reported symptoms — the schema has no derived "diagnostic
          evidence" to pair these against, so this stays a single compact
          panel rather than an invented two-column comparison. */}
      {dtc.symptoms.length > 0 && (
        <div data-testid="reported-symptoms">
          <ResultSection title={t("reportedSymptoms")}>
            <ul
              className="report-measure space-y-2 pl-5 text-[var(--text-secondary)]"
              style={{ listStyleType: "disc" }}
            >
              {dtc.symptoms.map((s, i) => (
                <li key={i} className="pl-1">
                  {s}
                </li>
              ))}
            </ul>
          </ResultSection>
        </div>
      )}

      {/* Recommended diagnostic checks */}
      {diagnosticStepsLocked ? (
        <ResultSection title={t("diagnosticChecks")}>
          <LockedResultPanel sections={localizedLockedSections.filter((s) => s.key === "dtcDiagnosticSteps")} />
        </ResultSection>
      ) : (
        dtc.diagnostic_steps.length > 0 && (
          <ResultSection title={t("diagnosticChecks")}>
            <div className="report-measure">
              <DiagnosticStepList
                steps={dtc.diagnostic_steps.map((step, i) => ({ step: i + 1, text: step }))}
              />
            </div>
          </ResultSection>
        )
      )}

      {/* Do not replace these parts yet — common_mistakes is a single prose
          string, so it renders as one caution panel. Splitting it into
          per-part decision rules would require parsing text that has no
          guaranteed structure. */}
      {dtc.common_mistakes && (
        <div data-testid="do-not-replace">
          <ResultSection title="Do not replace these parts yet">
            <p
              className="report-measure rounded-[var(--radius-lg)] border p-5 text-[var(--text-secondary)]"
              style={{ borderColor: "var(--accent-amber)", background: "rgba(217, 154, 63, 0.08)" }}
            >
              {dtc.common_mistakes}
            </p>
          </ResultSection>
        </div>
      )}

      {/* Downloadable / video content */}
      {repairResourcesLocked ? (
        <LockedResultPanel sections={localizedLockedSections.filter((s) => s.key === "dtcRepairResources")} />
      ) : (
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
      )}

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

      {/* One consolidated conversion panel. This replaced a
          LockedResultPanel over LOCKED_SECTION_CATALOG — nine placeholder
          cards, each with skeleton lines and its own "Upgrade" button. Nine
          near-identical CTAs read as a failed load, not an offer. */}
      <ProfessionalReportUpsell signedIn={signedIn} />

      {/* Kept separate from the paid panel above: this is the free
          vehicle-specific intake, not a purchase. */}
      <section className="glass-panel rounded-[var(--radius-xl)] p-6 text-center">
        <p className="text-sm text-[var(--text-secondary)]">{t("upgradeCta")}</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <AiDiagnosisCtaLink
            href={`/diagnostics/quick?code=${encodeURIComponent(dtc.code)}${dtc.make ? `&make=${encodeURIComponent(dtc.make)}` : ""}${dtc.model ? `&model=${encodeURIComponent(dtc.model)}` : ""}&returnTo=${encodeURIComponent(`/dtc/${dtc.slug}`)}`}
            source="known_dtc_page"
            className="inline-block min-h-11 rounded-[var(--radius-md)] border border-[var(--border-red)] px-6 py-2.5 font-semibold text-[var(--text-primary)] transition hover:bg-white/5"
          >
            Start a DTC Technician diagnosis
          </AiDiagnosisCtaLink>
        </div>
      </section>

      <EmailSignupForm />
    </article>
  );
}
