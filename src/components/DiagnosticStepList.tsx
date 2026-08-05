import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

// Numbered diagnostic workflow for the DTC result page.
//
// Source data is `DtcCode.diagnostic_steps: string[]` — one sentence per
// step. The schema carries no tool, test conditions, expected result,
// interpretation, or next action, so this renders the step text and the
// step number and nothing else. Presenting an invented "Tool: bidirectional
// scan tool" or a fabricated expected value would be unsafe advice dressed
// as data.
//
// The shape anticipates that upgrade: `detail` renders beneath the step
// text, so a structured schema can fill it in without changing this
// component's contract. See docs/design/DTC_RESULT_PAGE.md → Phase 2.
export interface DiagnosticStepItem {
  /** 1-based position in the workflow. */
  step: number;
  /** Step text exactly as stored — never rewritten here. */
  text: string;
  /** Optional richer content for a future structured schema. */
  detail?: ReactNode;
}

export function DiagnosticStepList({ steps }: { steps: readonly DiagnosticStepItem[] }) {
  const t = useTranslations("dtcResult");
  if (steps.length === 0) return null;

  return (
    <ol data-testid="diagnostic-workflow" className="space-y-2">
      {steps.map((item) => (
        <li
          key={item.step}
          data-testid={`diagnostic-step-${item.step}`}
          className="flex gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3"
        >
          {/* Number is real text, not a CSS counter, so it survives copy,
              screen readers, and print. */}
          <span
            aria-hidden="true"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] font-mono text-[11px] font-semibold text-[var(--text-muted)]"
          >
            {item.step}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-[var(--text-secondary)]">
              <span className="sr-only">{t("stepSrPrefix", { step: item.step })}</span>
              {item.text}
            </p>
            {item.detail}
          </div>
        </li>
      ))}
    </ol>
  );
}
