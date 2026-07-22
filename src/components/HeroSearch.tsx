import Link from "next/link";

const SUGGESTIONS = ["P0420", "P0171", "U0101", "P0300", "No crank", "Limp mode"];

export function HeroSearch() {
  return (
    <div className="mx-auto w-full max-w-[900px]">
      <form action="/dtc" method="get" role="search">
        <label htmlFor="hero-search" className="sr-only">
          Enter a DTC code, symptom, or vehicle issue
        </label>
        <div
          className="group flex items-center gap-2 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-1)]/90 p-2.5 pl-5 backdrop-blur-xl transition focus-within:border-[var(--border-red)]"
          style={{ boxShadow: "var(--shadow-ambient)" }}
        >
          <svg
            aria-hidden="true"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            className="shrink-0 text-[var(--text-muted)] transition group-focus-within:text-[var(--accent-red)]"
          >
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            id="hero-search"
            type="text"
            name="q"
            autoComplete="off"
            placeholder="Enter P0300, ‘rough idle,’ or describe what the vehicle is doing"
            className="min-h-[60px] flex-1 bg-transparent text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none sm:text-lg"
          />
          <button
            type="submit"
            className="min-h-11 shrink-0 rounded-[var(--radius-lg)] bg-[var(--accent-red)] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110 sm:px-8 sm:py-4 sm:text-base"
            style={{ boxShadow: "var(--shadow-accent)" }}
          >
            Decode
          </button>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((s) => (
          <Link
            key={s}
            href={`/dtc?q=${encodeURIComponent(s)}`}
            className="min-h-11 rounded-full border border-[var(--border-subtle)] px-3 py-1.5 font-mono text-xs text-[var(--text-secondary)] transition hover:border-[var(--border-red)] hover:text-[var(--text-primary)] sm:text-sm"
          >
            {s}
          </Link>
        ))}
      </div>

      <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
        AI-assisted diagnostics grounded in verified reference data · Signed-in
        searches are saved to your history
      </p>
    </div>
  );
}
