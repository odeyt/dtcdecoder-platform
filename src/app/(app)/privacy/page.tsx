import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-zinc-300">
      <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
      <p className="mt-6">
        We collect the email address and name you provide when you sign up for
        diagnostic tips, create an account, or subscribe to a paid plan. We use
        this information to send the content you requested and to operate your
        account. We do not sell your personal information to third parties.
      </p>
      <p className="mt-4">
        Payment processing is handled by Creem.io; we do not store your card
        details. Authentication is handled by Supabase via passwordless
        magic-link email.
      </p>
      <p className="mt-4">
        Contact us via the Contact page with any questions about your data.
      </p>
    </div>
  );
}
