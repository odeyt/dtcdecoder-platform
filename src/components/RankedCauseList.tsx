import type { ReactNode } from "react";

// Compact ranked-cause rows for the DTC result page.
//
// The underlying data is `DtcCode.causes: string[]` — an admin-curated
// ordered list, most common first. There is no per-cause reasoning,
// confirmation test, or confidence score anywhere in the schema, so none is
// shown: inventing "why it ranks first" text in the frontend would be
// fabricated diagnostic advice, which is exactly what this codebase refuses
// to do elsewhere (see CauseCard's original comment, and
// DiagnosticStepList).
//
// The row is deliberately shaped so those fields can be added later without
// a rewrite: `detail` accepts arbitrary content rendered beneath the cause
// text, and `RankedCauseItem` can grow optional fields. See
// docs/design/DTC_RESULT_PAGE.md → Phase 2.
//
// Replaces the previous CauseCard, whose glass-panel-per-sentence layout
// gave a one-line cause the same vertical weight as a full section.
export interface RankedCauseItem {
  /** 1-based rank as curated in the source data. */
  rank: number;
  /** The cause text exactly as stored — never reworded here. */
  text: string;
  /** Optional richer content for a future structured schema. */
  detail?: ReactNode;
}

function RankBadge({ rank }: { rank: number }) {
  const isTop = rank === 1;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[11px] font-semibold leading-none"
      style={{ color: isTop ? "var(--accent-red)" : "var(--text-muted)" }}
    >
      {/* The number is the rank. The badge below is supplementary, so rank
          is never conveyed by colour or badge alone. */}
      <span
        className="inline-flex h-5 min-w-5 items-center justify-center rounded px-1"
        style={{
          border: `1px solid ${isTop ? "var(--accent-red)" : "var(--border-subtle)"}`,
        }}
      >
        #{rank}
      </span>
      {isTop && <span className="uppercase tracking-wide">Most likely</span>}
    </span>
  );
}

export function RankedCauseList({ causes }: { causes: readonly RankedCauseItem[] }) {
  if (causes.length === 0) return null;

  return (
    <ol data-testid="ranked-cause-list" className="space-y-2">
      {causes.map((cause) => {
        const isTop = cause.rank === 1;
        return (
          <li
            key={cause.rank}
            data-testid={`ranked-cause-${cause.rank}`}
            // Lower ranks are quieter: no filled panel, just a hairline
            // rule. Only #1 gets a surface, which is what makes it read as
            // the primary answer without a taller card.
            className={
              isTop
                ? "glass-panel flex flex-col gap-1.5 rounded-[var(--radius-md)] p-3.5 sm:flex-row sm:items-baseline sm:gap-3"
                : "flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3 sm:flex-row sm:items-baseline sm:gap-3"
            }
          >
            <RankBadge rank={cause.rank} />
            <div className="min-w-0 flex-1">
              <p
                className={
                  isTop
                    ? "text-[var(--text-primary)]"
                    : "text-sm text-[var(--text-secondary)]"
                }
              >
                {cause.text}
              </p>
              {cause.detail}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
