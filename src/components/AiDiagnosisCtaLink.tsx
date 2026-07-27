"use client";

import Link from "next/link";
import type { ReactNode } from "react";

// Thin wrapper around next/link for the "Run Full AI Diagnosis" CTA that
// fires a best-effort analytics beacon on click before navigating away.
// `keepalive` lets the request survive the page unload the click triggers.
export function AiDiagnosisCtaLink({
  href,
  source,
  className,
  style,
  children,
}: {
  href: string;
  source: string;
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      style={style}
      onClick={() => {
        fetch("/api/analytics/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventType: "ai_diagnosis_cta_clicked", metadata: { source } }),
          keepalive: true,
        }).catch(() => {});
      }}
    >
      {children}
    </Link>
  );
}
