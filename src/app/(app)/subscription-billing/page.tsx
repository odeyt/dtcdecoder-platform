import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Subscription & Billing Policy",
};

export default function SubscriptionBillingPage() {
  return (
    <div className="prose-diagnostic mx-auto px-6 py-16">
      <h1>Subscription &amp; Billing Policy</h1>
      <p className="text-sm text-[var(--text-muted)]">Effective Date: July 25, 2026</p>

      <p>
        This policy explains how subscriptions, billing, and renewals work for DTCDecoder. Payments
        are processed by Creem.io, our Merchant of Record.
      </p>

      <h2>Plans</h2>
      <p>
        DTCDecoder offers a free plan and paid subscription plans (such as Pro and Workshop) that
        unlock additional AI diagnostic capabilities and report allowances. Individual digital
        products may also be purchased as one-time downloads. Current pricing is displayed during
        checkout.
      </p>

      <h2>Billing Cycle</h2>
      <p>
        Subscriptions are billed in advance on a monthly or annual basis, depending on the plan you
        select. Annual plans are billed once per year.
      </p>

      <h2>Automatic Renewal</h2>
      <p>
        Subscriptions automatically renew at the end of each billing period until cancelled. By
        subscribing, you authorize Creem to charge your payment method for each renewal.
      </p>

      <h2>Price Changes</h2>
      <p>
        We may modify pricing for future billing periods. Any price change will apply only after
        your current period ends, and we will provide advance notice where required.
      </p>

      <h2>Cancellation</h2>
      <p>
        You may cancel at any time from your account&apos;s Billing section or through the Creem
        customer billing portal. Cancellation stops future renewals; you retain access to paid
        features until the end of the period already paid for.
      </p>

      <h2>Failed Payments</h2>
      <p>
        If a payment fails, we may retry the charge or suspend access to paid features until payment
        is successfully completed.
      </p>

      <h2>Taxes</h2>
      <p>
        As Merchant of Record, Creem calculates and collects applicable sales tax and VAT where
        required. Displayed prices may be adjusted at checkout to reflect these amounts.
      </p>

      <h2>Refunds</h2>
      <p>
        Refund eligibility is described in our{" "}
        <Link href="/refund" className="text-[var(--accent-red)] underline">
          Refund Policy
        </Link>
        .
      </p>

      <h2>Contact</h2>
      <p>
        Email:{" "}
        <a href="mailto:support@dtcdecoder.com" className="text-[var(--accent-red)] underline">
          support@dtcdecoder.com
        </a>
      </p>
    </div>
  );
}
