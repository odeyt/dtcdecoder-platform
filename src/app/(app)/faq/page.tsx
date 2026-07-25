import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
};

type Faq = {
  question: string;
  answer: React.ReactNode;
};

const faqs: Faq[] = [
  {
    question: "How accurate is the AI?",
    answer:
      "The AI provides professional-grade assistance but should always be verified with proper diagnostic testing.",
  },
  {
    question: "Does the AI replace a technician?",
    answer: "No. It assists technicians by analyzing DTCs, symptoms, and repair information.",
  },
  {
    question: "Which AI models are used?",
    answer:
      "DTCDecoder uses Anthropic's Claude models to power its AI diagnostic features. The AI capabilities available to you depend on your subscription plan.",
  },
  {
    question: "How do I cancel?",
    answer: (
      <>
        Log into your account and select <strong className="text-white">Billing</strong>, or use the
        customer billing portal provided by Creem. Cancellation stops future renewals.
      </>
    ),
  },
  {
    question: "Will I lose my reports?",
    answer:
      "Expired subscriptions may lose access to premium AI reports while retaining basic account information.",
  },
  {
    question: "Are payments secure?",
    answer:
      "Yes. Payments are securely processed through Creem.io. We never store your full payment card details.",
  },
  {
    question: "Do you offer refunds?",
    answer: (
      <>
        Please see our{" "}
        <a href="/refund" className="text-[var(--accent-red)] underline">
          Refund Policy
        </a>
        .
      </>
    ),
  },
  {
    question: "Is my vehicle data private?",
    answer:
      "Yes. We do not sell your personal data. Diagnostic information is used only to provide and improve our Services.",
  },
  {
    question: "Can I upload scanner files?",
    answer: "Yes. Supported subscriptions can upload scan reports for AI-assisted analysis.",
  },
  {
    question: "Which vehicles are supported?",
    answer:
      "Most OBD-II compliant vehicles along with many manufacturer-specific systems. Coverage continues to expand.",
  },
  {
    question: "Can I use DTCDecoder commercially?",
    answer:
      "Yes. Professional repair shops may use DTCDecoder according to their subscription plan. Enterprise licensing is available.",
  },
  {
    question: "How can I contact support?",
    answer: (
      <>
        Email:{" "}
        <a href="mailto:support@dtcdecoder.com" className="text-[var(--accent-red)] underline">
          support@dtcdecoder.com
        </a>
      </>
    ),
  },
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-zinc-300">
      <h1 className="text-3xl font-bold text-white">Frequently Asked Questions</h1>

      <div className="mt-10 space-y-10">
        {faqs.map((faq) => (
          <div key={faq.question}>
            <h2 className="text-xl font-bold text-white">{faq.question}</h2>
            <p className="mt-4">{faq.answer}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
