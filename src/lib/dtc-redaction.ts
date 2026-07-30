// Server-side redaction for the public /dtc/[code] reference pages —
// mirrors the same principle already established in
// src/lib/ai-diagnostics/redaction.ts: a free/anonymous visitor must never
// receive the locked portion of the content in ANY form (HTML, JSON, React
// props). A CSS blur over full content is not acceptable here either, for
// the same reason — it's inspectable via devtools/view-source. Everything
// gated below is stripped from the object before it ever reaches the page.
//
// Note this applies identically to search-engine crawlers, not just human
// visitors — there is no user-agent branching. Showing full content to
// Googlebot while showing a locked/reduced version to real visitors would
// be cloaking, which risks a manual action from Google. The accepted
// tradeoff is that these pages carry less indexable text than before.
import type { DtcCode, SubscriptionPlan } from "@/lib/types";
import type { LockedSectionRef } from "@/lib/ai-diagnostics/redaction";

export type DtcAccessLevel = "preview" | "full";

// Anonymous visitors are treated as "free" — same convention already used
// by the basic-search rate limiter (src/lib/basic-search/usage.ts).
export function accessLevelForDtcContent(plan: SubscriptionPlan): DtcAccessLevel {
  return plan === "free" ? "preview" : "full";
}

// How many of the ranked causes a preview visitor sees before the rest lock
// — enough to confirm relevance, not enough to be "the answer."
const PREVIEW_CAUSES_SHOWN = 1;

export interface DtcRedactionResult {
  accessLevel: DtcAccessLevel;
  visible: DtcCode;
  hiddenCausesCount: number;
  lockedSections: LockedSectionRef[];
}

export function filterDtcCodeForAccessLevel(dtc: DtcCode, accessLevel: DtcAccessLevel): DtcRedactionResult {
  if (accessLevel === "full") {
    return { accessLevel, visible: dtc, hiddenCausesCount: 0, lockedSections: [] };
  }

  const lockedSections: LockedSectionRef[] = [];
  if (dtc.diagnostic_steps.length > 0) {
    lockedSections.push({ key: "dtcDiagnosticSteps", title: "Recommended Diagnostic Checks" });
  }
  if (dtc.pdf_url || dtc.youtube_url) {
    lockedSections.push({ key: "dtcRepairResources", title: "Repair PDF / Video Walkthrough" });
  }

  return {
    accessLevel,
    visible: {
      ...dtc,
      causes: dtc.causes.slice(0, PREVIEW_CAUSES_SHOWN),
      diagnostic_steps: [],
      pdf_url: null,
      youtube_url: null,
      common_mistakes: null,
    },
    hiddenCausesCount: Math.max(0, dtc.causes.length - PREVIEW_CAUSES_SHOWN),
    lockedSections,
  };
}
