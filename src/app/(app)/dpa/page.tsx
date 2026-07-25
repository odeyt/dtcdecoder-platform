import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data Processing Addendum",
};

export default function DpaPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-zinc-300">
      <h1 className="text-3xl font-bold text-white">Data Processing Addendum</h1>
      <p className="mt-2 text-sm text-zinc-500">Effective Date: July 25, 2026</p>

      <p className="mt-6">
        This Data Processing Addendum (&quot;DPA&quot;) applies to business customers on whose behalf
        DTCDecoder processes personal data. It supplements our{" "}
        <a href="/terms" className="text-[var(--accent-red)] underline">
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="/privacy" className="text-[var(--accent-red)] underline">
          Privacy Policy
        </a>
        . A signed copy for enterprise agreements is available on request.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Roles</h2>
      <p className="mt-4">
        Where you use DTCDecoder to process personal data of your own customers or employees, you act
        as the data controller and DTCDecoder acts as a data processor, processing that data only on
        your documented instructions.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Scope and Purpose</h2>
      <p className="mt-4">
        Processing is limited to providing the Services — including AI-assisted diagnostics, account
        management, and support — for the duration of your use of the platform.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Sub-processors</h2>
      <p className="mt-4">
        We engage trusted sub-processors to deliver the Services, including:
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>Creem — payment processing (Merchant of Record)</li>
        <li>Anthropic — AI diagnostic processing</li>
        <li>Supabase — database, authentication, and file storage</li>
        <li>Vercel — application hosting</li>
      </ul>
      <p className="mt-4">
        We require sub-processors to provide data-protection commitments consistent with this DPA.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Security</h2>
      <p className="mt-4">
        We maintain commercially reasonable technical and organizational measures to protect
        personal data, including access controls, encryption in transit, and restricted, verified
        access to purchased files.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Data Subject Requests</h2>
      <p className="mt-4">
        We will provide reasonable assistance to help you respond to requests from individuals to
        access, correct, delete, or restrict their personal data.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">International Transfers</h2>
      <p className="mt-4">
        Where personal data is transferred across borders, we rely on appropriate safeguards
        recognized under applicable data-protection law.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Breach Notification</h2>
      <p className="mt-4">
        We will notify you without undue delay after becoming aware of a personal-data breach
        affecting your data.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Return and Deletion</h2>
      <p className="mt-4">
        On termination, we will delete or return personal data processed on your behalf, except where
        retention is required by law.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Contact</h2>
      <p className="mt-4">
        To request a signed DPA or ask about data processing, email{" "}
        <a href="mailto:support@redlined1.com" className="text-[var(--accent-red)] underline">
          support@redlined1.com
        </a>
        .
      </p>
    </div>
  );
}
