import Link from "next/link";
import { useTranslations } from "next-intl";
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
// knowledge) or a static, generic recommendation.
export function UnknownDtcResult({ code, relatedCodes }: { code: string; relatedCodes: DtcCode[] }) {
  const t = useTranslations("dtcUnknown");
  const tResult = useTranslations("dtcResult");
  const tLocked = useTranslations("lockedSections");
  const structure = deriveDtcCodeStructure(code);
  const localizedLockedSections = LOCKED_SECTION_CATALOG.map((section) => ({
    key: section.key,
    title: tLocked(section.key),
  }));
  const fields = [
    t("fieldYear"),
    t("fieldMake"),
    t("fieldModel"),
    t("fieldEngine"),
    t("fieldModule"),
    t("fieldSymptoms"),
  ];

  return (
    <div className="space-y-10">
      <header className="glass-panel rounded-[var(--radius-xl)] p-6 sm:p-8">
        <p className="font-mono text-sm tracking-widest text-[var(--accent-red)]">{code}</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">{t("heading")}</h1>
        <p className="mt-3 text-[var(--text-secondary)]">{t("body", { code })}</p>
      </header>

      {structure.isDerivable && (
        <ResultSection title={t("codeStructureTitle")}>
          <div className="glass-panel rounded-[var(--radius-lg)] p-5">
            <p className="text-xs text-[var(--text-muted)]">{t("codeStructureNote")}</p>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{tResult("categoryLabel")}</dt>
                <dd className="mt-1 font-semibold text-[var(--text-primary)]">{structure.category}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{tResult("typeLabel")}</dt>
                <dd className="mt-1 font-semibold text-[var(--text-primary)]">{structure.type}</dd>
              </div>
              {structure.system && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{tResult("likelySystemLabel")}</dt>
                  <dd className="mt-1 font-semibold text-[var(--text-primary)]">{structure.system}</dd>
                </div>
              )}
            </dl>
            {structure.type === "Manufacturer-specific" && (
              <p className="mt-4 rounded-[var(--radius-md)] border p-3 text-xs text-[var(--text-secondary)]" style={{ borderColor: "var(--accent-amber)", background: "rgba(217, 154, 63, 0.08)" }}>
                {t("manufacturerSpecificWarning")}
              </p>
            )}
          </div>
        </ResultSection>
      )}

      <ResultSection title={t("accurateAnswerTitle")}>
        <div className="glass-panel rounded-[var(--radius-lg)] p-5">
          <p className="text-sm text-[var(--text-secondary)]">{t("accurateAnswerBody")}</p>
          <ul className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
            {fields.map((field) => (
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
            {t("runFullAiDiagnosis")}
          </AiDiagnosisCtaLink>
        </div>
      </ResultSection>

      {relatedCodes.length > 0 && (
        <ResultSection title={t("relatedCodesTitle")}>
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

      <ResultSection title={t("beforeYouDriveTitle")}>
        <div role="alert" className="rounded-[var(--radius-lg)] border-2 p-5" style={{ borderColor: "var(--accent-red)", background: "rgba(225, 29, 46, 0.1)" }}>
          <p className="text-sm text-[var(--text-secondary)]">{t("beforeYouDriveBody")}</p>
        </div>
      </ResultSection>

      <section>
        <Link
          href="/videos"
          className="hover-lift glass-panel flex items-center justify-center gap-2 rounded-[var(--radius-lg)] p-5 text-center font-semibold text-[var(--text-primary)]"
        >
          {t("browseRepairVideos")}
        </Link>
      </section>

      <ResultSection title={t("unlockFullAiDiagnosisTitle")}>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">{t("unlockFullAiDiagnosisBody")}</p>
        <LockedResultPanel sections={localizedLockedSections} />
      </ResultSection>
    </div>
  );
}
