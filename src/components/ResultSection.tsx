export function ResultSection({
  title,
  children,
  id,
}: {
  title: string;
  children: React.ReactNode;
  id?: string;
}) {
  if (!children) return null;
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-sm font-semibold tracking-wide text-[var(--text-primary)]">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
