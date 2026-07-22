import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-zinc-300">
      <h1 className="text-3xl font-bold text-white">Terms of Service</h1>
      <p className="mt-6">
        DTC Decoder provides diagnostic information, an AI assistant, and links
        to third-party repair guides and videos for informational purposes
        only. Content is not a substitute for a qualified technician&apos;s
        in-person diagnosis, and we are not liable for repairs performed based
        on information from this site.
      </p>
      <p className="mt-4">
        Subscriptions renew automatically until canceled. You can cancel at any
        time; access continues through the end of the current billing period.
      </p>
      <p className="mt-4">
        Always test before replacing parts. Never disable safety systems based
        solely on AI-generated guidance.
      </p>
    </div>
  );
}
