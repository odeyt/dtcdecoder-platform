import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-zinc-300">
      <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
      <p className="mt-2 text-sm text-zinc-500">Effective Date: July 25, 2026</p>

      <p className="mt-6">DTCDecoder values your privacy.</p>

      <h2 className="mt-10 text-xl font-bold text-white">Information We Collect</h2>
      <p className="mt-4">We may collect:</p>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>Name</li>
        <li>Email address</li>
        <li>Billing information (processed by Creem)</li>
        <li>Vehicle VINs</li>
        <li>Diagnostic Trouble Codes</li>
        <li>Uploaded scan reports</li>
        <li>Device information</li>
        <li>Browser information</li>
        <li>IP address</li>
        <li>Usage analytics</li>
      </ul>

      <h2 className="mt-10 text-xl font-bold text-white">How We Use Information</h2>
      <p className="mt-4">We use your information to:</p>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>Provide AI diagnostic services</li>
        <li>Improve AI accuracy</li>
        <li>Prevent fraud</li>
        <li>Process subscriptions</li>
        <li>Provide customer support</li>
        <li>Improve platform performance</li>
      </ul>

      <h2 className="mt-10 text-xl font-bold text-white">Payments</h2>
      <p className="mt-4">
        Payments are processed by Creem.io. We do not store your complete credit card information.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Cookies</h2>
      <p className="mt-4">We use cookies for:</p>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>Authentication</li>
        <li>Preferences</li>
        <li>Analytics</li>
        <li>Security</li>
      </ul>

      <h2 className="mt-10 text-xl font-bold text-white">Data Sharing</h2>
      <p className="mt-4">We do not sell your personal information.</p>
      <p className="mt-4">We may share data with trusted providers including:</p>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>Creem</li>
        <li>Anthropic</li>
        <li>Supabase</li>
        <li>Vercel</li>
      </ul>
      <p className="mt-4">Only when necessary to provide our Services.</p>

      <h2 className="mt-10 text-xl font-bold text-white">AI Processing</h2>
      <p className="mt-4">
        Diagnostic information you submit may be processed using AI providers to generate recommendations.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Data Retention</h2>
      <p className="mt-4">
        We retain information only as long as necessary to provide Services or comply with legal
        obligations.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Security</h2>
      <p className="mt-4">
        We implement commercially reasonable safeguards to protect your data. No online system is
        completely secure.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Your Rights</h2>
      <p className="mt-4">Depending on your location, you may request:</p>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>Access</li>
        <li>Correction</li>
        <li>Deletion</li>
        <li>Data portability</li>
        <li>Restriction of processing</li>
      </ul>

      <h2 className="mt-10 text-xl font-bold text-white">Contact</h2>
      <p className="mt-4">
        <a href="mailto:support@dtcdecoder.com" className="text-[var(--accent-red)] underline">
          support@dtcdecoder.com
        </a>
      </p>
    </div>
  );
}
