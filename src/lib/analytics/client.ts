"use client";

// The only client-reachable analytics touch point (POST /api/analytics/event
// — see that route for validation). Fire-and-forget: a dropped analytics
// beacon must never block or surface an error to the user for a genuine UI
// interaction. Metadata must stay small, structured, non-sensitive tags
// (a DTC code, a source label) — never diagnostic free text.
import type { AnalyticsEventType } from "@/lib/analytics/events";

export function recordClientEvent(eventType: AnalyticsEventType, metadata?: Record<string, unknown>): void {
  fetch("/api/analytics/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventType, metadata: metadata ?? {} }),
    keepalive: true,
  }).catch(() => {
    // Best-effort — losing an analytics beacon is never worth surfacing.
  });
}
