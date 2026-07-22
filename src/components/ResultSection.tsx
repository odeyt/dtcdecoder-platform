export function ResultSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  if (!children) return null;
  return (
    <section>
      <h2 className="text-sm font-semibold tracking-wide text-[var(--text-primary)]">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
