import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Data Processing Addendum",
};

export default function DpaPage() {
  return (
    <div className="prose-diagnostic mx-auto px-6 py-16">
      <h1>Data Processing Addendum</h1>
      <p className="text-sm text-[var(--text-muted)]">Effective Date: July 25, 2026</p>

      <p>
        This Data Processing Addendum (&quot;DPA&quot;) applies to business customers on whose behalf
        DTCDecoder processes personal data. It supplements our{" "}
        <Link href="/terms" className="text-[var(--accent-red)] underline">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="text-[var(--accent-red)] underline">
          Privacy Policy
        </Link>
        . A signed copy for enterprise agreements is available on request.
      </p>

      <h2>Roles</h2>
      <p>
        Where you use DTCDecoder to process personal data of your own customers or employees, you act
        as the data controller and DTCDecoder acts as a data processor, processing that data only on
        your documented instructions.
      </p>

      <h2>Scope and Purpose</h2>
      <p>
        Processing is limited to providing the Services — including AI-assisted diagnostics, account
        management, and support — for the duration of your use of the platform.
      </p>

      <h2>Sub-processors</h2>
      <p>
        We engage trusted sub-processors to deliver the Services, including:
      </p>
      <ul>
        <li>Creem — payment processing (Merchant of Record)</li>
        <li>Anthropic — AI diagnostic processing</li>
        <li>Supabase — database, authentication, and file storage</li>
        <li>Vercel — application hosting</li>
      </ul>
      <p>
        We require sub-processors to provide data-protection commitments consistent with this DPA.
      </p>

      <h2>Security</h2>
      <p>
        We maintain commercially reasonable technical and organizational measures to protect
        personal data, including access controls, encryption in transit, and restricted, verified
        access to purchased files.
      </p>

      <h2>Data Subject Requests</h2>
      <p>
        We will provide reasonable assistance to help you respond to requests from individuals to
        access, correct, delete, or restrict their personal data.
      </p>

      <h2>International Transfers</h2>
      <p>
        Where personal data is transferred across borders, we rely on appropriate safeguards
        recognized under applicable data-protection law.
      </p>

      <h2>Breach Notification</h2>
      <p>
        We will notify you without undue delay after becoming aware of a personal-data breach
        affecting your data.
      </p>

      <h2>Return and Deletion</h2>
      <p>
        On termination, we will delete or return personal data processed on your behalf, except where
        retention is required by law.
      </p>

      <h2>Contact</h2>
      <p>
        To request a signed DPA or ask about data processing, email{" "}
        <a href="mailto:support@dtcdecoder.com" className="text-[var(--accent-red)] underline">
          support@dtcdecoder.com
        </a>
        .
      </p>
    </div>
  );
}
