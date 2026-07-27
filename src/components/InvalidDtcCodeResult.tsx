import Link from "next/link";

// Shown for a submitted code that doesn't match the DTC format at all
// (not P/B/C/U followed by 3-4 digits) — distinct from UnknownDtcResult
// (valid format, just not in our database yet). This page never queries
// the database and never touches basic-search quota; there is nothing to
// look up. English-only, same scoping note as UnknownDtcResult.tsx.
export function InvalidDtcCodeResult({ code }: { code: string }) {
  return (
    <div>
      <div
        role="alert"
        className="glass-panel rounded-[var(--radius-xl)] border-2 p-6 sm:p-8"
        style={{ borderColor: "var(--accent-amber)" }}
      >
        <p className="font-mono text-sm text-[var(--text-muted)]">&ldquo;{code}&rdquo;</p>
        <h1 className="mt-1 text-xl font-bold text-[var(--text-primary)]">That doesn&apos;t look like a valid DTC code</h1>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          A diagnostic trouble code starts with P, B, C, or U followed by 3 or 4 digits — for example P0420,
          B1600, C0035, or U0101. Double-check the code and try again.
        </p>
      </div>

      <Link
        href="/dtc"
        className="mt-6 inline-block min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-2.5 font-semibold text-white transition hover:brightness-110"
        style={{ boxShadow: "var(--shadow-accent)" }}
      >
        Search again
      </Link>
    </div>
  );
}
