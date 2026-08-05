"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

// Reached only via the link in a password-reset email. Supabase's browser
// client auto-establishes a recovery session from the URL fragment on load
// (detectSessionInUrl, on by default for createBrowserClient) — this form
// just waits for that PASSWORD_RECOVERY event (or an already-present
// session, in case it resolved before this component mounted) before
// allowing a password to be set. A visitor who lands here without a valid/
// unexpired reset link never gets a session, so the form stays disabled
// with an explanatory message instead of silently failing on submit.
export function ResetPasswordForm() {
  const router = useRouter();
  const t = useTranslations("auth");
  const tAccount = useTranslations("account");
  // Maps the stable Supabase Auth error .code (not .message, which is raw
  // English) to a translated string — mirrors ChangePasswordForm.tsx's
  // pattern for the same updateUser() call.
  const ERROR_CODE_LABEL: Record<string, string> = {
    weak_password: tAccount("passwordUpdateWeakPassword"),
    same_password: tAccount("passwordUpdateSamePassword"),
    over_request_rate_limit: tAccount("passwordUpdateRateLimited"),
    session_expired: tAccount("passwordUpdateSessionExpired"),
    user_not_found: tAccount("passwordUpdateSessionExpired"),
  };
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (password.length < 8) {
      setErrorMessage(tAccount("passwordTooShort"));
      setStatus("error");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage(tAccount("passwordsDontMatch"));
      setStatus("error");
      return;
    }

    setStatus("loading");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setErrorMessage((error.code && ERROR_CODE_LABEL[error.code]) ?? tAccount("passwordUpdateGenericError"));
      setStatus("error");
      return;
    }

    setStatus("success");
    router.push("/account");
    router.refresh();
  }

  if (!ready) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">
        {t("resetLinkInvalid")}{" "}
        <Link href="/account/forgot-password" className="text-[var(--text-primary)] underline">
          {t("requestNewOne")}
        </Link>
        .
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        type="password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={tAccount("newPasswordPlaceholder")}
        className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-2.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
      />
      <input
        type="password"
        required
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        placeholder={tAccount("confirmPasswordPlaceholder")}
        className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-2.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="min-h-11 self-start rounded-[var(--radius-md)] bg-[var(--accent-red)] px-5 py-2 font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        style={{ boxShadow: "var(--shadow-accent)" }}
      >
        {status === "loading" ? tAccount("settingPassword") : tAccount("setPassword")}
      </button>
      {status === "error" && errorMessage && (
        <p className="text-sm text-[var(--accent-red)]">{errorMessage}</p>
      )}
    </form>
  );
}
