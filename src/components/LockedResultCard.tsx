import Link from "next/link";
import type { LockedSectionRef } from "@/lib/ai-diagnostics/redaction";

function LockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth={1.75}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

// One locked-section placeholder: lock icon, section title, GENERATED
// skeleton lines (never real diagnostic text — see aria-hidden below), and
// an upgrade CTA. No animation on the skeleton lines, so there's nothing
// that needs gating behind prefers-reduced-motion in the first place.
function LockedResultCard({ section }: { section: LockedSectionRef }) {
  return (
    <div className="glass-panel flex flex-col gap-3 rounded-[var(--radius-lg)] p-5">
      <div className="flex items-center gap-2 text-[var(--text-muted)]">
        <LockIcon />
        <p className="text-sm font-semibold text-[var(--text-primary)]">{section.title}</p>
      </div>

      <div aria-hidden="true" className="flex flex-col gap-2">
        <div className="h-2.5 w-full max-w-full rounded-full bg-[var(--border-subtle)]" />
        <div className="h-2.5 w-4/5 max-w-full rounded-full bg-[var(--border-subtle)]" />
        <div className="h-2.5 w-3/5 max-w-full rounded-full bg-[var(--border-subtle)]" />
      </div>
      <span className="sr-only">Full diagnostic section locked. Upgrade to Pro Technician to view it.</span>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Available with Pro Technician
        </p>
        <Link
          href="/pricing"
          className="min-h-11 shrink-0 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-red)]"
        >
          Upgrade
        </Link>
      </div>
    </div>
  );
}

// Full locked-sections panel, laid out responsively (single column on
// narrow/mobile viewports, two columns from `sm` up, never wider than its
// container). Used below a free-tier preview in both AI features.
export function LockedResultPanel({ sections }: { sections: readonly LockedSectionRef[] }) {
  if (sections.length === 0) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {sections.map((section) => (
        <LockedResultCard key={section.key} section={section} />
      ))}
    </div>
  );
}
