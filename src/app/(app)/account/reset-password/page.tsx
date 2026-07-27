import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";

export const metadata: Metadata = { title: "Set a new password" };

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">Set a new password</h1>
      <div className="mt-6 text-left">
        <ResetPasswordForm />
      </div>
    </div>
  );
}
