import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-zinc-300">
      <h1 className="text-3xl font-bold text-white">Terms of Service</h1>
      <p className="mt-2 text-sm text-zinc-500">Last updated: [Insert Date]</p>

      <p className="mt-6">
        These Terms of Service (&quot;Terms&quot;) govern your access to and use of DTC Decoder (the
        &quot;Service&quot;), operated by [Your Legal Business Name] (&quot;we,&quot; &quot;us,&quot; or
        &quot;our&quot;), located at [Business Address]. By accessing or using the Service, you agree to be
        bound by these Terms. If you do not agree, do not use the Service.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">1. Description of Service</h2>
      <p className="mt-4">
        DTC Decoder provides automotive diagnostic trouble code (DTC) lookup, an AI-assisted diagnostic
        chat assistant, AI-assisted analysis of uploaded vehicle scan-tool reports, and links to
        third-party repair guides and videos. Basic DTC code lookup is free and unlimited. AI-generated
        diagnostic analysis is subject to the usage allowances and features of your plan (Free, Pro
        Technician, or Workshop), described on our Pricing page.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">2. Not a Substitute for Professional Diagnosis</h2>
      <p className="mt-4">
        All content on the Service — including DTC definitions, AI-generated diagnostic reasoning, ranked
        causes, recommended tests, and confidence levels — is provided for informational purposes only. It
        is AI-assisted evidence review, not a confirmed diagnosis, and does not replace OEM service
        information or a qualified technician&apos;s in-person inspection and verification. A diagnostic
        trouble code alone does not prove a component has failed.
      </p>
      <p className="mt-4">
        Always perform the recommended confirmation tests before replacing any part. Never disable,
        bypass, or ignore a vehicle safety system (including airbag/SRS, immobilizer/security, or
        high-voltage EV systems) based on guidance from this Service. High-voltage and safety-system work
        should only be performed by a qualified technician using proper personal protective equipment and
        lockout/tagout procedures. We are not liable for any injury, vehicle damage, or repair outcome
        resulting from action taken based on information provided by the Service.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">3. Accounts</h2>
      <p className="mt-4">
        Account access uses passwordless, email-based sign-in (a one-time magic link) — we never ask for
        or store a password. You are responsible for maintaining control of the email account used to
        access your account, and for all activity that occurs under it. You must provide accurate contact
        information.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">4. Subscriptions, Billing, and Cancellation</h2>
      <p className="mt-4">
        Pro Technician and Workshop plans are paid subscriptions billed monthly or annually, as selected
        at checkout, and processed by our payment processor, Creem.io. Subscriptions renew automatically
        at the then-current price until canceled. You can cancel at any time from your account; access to
        paid features continues through the end of the current billing period, after which your account
        reverts to the Free plan. Prices and included usage allowances are listed on our Pricing page and
        may change with notice; changes apply to future billing periods, not a period already paid for.
      </p>
      <p className="mt-4">
        You do not need to create an account before starting checkout — you may check out as a guest using
        your email address. Subscription access is linked to that email; if you later sign in with the
        same email, your subscription applies to that account automatically.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">5. Refunds</h2>
      <p className="mt-4">
        Subscription fees are generally non-refundable, including for partially used billing periods or
        unused portions of a monthly/daily usage allowance. If you believe you were charged in error, or
        experienced a service failure that prevented you from using a paid feature you were billed for,
        contact us at [Support Email] within 14 days of the charge and we will review the request in good
        faith. We do not automatically charge overages beyond your plan&apos;s allowance, and we do not
        automatically upgrade your plan without your action.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">6. Acceptable Use</h2>
      <p className="mt-4">
        You agree not to: use the Service for any unlawful purpose; attempt to circumvent usage limits,
        entitlements, or access controls; submit content that infringes another party&apos;s rights;
        attempt to extract, scrape, or resell the Service&apos;s underlying data or AI outputs at scale
        without our written permission; or attempt to manipulate the AI assistant into bypassing its
        built-in safety guidance (for example, requests to bypass a vehicle immobilizer or security
        system).
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">7. Third-Party Content and Links</h2>
      <p className="mt-4">
        The Service links to third-party repair guides (hosted on Gumroad) and instructional videos
        (hosted on YouTube). We do not control and are not responsible for third-party content, and some
        links may be affiliate links — see our Affiliate Disclosure page for details.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">8. Intellectual Property</h2>
      <p className="mt-4">
        The Service, including its software, design, and curated DTC content, is owned by us or our
        licensors and protected by applicable intellectual property laws. You may use AI-generated
        diagnostic output for your own vehicle repair purposes, but may not republish or resell it as a
        standalone product.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">9. Disclaimers and Limitation of Liability</h2>
      <p className="mt-4">
        THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED,
        INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. TO THE MAXIMUM
        EXTENT PERMITTED BY LAW, WE ARE NOT LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
        PUNITIVE DAMAGES, OR ANY LOSS OF VEHICLE USE, PROFITS, OR DATA, ARISING FROM YOUR USE OF THE
        SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. OUR TOTAL LIABILITY FOR ANY CLAIM
        RELATING TO THE SERVICE IS LIMITED TO THE AMOUNT YOU PAID US IN THE 12 MONTHS BEFORE THE CLAIM
        AROSE.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">10. Termination</h2>
      <p className="mt-4">
        We may suspend or terminate your access to the Service if you violate these Terms. You may stop
        using the Service and cancel your subscription at any time.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">11. Changes to These Terms</h2>
      <p className="mt-4">
        We may update these Terms from time to time. Material changes will be reflected by an updated
        &quot;Last updated&quot; date above. Continued use of the Service after changes take effect
        constitutes acceptance of the revised Terms.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">12. Governing Law</h2>
      <p className="mt-4">
        These Terms are governed by the laws of [Governing State/Country], without regard to conflict-of-law
        principles.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">13. Contact</h2>
      <p className="mt-4">
        Questions about these Terms? Contact us at [Support Email] or via our Contact page.
      </p>
    </div>
  );
}
