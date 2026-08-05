import { useTranslations } from "next-intl";

// detectSafetyWarnings() (src/lib/safety-warnings.ts) returns these exact
// English labels as stable identifiers — they're matched here to pick a
// translation, never altered at the source, since nothing about the
// underlying detection logic changes.
const WARNING_LABEL_KEYS: Record<string, string> = {
  Overheating: "overheating",
  "Oil pressure loss": "oilPressureLoss",
  "Brake failure": "brakeFailure",
  "Fuel leakage": "fuelLeakage",
  "Smoke or fire risk": "smokeOrFireRisk",
  "Severe engine knocking": "severeEngineKnocking",
  "Loss of steering": "lossOfSteering",
  "Flashing check-engine light": "flashingCheckEngineLight",
};

export function SafetyAlert({ warnings }: { warnings: string[] }) {
  const t = useTranslations("safetyAlert");
  if (warnings.length === 0) return null;

  return (
    <div
      role="alert"
      className="rounded-[var(--radius-lg)] border-2 p-5"
      style={{ borderColor: "var(--accent-red)", background: "rgba(225, 29, 46, 0.1)" }}
    >
      <p className="font-mono text-xs font-bold uppercase tracking-wide text-[var(--accent-red)]">
        {t("heading")}
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {warnings.map((w) => (
          <li
            key={w}
            className="rounded-full border border-[var(--accent-red)] px-3 py-1 text-xs font-semibold text-[var(--text-primary)]"
          >
            {WARNING_LABEL_KEYS[w] ? t(WARNING_LABEL_KEYS[w]) : w}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-[var(--text-secondary)]">{t("body")}</p>
    </div>
  );
}
