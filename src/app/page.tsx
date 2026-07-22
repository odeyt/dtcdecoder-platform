import Link from "next/link";
import { HeroSearch } from "@/components/HeroSearch";
import { EmailSignupForm } from "@/components/EmailSignupForm";

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="container-app px-6 pt-24 pb-20 text-center">
        <p className="text-xs font-semibold tracking-[0.2em] text-[var(--accent-red)]">
          AI-POWERED VEHICLE DIAGNOSTICS
        </p>
        <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-5xl md:text-6xl">
          Understand what your vehicle is telling you.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-[var(--text-secondary)] sm:text-lg">
          Decode trouble codes, assess likely causes, and follow a safer
          diagnostic path before replacing parts.
        </p>

        <div className="mt-10">
          <HeroSearch />
        </div>
      </section>

      {/* Monetization */}
      <section className="container-app px-6 py-16">
        <div className="grid gap-6 md:grid-cols-2">
          <div
            className="rounded-[var(--radius-xl)] border border-[var(--border-red)] bg-[var(--surface-burgundy)] p-8"
            style={{ boxShadow: "var(--shadow-accent)" }}
          >
            <h2 className="text-xl font-bold text-[var(--text-primary)]">
              Need the complete professional repair workflow?
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Download the full Master Diagnostic PDF with wiring checks, scan
              tool data, testing steps, and repair direction.
            </p>
            <a
              href="https://gumroad.com"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-block min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-2.5 font-semibold text-white transition hover:brightness-110"
            >
              Get Repair PDF
            </a>
          </div>
          <div className="glass-panel rounded-[var(--radius-xl)] p-8">
            <h2 className="text-xl font-bold text-[var(--text-primary)]">
              Watch real diagnostic walkthroughs and technician case studies.
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Full teardown-to-repair videos on every major fault code.
            </p>
            <a
              href="https://youtube.com"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-block min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-6 py-2.5 font-semibold text-[var(--text-primary)] transition hover:bg-white/5"
            >
              Watch on YouTube
            </a>
          </div>
        </div>

        <div className="mt-6">
          <EmailSignupForm />
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="container-app px-6 py-16 text-center">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">
          Free to start. A lot more when you need it.
        </h2>
        <p className="mt-2 text-[var(--text-secondary)]">
          Pro Technician and Workshop plans unlock a much larger monthly AI
          allowance — save $30 on the yearly plan.
        </p>
        <Link
          href="/pricing"
          className="mt-6 inline-block min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-3 font-semibold text-white transition hover:brightness-110"
          style={{ boxShadow: "var(--shadow-accent)" }}
        >
          See Pricing
        </Link>
      </section>
    </div>
  );
}
