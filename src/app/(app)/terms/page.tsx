import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-zinc-300">
      <h1 className="text-3xl font-bold text-white">DTCDecoder Terms of Service</h1>
      <p className="mt-2 text-sm text-zinc-500">Effective Date: July 25, 2026</p>

      <p className="mt-6">
        Welcome to DTCDecoder (&quot;Company,&quot; &quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). By
        accessing or using our website, software, AI diagnostic tools, and related services
        (&quot;Services&quot;), you agree to these Terms of Service.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">1. Eligibility</h2>
      <p className="mt-4">
        You must be at least 18 years old and legally capable of entering into a binding agreement.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">2. Services</h2>
      <p className="mt-4">
        DTCDecoder provides automotive diagnostic information, AI-assisted troubleshooting, repair
        guidance, educational materials, VIN decoding, and related services.
      </p>
      <p className="mt-4">
        The information provided is intended to assist technicians and vehicle owners but is not a
        substitute for professional inspection or manufacturer service procedures.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">3. AI Generated Content</h2>
      <p className="mt-4">
        Our platform may use artificial intelligence to generate diagnostic recommendations. You
        acknowledge that:
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>AI responses may contain inaccuracies.</li>
        <li>Recommendations should always be verified using professional diagnostic procedures.</li>
        <li>Users assume all responsibility for repair decisions.</li>
      </ul>
      <p className="mt-4">
        We do not guarantee that any recommendation will solve a particular vehicle problem.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">4. Accounts</h2>
      <p className="mt-4">You are responsible for:</p>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>Maintaining account security</li>
        <li>Keeping login credentials confidential</li>
        <li>All activities occurring under your account</li>
      </ul>

      <h2 className="mt-10 text-xl font-bold text-white">5. Subscription Plans</h2>
      <p className="mt-4">
        Certain features require a paid subscription. Plans automatically renew until cancelled. Current
        pricing is displayed during checkout. We reserve the right to modify pricing for future billing
        periods with advance notice.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">6. Payments</h2>
      <p className="mt-4">
        Payments are securely processed by Creem.io, our Merchant of Record. Creem manages:
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>Payment processing</li>
        <li>Sales tax and VAT where applicable</li>
        <li>Billing</li>
        <li>Payment security</li>
        <li>Refund processing</li>
      </ul>
      <p className="mt-4">We never store your complete payment information.</p>

      <h2 className="mt-10 text-xl font-bold text-white">7. Free Plan</h2>
      <p className="mt-4">The free plan may include usage limits such as:</p>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>Daily AI requests</li>
        <li>Monthly searches</li>
        <li>VIN lookups</li>
        <li>Diagnostic reports</li>
      </ul>
      <p className="mt-4">Limits may change without notice.</p>

      <h2 className="mt-10 text-xl font-bold text-white">8. Acceptable Use</h2>
      <p className="mt-4">You agree not to:</p>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>Reverse engineer the platform</li>
        <li>Abuse API limits</li>
        <li>Share paid accounts</li>
        <li>Scrape our database</li>
        <li>Resell our content without permission</li>
        <li>Use the platform for illegal activities</li>
      </ul>
      <p className="mt-4">Violation may result in suspension or termination.</p>

      <h2 className="mt-10 text-xl font-bold text-white">9. Intellectual Property</h2>
      <p className="mt-4">
        All software, AI prompts, databases, graphics, documentation, branding, trademarks, and content
        remain the property of DTCDecoder. No ownership rights are transferred.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">10. Availability</h2>
      <p className="mt-4">
        We strive for high availability but do not guarantee uninterrupted service. Maintenance, outages,
        or third-party failures may temporarily interrupt access.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">11. Limitation of Liability</h2>
      <p className="mt-4">
        To the maximum extent permitted by law, DTCDecoder shall not be liable for:
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>Vehicle damage</li>
        <li>Personal injury</li>
        <li>Lost profits</li>
        <li>Business interruption</li>
        <li>Data loss</li>
        <li>Incorrect repairs</li>
        <li>Parts purchased based on AI recommendations</li>
      </ul>
      <p className="mt-4">
        Maximum liability shall not exceed the amount paid during the previous twelve months.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">12. Indemnification</h2>
      <p className="mt-4">
        You agree to indemnify and hold harmless DTCDecoder from claims arising from your misuse of the
        Services.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">13. Termination</h2>
      <p className="mt-4">
        We may suspend or terminate accounts for violations of these Terms. You may cancel your
        subscription at any time.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">14. Governing Law</h2>
      <p className="mt-4">
        These Terms shall be governed by the laws applicable to the Company&apos;s jurisdiction unless
        otherwise required by consumer protection laws.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">15. Changes</h2>
      <p className="mt-4">
        We may update these Terms from time to time. Continued use constitutes acceptance of revised
        Terms.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">16. Contact</h2>
      <p className="mt-4">
        Email:{" "}
        <a href="mailto:support@dtcdecoder.com" className="text-[var(--accent-red)] underline">
          support@dtcdecoder.com
        </a>
      </p>
    </div>
  );
}
