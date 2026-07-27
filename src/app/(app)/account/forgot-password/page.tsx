import Link from "next/link";
import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">Reset your password</h1>
      <p className="mt-2 text-[var(--text-secondary)]">
        Enter the email on your account and we&apos;ll send you a link to set a new password.
      </p>
      <div className="mt-6 text-left">
        <ForgotPasswordForm />
      </div>
      <Link
        href="/account/login"
        className="mt-6 inline-block text-sm text-[var(--text-secondary)] underline hover:text-[var(--text-primary)]"
      >
        Back to sign in
      </Link>
    </div>
  );
}
