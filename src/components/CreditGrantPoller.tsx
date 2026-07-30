"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { recordClientEvent } from "@/lib/analytics/client";

const MAX_POLL_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 3000;

// Shown only right after a Creem checkout redirect back to /account
// (?checkout=success). The webhook is the sole source of truth for
// granting a credit — this never grants anything itself, it only polls a
// read-only count so the page can refresh once the webhook has caught up,
// instead of leaving the customer looking at a stale "0 credits" screen.
// The poll is bounded (MAX_POLL_ATTEMPTS): if the webhook is unusually
// slow, this stops and falls back to a "still processing" message rather
// than polling forever.
export function CreditGrantPoller({ initialCount }: { initialCount: number }) {
  const t = useTranslations("account");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"polling" | "granted" | "timedOut">("polling");
  const attemptsRef = useRef(0);
  const firedReturnedEvent = useRef(false);

  const isReturningFromCheckout = searchParams.get("checkout") === "success";

  useEffect(() => {
    if (!isReturningFromCheckout) return;
    if (!firedReturnedEvent.current) {
      firedReturnedEvent.current = true;
      recordClientEvent("one_time_report_checkout_returned");
    }

    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      attemptsRef.current += 1;

      try {
        const res = await fetch("/api/account/report-credits");
        if (res.ok) {
          const data = await res.json();
          if (typeof data.count === "number" && data.count > initialCount) {
            setStatus("granted");
            router.replace(pathname);
            router.refresh();
            return;
          }
        }
      } catch {
        // Best-effort — a dropped poll just tries again on the next tick.
      }

      if (attemptsRef.current >= MAX_POLL_ATTEMPTS) {
        setStatus("timedOut");
        return;
      }

      setTimeout(poll, POLL_INTERVAL_MS);
    }

    poll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReturningFromCheckout]);

  if (!isReturningFromCheckout) return null;

  return (
    <div
      role="status"
      className="glass-panel rounded-[var(--radius-xl)] border border-[var(--border-red)] p-4 text-sm text-[var(--text-secondary)]"
    >
      {status === "granted"
        ? t("paymentReceived")
        : status === "timedOut"
          ? t("paymentProcessingDelayed")
          : t("paymentProcessing")}
    </div>
  );
}
