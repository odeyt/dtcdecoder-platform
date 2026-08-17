import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <div className="prose-diagnostic mx-auto px-6 py-16">
      <h1>Privacy Policy</h1>
      <p className="text-sm text-[var(--text-muted)]">Effective Date: July 25, 2026</p>

      <p>DTCDecoder values your privacy.</p>

      <h2>Information We Collect</h2>
      <p>We may collect:</p>
      <ul>
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

      <h2>How We Use Information</h2>
      <p>We use your information to:</p>
      <ul>
        <li>Provide AI diagnostic services</li>
        <li>Improve AI accuracy</li>
        <li>Prevent fraud</li>
        <li>Process subscriptions</li>
        <li>Provide customer support</li>
        <li>Improve platform performance</li>
      </ul>

      <h2>Payments</h2>
      <p>
        Payments are processed by Creem.io. We do not store your complete credit card information.
      </p>

      <h2>Cookies</h2>
      <p>We use cookies for:</p>
      <ul>
        <li>Authentication</li>
        <li>Preferences</li>
        <li>Analytics</li>
        <li>Security</li>
      </ul>

      <h2>Data Sharing</h2>
      <p>We do not sell your personal information.</p>
      <p>We may share data with trusted providers including:</p>
      <ul>
        <li>Creem</li>
        <li>OpenAI</li>
        <li>Supabase</li>
        <li>Vercel</li>
      </ul>
      <p>Only when necessary to provide our Services.</p>

      <h2>AI Processing</h2>
      <p>
        Diagnostic information you submit may be processed using AI providers to generate recommendations.
      </p>

      <h2>Data Retention</h2>
      <p>
        We retain information only as long as necessary to provide Services or comply with legal
        obligations.
      </p>

      <h2>Security</h2>
      <p>
        We implement commercially reasonable safeguards to protect your data. No online system is
        completely secure.
      </p>

      <h2>Your Rights</h2>
      <p>Depending on your location, you may request:</p>
      <ul>
        <li>Access</li>
        <li>Correction</li>
        <li>Deletion</li>
        <li>Data portability</li>
        <li>Restriction of processing</li>
      </ul>

      <h2>Contact</h2>
      <p>
        <a href="mailto:support@dtcdecoder.com" className="text-[var(--accent-red)] underline">
          support@dtcdecoder.com
        </a>
      </p>
    </div>
  );
}
