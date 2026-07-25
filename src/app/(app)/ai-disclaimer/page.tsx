import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Disclaimer",
};

export default function AiDisclaimerPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-zinc-300">
      <h1 className="text-3xl font-bold text-white">AI Disclaimer</h1>
      <p className="mt-2 text-sm text-zinc-500">Effective Date: July 25, 2026</p>

      <p className="mt-6">
        DTCDecoder uses artificial intelligence to assist with automotive diagnostics. This
        disclaimer explains the limits of that assistance.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Assistance, Not Professional Advice</h2>
      <p className="mt-4">
        AI-generated diagnostic suggestions are informational aids intended to support technicians
        and vehicle owners. They are not a substitute for professional inspection, manufacturer
        service procedures, or the judgment of a qualified technician.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Verification Required</h2>
      <p className="mt-4">
        AI output may contain inaccuracies or incomplete information. All recommendations, test
        values, and procedures should be verified using proper diagnostic testing and official
        service information before acting on them.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">No Guarantee of Results</h2>
      <p className="mt-4">
        We do not guarantee that any AI recommendation will identify or resolve a particular vehicle
        problem. Confidence indicators, likely causes, and suggested tests are estimates, not
        certainties.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Safety</h2>
      <p className="mt-4">
        Automotive repair can involve risk of injury or vehicle damage. Do not attempt any procedure
        you are not qualified to perform safely. Always follow proper safety precautions and
        manufacturer guidance.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">User Responsibility</h2>
      <p className="mt-4">
        You assume full responsibility for any repair, parts-replacement, or diagnostic decision
        made based on information from the platform.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">AI Providers</h2>
      <p className="mt-4">
        Diagnostic information you submit may be processed by our AI provider (Anthropic) to generate
        recommendations. See our{" "}
        <a href="/privacy" className="text-[var(--accent-red)] underline">
          Privacy Policy
        </a>{" "}
        for details on data handling.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Contact</h2>
      <p className="mt-4">
        Email:{" "}
        <a href="mailto:support@dtcdecoder.com" className="text-[var(--accent-red)] underline">
          support@dtcdecoder.com
        </a>
      </p>
    </div>
  );
}
