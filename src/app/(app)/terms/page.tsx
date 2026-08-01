import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
};

export default function TermsPage() {
  return (
    <div className="prose-diagnostic mx-auto px-6 py-16">
      <h1>DTCDecoder Terms of Service</h1>
      <p className="text-sm text-[var(--text-muted)]">Effective Date: July 25, 2026</p>

      <p>
        Welcome to DTCDecoder (&quot;Company,&quot; &quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). By
        accessing or using our website, software, AI diagnostic tools, and related services
        (&quot;Services&quot;), you agree to these Terms of Service.
      </p>

      <h2>1. Eligibility</h2>
      <p>
        You must be at least 18 years old and legally capable of entering into a binding agreement.
      </p>

      <h2>2. Services</h2>
      <p>
        DTCDecoder provides automotive diagnostic information, AI-assisted troubleshooting, repair
        guidance, educational materials, VIN decoding, and related services.
      </p>
      <p>
        The information provided is intended to assist technicians and vehicle owners but is not a
        substitute for professional inspection or manufacturer service procedures.
      </p>

      <h2>3. AI Generated Content</h2>
      <p>
        Our platform may use artificial intelligence to generate diagnostic recommendations. You
        acknowledge that:
      </p>
      <ul>
        <li>AI responses may contain inaccuracies.</li>
        <li>Recommendations should always be verified using professional diagnostic procedures.</li>
        <li>Users assume all responsibility for repair decisions.</li>
      </ul>
      <p>
        We do not guarantee that any recommendation will solve a particular vehicle problem.
      </p>

      <h2>4. Accounts</h2>
      <p>You are responsible for:</p>
      <ul>
        <li>Maintaining account security</li>
        <li>Keeping login credentials confidential</li>
        <li>All activities occurring under your account</li>
      </ul>

      <h2>5. Subscription Plans</h2>
      <p>
        Certain features require a paid subscription. Plans automatically renew until cancelled. Current
        pricing is displayed during checkout. We reserve the right to modify pricing for future billing
        periods with advance notice.
      </p>

      <h2>6. Payments</h2>
      <p>
        Payments are securely processed by Creem.io, our Merchant of Record. Creem manages:
      </p>
      <ul>
        <li>Payment processing</li>
        <li>Sales tax and VAT where applicable</li>
        <li>Billing</li>
        <li>Payment security</li>
        <li>Refund processing</li>
      </ul>
      <p>We never store your complete payment information.</p>

      <h2>7. Free Plan</h2>
      <p>The free plan may include usage limits such as:</p>
      <ul>
        <li>Daily AI requests</li>
        <li>Monthly searches</li>
        <li>VIN lookups</li>
        <li>Diagnostic reports</li>
      </ul>
      <p>Limits may change without notice.</p>

      <h2>8. Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Reverse engineer the platform</li>
        <li>Abuse API limits</li>
        <li>Share paid accounts</li>
        <li>Scrape our database</li>
        <li>Resell our content without permission</li>
        <li>Use the platform for illegal activities</li>
      </ul>
      <p>Violation may result in suspension or termination.</p>

      <h2>9. Intellectual Property</h2>
      <p>
        All software, AI prompts, databases, graphics, documentation, branding, trademarks, and content
        remain the property of DTCDecoder. No ownership rights are transferred.
      </p>

      <h2>10. Availability</h2>
      <p>
        We strive for high availability but do not guarantee uninterrupted service. Maintenance, outages,
        or third-party failures may temporarily interrupt access.
      </p>

      <h2>11. Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by law, DTCDecoder shall not be liable for:
      </p>
      <ul>
        <li>Vehicle damage</li>
        <li>Personal injury</li>
        <li>Lost profits</li>
        <li>Business interruption</li>
        <li>Data loss</li>
        <li>Incorrect repairs</li>
        <li>Parts purchased based on AI recommendations</li>
      </ul>
      <p>
        Maximum liability shall not exceed the amount paid during the previous twelve months.
      </p>

      <h2>12. Indemnification</h2>
      <p>
        You agree to indemnify and hold harmless DTCDecoder from claims arising from your misuse of the
        Services.
      </p>

      <h2>13. Termination</h2>
      <p>
        We may suspend or terminate accounts for violations of these Terms. You may cancel your
        subscription at any time.
      </p>

      <h2>14. Governing Law</h2>
      <p>
        These Terms shall be governed by the laws applicable to the Company&apos;s jurisdiction unless
        otherwise required by consumer protection laws.
      </p>

      <h2>15. Changes</h2>
      <p>
        We may update these Terms from time to time. Continued use constitutes acceptance of revised
        Terms.
      </p>

      <h2>16. Contact</h2>
      <p>
        Email:{" "}
        <a href="mailto:support@dtcdecoder.com" className="text-[var(--accent-red)] underline">
          support@dtcdecoder.com
        </a>
      </p>
    </div>
  );
}
