import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-zinc-300">
      <h1 className="text-3xl font-bold text-white">DTCDecoder Privacy Policy</h1>
      <p className="mt-2 text-sm text-zinc-500">Effective Date: July 25, 2026</p>

      <p className="mt-6">
        This Privacy Policy explains how DTCDecoder (&quot;Company,&quot; &quot;we,&quot; &quot;our,&quot;
        or &quot;us&quot;) collects, uses, and shares information when you use our website, software, AI
        diagnostic tools, and related services (the &quot;Services&quot;).
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">1. Information We Collect</h2>
      <p className="mt-4">
        <strong className="text-white">Account and contact information:</strong> the email address you
        provide when signing up for diagnostic tips, creating an account, or subscribing to a paid plan.
      </p>
      <p className="mt-4">
        <strong className="text-white">Diagnostic content you submit:</strong> messages you send to the AI
        diagnostic assistant, and vehicle scan-tool reports you upload for AI-assisted analysis (including
        any vehicle identification, fault codes, freeze-frame/live data, and technician notes contained in
        those uploads).
      </p>
      <p className="mt-4">
        <strong className="text-white">Usage and billing metadata:</strong> which plan you&apos;re on, how
        many AI diagnostic previews or reports you&apos;ve used, and subscription status. We do not
        collect or store your payment card details — those are handled entirely by our payment processor.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">2. How We Use Information</h2>
      <p className="mt-4">
        We use this information to operate your account, deliver the diagnostic content and AI analysis
        you request, enforce plan usage limits, send content you&apos;ve asked for, and provide customer
        support. We do not sell your personal information to third parties.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">3. Third-Party Service Providers</h2>
      <p className="mt-4">
        We share information with the following service providers, only as needed to operate the Services:
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>
          <strong className="text-white">Anthropic</strong> (the maker of Claude) — the diagnostic
          questions and vehicle/scan-report content you submit are sent to Anthropic&apos;s API to
          generate the AI diagnostic analysis. We do not send your account email or payment information to
          Anthropic.
        </li>
        <li>
          <strong className="text-white">Creem.io</strong> — processes subscription payments. We share
          your email and subscription plan/interval with Creem to create and manage checkout and billing;
          Creem handles your payment card details directly and we never receive or store them.
        </li>
        <li>
          <strong className="text-white">Supabase</strong> — provides our database, passwordless
          authentication, and file storage. Your account data, uploaded scan files, and diagnostic content
          are stored on Supabase&apos;s infrastructure.
        </li>
      </ul>

      <h2 className="mt-10 text-xl font-bold text-white">4. Cookies and Similar Technologies</h2>
      <p className="mt-4">
        We use essential cookies to keep you signed in and to remember basic preferences (such as
        language). We do not use third-party advertising trackers.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">5. Data Retention</h2>
      <p className="mt-4">
        We retain account, diagnostic, and usage data for as long as your account is active, and for a
        reasonable period afterward for legal, billing, and record-keeping purposes. You may request
        deletion of your account and associated data at any time (see below).
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">6. Your Rights and Choices</h2>
      <p className="mt-4">
        You may request access to, correction of, or deletion of your personal information by contacting
        us at{" "}
        <a href="mailto:support@dtcdecoder.com" className="text-[var(--accent-red)] underline">
          support@dtcdecoder.com
        </a>
        . If you cancel a paid subscription, we retain billing records as required by law even if you
        later request account deletion.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">7. Data Security</h2>
      <p className="mt-4">
        We use industry-standard safeguards — including encrypted storage, access controls limiting
        uploaded files and diagnostic data to their owning account, and short-lived signed URLs for file
        downloads — to protect your information. No method of transmission or storage is 100% secure, and
        we cannot guarantee absolute security.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">8. Children&apos;s Privacy</h2>
      <p className="mt-4">
        The Services are not directed to children under 13, and we do not knowingly collect personal
        information from children under 13.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">9. Changes to This Policy</h2>
      <p className="mt-4">
        We may update this Privacy Policy from time to time. Material changes will be reflected by an
        updated &quot;Effective Date&quot; above.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">10. Contact Us</h2>
      <p className="mt-4">
        Questions about this Privacy Policy or your data? Contact us at{" "}
        <a href="mailto:support@dtcdecoder.com" className="text-[var(--accent-red)] underline">
          support@dtcdecoder.com
        </a>{" "}
        or via our Contact page.
      </p>
    </div>
  );
}
