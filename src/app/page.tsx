import Link from "next/link";
import { EmailSignupForm } from "@/components/EmailSignupForm";

const EXAMPLE_CHIPS = [
  "P0420",
  "P0171",
  "U0101",
  "P0300",
  "P2263",
  "No crank",
  "Limp mode",
  "Transmission fault",
];

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pt-20 pb-16 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
          <span className="text-red-500">DTC</span> Decoder
        </h1>
        <p className="mt-3 text-lg font-medium text-zinc-300">
          AI-Powered Automotive Diagnostic Intelligence
        </p>
        <p className="mx-auto mt-4 max-w-2xl text-zinc-400">
          Instantly decode fault codes, understand symptoms, find common causes,
          and follow professional diagnostic steps before replacing parts.
        </p>

        <form action="/dtc" className="mx-auto mt-8 flex max-w-xl gap-2">
          <input
            type="text"
            name="q"
            placeholder="Enter DTC code, symptom, or vehicle issue..."
            className="flex-1 rounded-full border border-white/10 bg-black/40 px-5 py-3 text-white placeholder:text-zinc-500 backdrop-blur-md"
          />
          <button
            type="submit"
            className="rounded-full bg-red-600 px-6 py-3 font-semibold text-white shadow-[0_0_20px_rgba(255,30,45,0.35)] transition hover:bg-red-500"
          >
            Decode
          </button>
        </form>

        <div className="mx-auto mt-4 flex max-w-xl flex-wrap justify-center gap-2">
          {EXAMPLE_CHIPS.map((chip) => (
            <Link
              key={chip}
              href={`/dtc?q=${encodeURIComponent(chip)}`}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300 transition hover:bg-white/10"
            >
              {chip}
            </Link>
          ))}
        </div>

        <div className="mx-auto mt-10 flex max-w-2xl flex-wrap justify-center gap-3">
          <Link
            href="/dtc"
            className="rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(255,30,45,0.35)] transition hover:bg-red-500"
          >
            Decode DTC Now
          </Link>
          <Link
            href="/ai-assistant"
            className="rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/10"
          >
            Use AI Diagnostic Assistant
          </Link>
          <Link
            href="/repair-pdfs"
            className="rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/10"
          >
            Download Repair PDFs
          </Link>
          <Link
            href="/videos"
            className="rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/10"
          >
            Watch Repair Videos
          </Link>
        </div>
      </section>

      {/* Monetization */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-600/10 to-transparent p-8 backdrop-blur-md">
            <h2 className="text-xl font-bold text-white">
              Need the complete professional repair workflow?
            </h2>
            <p className="mt-2 text-sm text-zinc-300">
              Download the full Master Diagnostic PDF with wiring checks, scan
              tool data, testing steps, and repair direction.
            </p>
            <a
              href="https://gumroad.com"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-block rounded-full bg-red-600 px-6 py-2 font-semibold text-white shadow-[0_0_20px_rgba(255,30,45,0.35)] transition hover:bg-red-500"
            >
              Get Repair PDF
            </a>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-md">
            <h2 className="text-xl font-bold text-white">
              Watch real diagnostic walkthroughs and technician case studies.
            </h2>
            <p className="mt-2 text-sm text-zinc-300">
              Full teardown-to-repair videos on every major fault code.
            </p>
            <a
              href="https://youtube.com"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-block rounded-full border border-white/20 px-6 py-2 font-semibold text-white transition hover:bg-white/10"
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
      <section className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h2 className="text-2xl font-bold text-white">
          Free to start. A lot more when you need it.
        </h2>
        <p className="mt-2 text-zinc-400">
          Pro Technician and Workshop plans unlock a much larger monthly AI allowance — save $30 on the yearly plan.
        </p>
        <Link
          href="/pricing"
          className="mt-6 inline-block rounded-full bg-red-600 px-6 py-3 font-semibold text-white shadow-[0_0_20px_rgba(255,30,45,0.35)] transition hover:bg-red-500"
        >
          See Pricing
        </Link>
      </section>
    </div>
  );
}
