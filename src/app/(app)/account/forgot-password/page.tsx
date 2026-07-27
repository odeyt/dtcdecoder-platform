import Link from "next/link";
import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="text-xl font-semibold">Reset your password</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Enter the email on your account and we&apos;ll send you a link to set a new password.
      </p>
      <div className="mt-6 text-left">
        <ForgotPasswordForm />
      </div>
      <Link
        href="/account/login"
        className="mt-6 inline-block text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        Back to sign in
      </Link>
    </div>
  );
}
