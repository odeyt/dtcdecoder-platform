import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "GDPR & CCPA Privacy Rights",
};

export default function PrivacyRightsPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-zinc-300">
      <h1 className="text-3xl font-bold text-white">GDPR &amp; CCPA Privacy Rights</h1>
      <p className="mt-2 text-sm text-zinc-500">Effective Date: July 25, 2026</p>

      <p className="mt-6">
        This page describes the privacy rights available to residents of the European Economic Area,
        the United Kingdom, and California, and how to exercise them. It supplements our{" "}
        <Link href="/privacy" className="text-[var(--accent-red)] underline">
          Privacy Policy
        </Link>
        .
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Your Rights Under GDPR (EEA / UK)</h2>
      <p className="mt-4">If you are in the EEA or UK, you have the right to:</p>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>Access the personal data we hold about you</li>
        <li>Request correction of inaccurate data</li>
        <li>Request deletion of your data</li>
        <li>Restrict or object to certain processing</li>
        <li>Data portability</li>
        <li>Withdraw consent where processing is based on consent</li>
        <li>Lodge a complaint with your supervisory authority</li>
      </ul>

      <h2 className="mt-10 text-xl font-bold text-white">Your Rights Under CCPA / CPRA (California)</h2>
      <p className="mt-4">If you are a California resident, you have the right to:</p>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>Know what personal information we collect and how it is used</li>
        <li>Request access to your personal information</li>
        <li>Request deletion of your personal information</li>
        <li>Correct inaccurate personal information</li>
        <li>Opt out of the sale or sharing of personal information</li>
        <li>Not be discriminated against for exercising your rights</li>
      </ul>

      <h2 className="mt-10 text-xl font-bold text-white">We Do Not Sell Your Data</h2>
      <p className="mt-4">
        DTCDecoder does not sell your personal information. We share data with service providers only
        as needed to operate the platform, as described in our Privacy Policy.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">How to Exercise Your Rights</h2>
      <p className="mt-4">
        To make a request, email{" "}
        <a href="mailto:support@dtcdecoder.com" className="text-[var(--accent-red)] underline">
          support@dtcdecoder.com
        </a>{" "}
        with the details of your request. We may need to verify your identity before responding.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Authorized Agents</h2>
      <p className="mt-4">
        You may use an authorized agent to submit a request on your behalf. We may require proof of
        authorization and verification of your identity.
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
