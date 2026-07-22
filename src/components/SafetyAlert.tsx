export function SafetyAlert({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;

  return (
    <div
      role="alert"
      className="rounded-[var(--radius-lg)] border-2 p-5"
      style={{ borderColor: "var(--accent-red)", background: "rgba(225, 29, 46, 0.1)" }}
    >
      <p className="font-mono text-xs font-bold uppercase tracking-wide text-[var(--accent-red)]">
        Stop and assess before continuing to drive
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {warnings.map((w) => (
          <li
            key={w}
            className="rounded-full border border-[var(--accent-red)] px-3 py-1 text-xs font-semibold text-[var(--text-primary)]"
          >
            {w}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-[var(--text-secondary)]">
        This code is associated with a condition that can cause serious
        vehicle damage or a safety risk. If you&apos;re experiencing this now,
        consider having the vehicle inspected before continuing to drive it.
      </p>
    </div>
  );
}
