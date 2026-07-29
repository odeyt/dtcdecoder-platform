"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DiagnosticProgress } from "@/components/DiagnosticProgress";
import { LANDING_INTAKE_STORAGE_KEY } from "@/lib/landing-intake/handoff";

const STAGES = ["Reading your diagnostic case", "Saving vehicle and code details"];

// The sign-in redirect target for a visitor who was mid-intake on the
// landing page (see lib/landing-intake/handoff.ts's saveIntakeForHandoff —
// /account/login?next=%2Fdiagnostics%2Ffrom-intake).
// Client-only by necessity: the preserved intake lives in sessionStorage,
// never the URL (see spec's "do not place long diagnostic content directly
// in URLs"), so this page must run in the browser to read it at all.
export default function FromIntakePage() {
  const router = useRouter();
  const [status, setStatus] = useState<"working" | "no_code" | "error">("working");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const raw = sessionStorage.getItem(LANDING_INTAKE_STORAGE_KEY);
      if (!raw) {
        router.replace("/diagnostics/upload");
        return;
      }

      let intake: unknown;
      try {
        intake = JSON.parse(raw);
      } catch {
        router.replace("/diagnostics/upload");
        return;
      }

      try {
        const res = await fetch("/api/diagnostics/create-from-intake", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intake }),
        });
        const data = await res.json().catch(() => ({}));

        if (cancelled) return;

        if (res.status === 422 && data.code === "NO_DTC_CODE") {
          setStatus("no_code");
          return;
        }
        if (!res.ok) {
          setStatus("error");
          return;
        }

        sessionStorage.removeItem(LANDING_INTAKE_STORAGE_KEY);
        router.replace(`/diagnostics/${data.caseId}`);
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (status === "no_code") {
    return (
      <div className="container-app px-6 py-16 text-center">
        <div className="mx-auto max-w-lg">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">No diagnostic code identified</h1>
          <p className="mt-3 text-[var(--text-secondary)]">
            We couldn&apos;t identify a specific DTC from your Diagnostic Consultation. Import a vehicle scan report
            instead, or start a new diagnostic case.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/diagnostics/upload"
              className="min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-2.5 font-semibold text-white transition hover:brightness-110"
            >
              Import Vehicle Scan
            </Link>
            <Link
              href="/"
              className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-6 py-2.5 font-semibold text-[var(--text-primary)] transition hover:border-[var(--border-red)]"
            >
              New Diagnostic Case
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="container-app px-6 py-16 text-center">
        <p className="text-[var(--text-secondary)]">Something went wrong saving your diagnostic case. Try again.</p>
        <Link href="/" className="mt-4 inline-block text-[var(--accent-red)] underline">
          Back to DTC Technician™
        </Link>
      </div>
    );
  }

  return (
    <div className="container-app px-6 py-16">
      <div className="mx-auto max-w-lg">
        <DiagnosticProgress stages={STAGES} />
      </div>
    </div>
  );
}
