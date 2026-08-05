"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

// Lets an already-authenticated user set a password for the first time
// (every existing account only has magic-link access today) or change an
// existing one. No current-password confirmation is required — Supabase's
// updateUser() call is authorized by the live session itself, the same
// trust boundary every other authenticated action in this app already
// relies on.
export function ChangePasswordForm() {
  const t = useTranslations("account");
  // Maps the stable Supabase Auth error .code (not .message, which is raw
  // English and not guaranteed stable wording) to a translated string —
  // any code not in this map falls back to a generic translated message,
  // never the raw SDK text.
  const ERROR_CODE_LABEL: Record<string, string> = {
    weak_password: t("passwordUpdateWeakPassword"),
    same_password: t("passwordUpdateSamePassword"),
    over_request_rate_limit: t("passwordUpdateRateLimited"),
    session_expired: t("passwordUpdateSessionExpired"),
    user_not_found: t("passwordUpdateSessionExpired"),
  };
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (password.length < 8) {
      setErrorMessage(t("passwordTooShort"));
      setStatus("error");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage(t("passwordsDontMatch"));
      setStatus("error");
      return;
    }

    setStatus("loading");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setErrorMessage((error.code && ERROR_CODE_LABEL[error.code]) ?? t("passwordUpdateGenericError"));
      setStatus("error");
      return;
    }

    setPassword("");
    setConfirmPassword("");
    setStatus("success");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        type="password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={t("newPasswordPlaceholder")}
        className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-2.5 text-[var(--text-primary)]"
      />
      <input
        type="password"
        required
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        placeholder={t("confirmPasswordPlaceholder")}
        className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-2.5 text-[var(--text-primary)]"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="min-h-11 self-start rounded-[var(--radius-md)] bg-[var(--accent-red)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {status === "loading" ? t("settingPassword") : t("setPassword")}
      </button>
      {status === "success" && (
        <p className="text-sm text-[var(--text-secondary)]">{t("passwordUpdated")}</p>
      )}
      {status === "error" && errorMessage && (
        <p className="text-sm text-[var(--accent-red)]">{errorMessage}</p>
      )}
    </form>
  );
}
