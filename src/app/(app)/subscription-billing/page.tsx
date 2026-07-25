import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Subscription & Billing Policy",
};

export default function SubscriptionBillingPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-zinc-300">
      <h1 className="text-3xl font-bold text-white">Subscription &amp; Billing Policy</h1>
      <p className="mt-2 text-sm text-zinc-500">Effective Date: July 25, 2026</p>

      <p className="mt-6">
        This policy explains how subscriptions, billing, and renewals work for DTCDecoder. Payments
        are processed by Creem.io, our Merchant of Record.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Plans</h2>
      <p className="mt-4">
        DTCDecoder offers a free plan and paid subscription plans (such as Pro and Workshop) that
        unlock additional AI diagnostic capabilities and report allowances. Individual digital
        products may also be purchased as one-time downloads. Current pricing is displayed during
        checkout.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Billing Cycle</h2>
      <p className="mt-4">
        Subscriptions are billed in advance on a monthly or annual basis, depending on the plan you
        select. Annual plans are billed once per year.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Automatic Renewal</h2>
      <p className="mt-4">
        Subscriptions automatically renew at the end of each billing period until cancelled. By
        subscribing, you authorize Creem to charge your payment method for each renewal.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Price Changes</h2>
      <p className="mt-4">
        We may modify pricing for future billing periods. Any price change will apply only after
        your current period ends, and we will provide advance notice where required.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Cancellation</h2>
      <p className="mt-4">
        You may cancel at any time from your account&apos;s Billing section or through the Creem
        customer billing portal. Cancellation stops future renewals; you retain access to paid
        features until the end of the period already paid for.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Failed Payments</h2>
      <p className="mt-4">
        If a payment fails, we may retry the charge or suspend access to paid features until payment
        is successfully completed.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Taxes</h2>
      <p className="mt-4">
        As Merchant of Record, Creem calculates and collects applicable sales tax and VAT where
        required. Displayed prices may be adjusted at checkout to reflect these amounts.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Refunds</h2>
      <p className="mt-4">
        Refund eligibility is described in our{" "}
        <a href="/refund" className="text-[var(--accent-red)] underline">
          Refund Policy
        </a>
        .
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Contact</h2>
      <p className="mt-4">
        Email:{" "}
        <a href="mailto:support@redlined1.com" className="text-[var(--accent-red)] underline">
          support@redlined1.com
        </a>
      </p>
    </div>
  );
}
