import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Affiliate Disclosure",
};

export default function AffiliateDisclosurePage() {
  return (
    <div className="prose-diagnostic mx-auto px-6 py-16">
      <h1>Affiliate Disclosure</h1>
      <p>
        DTC Decoder links to repair guides on Gumroad and videos on YouTube.
        Some of these links may be affiliate or revenue-sharing links, meaning
        we may earn a commission at no additional cost to you if you make a
        purchase through them. We only recommend content we believe is
        genuinely useful for diagnosing and repairing the issue described.
      </p>
    </div>
  );
}
