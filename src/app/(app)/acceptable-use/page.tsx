import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Acceptable Use Policy",
};

export default function AcceptableUsePage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-zinc-300">
      <h1 className="text-3xl font-bold text-white">Acceptable Use Policy</h1>
      <p className="mt-2 text-sm text-zinc-500">Effective Date: July 25, 2026</p>

      <p className="mt-6">
        This Acceptable Use Policy governs your use of DTCDecoder. By using the Services, you agree
        not to misuse the platform or help anyone else do so.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Prohibited Activities</h2>
      <p className="mt-4">You agree not to:</p>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>Reverse engineer, decompile, or attempt to extract our source code or AI prompts</li>
        <li>Scrape, harvest, or bulk-download our database or content</li>
        <li>Abuse, circumvent, or exceed API or usage limits</li>
        <li>Share, resell, or sublicense paid accounts or access credentials</li>
        <li>Resell or redistribute our content without written permission</li>
        <li>Upload malware or attempt to compromise platform security</li>
        <li>Interfere with or disrupt the integrity or performance of the Services</li>
        <li>Use the platform for any unlawful, fraudulent, or harmful purpose</li>
        <li>Impersonate others or misrepresent your affiliation with any person or entity</li>
      </ul>

      <h2 className="mt-10 text-xl font-bold text-white">Account Responsibility</h2>
      <p className="mt-4">
        You are responsible for all activity under your account and for keeping your access secure.
        Paid plans are licensed for the number of users specified in your plan.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Automated Access</h2>
      <p className="mt-4">
        Automated access to the Services is permitted only through interfaces we expressly provide
        and within any documented limits.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Enforcement</h2>
      <p className="mt-4">
        Violations may result in warnings, suspension, or termination of access, and where
        appropriate, referral to law enforcement.
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
