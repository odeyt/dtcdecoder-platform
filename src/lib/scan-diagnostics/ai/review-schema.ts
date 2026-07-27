// Zod schema for the Anthropic reviewer's structured output
// (docs/MULTI_MODEL_ORCHESTRATOR.md §Reviewer). Deliberately a SEPARATE
// schema from DiagnosticAiOutputSchema (schemas.ts) — a review is a
// critique of a primary assessment, not a second assessment, and merging
// the two shapes would blur "the reviewer replaced the answer" with "the
// reviewer commented on the answer" (the merge step in review-merge.ts
// depends on that distinction staying clean).
//
// Adapted from the orchestrator spec's conceptual DiagnosticReview
// interface to this app's actual DiagnosticAiOutput shape: this app's
// ranked causes carry free-text supportingEvidence/contradictingEvidence
// strings, not evidence IDs, so `evidenceIds` here is free text referencing
// that evidence, not a foreign key into anything. testOrderCorrections'
// sequence numbers are 0-based indices into the primary output's
// recommendedTests array.
import { z } from "zod";

export const DiagnosticReviewDecisionSchema = z.enum([
  "approved",
  "approved_with_changes",
  "revision_required",
  "human_review_required",
]);
export type DiagnosticReviewDecision = z.infer<typeof DiagnosticReviewDecisionSchema>;

export const DiagnosticReviewSchema = z.object({
  decision: DiagnosticReviewDecisionSchema,
  unsupportedClaims: z.array(
    z.object({ path: z.string(), claim: z.string(), reason: z.string() }),
  ),
  missedCauses: z.array(
    z.object({ cause: z.string(), rationale: z.string(), evidenceIds: z.array(z.string()) }),
  ),
  unsafeRecommendations: z.array(
    z.object({ path: z.string(), recommendation: z.string(), reason: z.string() }),
  ),
  testOrderCorrections: z.array(
    z.object({ currentSequence: z.number().int(), recommendedSequence: z.number().int(), reason: z.string() }),
  ),
  confidenceAdjustment: z.object({
    original: z.number(),
    revised: z.number(),
    reason: z.string(),
  }),
  // path is a dotted pointer into the primary DiagnosticAiOutput, e.g.
  // "rankedCauses.0.cause" or "recommendedTests.1.expectedResult" — the only
  // paths review-merge.ts's applyCorrectedFields understands (see that
  // file's ALLOWED_FIELD_PATHS allowlist; an unrecognized path is logged
  // and skipped, never applied blindly).
  correctedFields: z.array(
    z.object({ path: z.string(), replacement: z.unknown(), reason: z.string() }),
  ),
  reviewerSummary: z.string(),
});
export type DiagnosticReview = z.infer<typeof DiagnosticReviewSchema>;
