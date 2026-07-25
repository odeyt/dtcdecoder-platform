import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refund Policy",
};

export default function RefundPolicyPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-zinc-300">
      <h1 className="text-3xl font-bold text-white">DTCDecoder Refund Policy</h1>
      <p className="mt-2 text-sm text-zinc-500">Effective Date: July 25, 2026</p>

      <p className="mt-6">Payments are processed by Creem.io.</p>

      <h2 className="mt-10 text-xl font-bold text-white">Monthly Subscriptions</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>You may cancel your subscription at any time.</li>
        <li>Cancellation prevents future renewals.</li>
        <li>
          Previously paid subscription fees are generally non-refundable except where required by
          law.
        </li>
      </ul>

      <h2 className="mt-10 text-xl font-bold text-white">Annual Plans</h2>
      <p className="mt-4">Annual subscriptions may be eligible for refunds only if:</p>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>Requested within 14 days of purchase</li>
        <li>Minimal platform usage occurred</li>
        <li>Required by applicable law</li>
      </ul>

      <h2 className="mt-10 text-xl font-bold text-white">Digital Products</h2>
      <p className="mt-4">
        Downloaded digital products, repair guides, and reports are generally non-refundable.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Duplicate Charges</h2>
      <p className="mt-4">Duplicate or accidental charges will be refunded after verification.</p>

      <h2 className="mt-10 text-xl font-bold text-white">Fraud</h2>
      <p className="mt-4">
        Fraudulent transactions will be investigated and handled according to applicable laws.
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
