import type { Metadata } from "next";
import { EmailSignupForm } from "@/components/EmailSignupForm";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with DTC Decoder.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold text-white">Contact</h1>
      <p className="mt-4 text-zinc-400">
        Questions about a diagnosis, a diagnostic report, or Workshop
        accounts? Sign up below and we&apos;ll follow up, or reach out
        directly on YouTube.
      </p>
      <div className="mt-8">
        <EmailSignupForm />
      </div>
    </div>
  );
}
