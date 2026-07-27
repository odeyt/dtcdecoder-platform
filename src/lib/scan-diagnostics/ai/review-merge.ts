// Deterministic application of the Anthropic reviewer's correctedFields
// onto the primary provider's output — the code, not the reviewer model,
// decides what actually changes (docs/MULTI_MODEL_ORCHESTRATOR.md
// "Apply corrections through deterministic code. Do not allow the reviewer
// to silently replace the complete primary output."). Every applied and
// skipped correction is recorded so the merge is fully auditable.
//
// Deliberately conservative in two ways beyond "only allowlisted paths":
// (1) missedCauses and unsafeRecommendations are NEVER auto-merged into the
// trusted output — they're informational findings surfaced alongside the
// report (missedCauses as a reviewer note, unsafeRecommendations feeding
// the existing deterministic safety-rules pass that already runs on the
// merged output in analyze.ts). Auto-appending a reviewer-invented "ranked
// cause" would let a second model inject unvalidated structure into a
// result that already passed schema validation once; (2) a correction is
// only applied when its replacement's runtime type (and, for
// confidenceLevel, its enum membership) matches the field it's replacing.
import type { DiagnosticAiOutput, ConfidenceLevel } from "@/lib/scan-diagnostics/schemas";
import type { DiagnosticReview } from "@/lib/scan-diagnostics/ai/review-schema";

export interface MergedField {
  path: string;
  original: unknown;
  replacement: unknown;
  reason: string;
}

export interface SkippedCorrection {
  path: string;
  reason: string;
}

export interface ReviewMergeResult {
  output: DiagnosticAiOutput;
  appliedCorrections: MergedField[];
  skippedCorrections: SkippedCorrection[];
}

const CONFIDENCE_LEVELS: ConfidenceLevel[] = ["high", "medium", "low", "insufficient_evidence"];

// Every path this merge will ever apply, whitelisted explicitly — an
// unrecognized path (a reviewer hallucination, or a future schema field
// this allowlist hasn't been updated for yet) is always skipped, never
// applied blindly.
const ALLOWED_PATH_PATTERN =
  /^(summary|rankedCauses\.(\d+)\.(cause|rationale|confidenceLevel)|recommendedTests\.(\d+)\.(step|purpose|expectedResult))$/;

function resolvePath(output: DiagnosticAiOutput, path: string): { container: Record<string, unknown> | unknown[]; key: string | number } | null {
  const segments = path.split(".");
  let target: unknown = output;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (target === null || typeof target !== "object") return null;
    target = Array.isArray(target) ? target[Number(seg)] : (target as Record<string, unknown>)[seg];
  }
  if (target === null || typeof target !== "object") return null;
  const lastSeg = segments[segments.length - 1];
  const key = Array.isArray(target) ? Number(lastSeg) : lastSeg;
  return { container: target as Record<string, unknown> | unknown[], key };
}

function readField(container: Record<string, unknown> | unknown[], key: string | number): unknown {
  return Array.isArray(container) ? container[key as number] : container[key as string];
}

function writeField(container: Record<string, unknown> | unknown[], key: string | number, value: unknown): void {
  if (Array.isArray(container)) container[key as number] = value;
  else container[key as string] = value;
}

export function applyReviewCorrections(primary: DiagnosticAiOutput, review: DiagnosticReview): ReviewMergeResult {
  // JSON round-trip clone rather than structuredClone — the output is
  // guaranteed JSON-serializable (string/number/array fields only, see
  // DiagnosticAiOutputSchema), and this avoids depending on a DOM-lib-only
  // global in a server-only module.
  const output: DiagnosticAiOutput = JSON.parse(JSON.stringify(primary));
  const appliedCorrections: MergedField[] = [];
  const skippedCorrections: SkippedCorrection[] = [];

  for (const correction of review.correctedFields) {
    if (!ALLOWED_PATH_PATTERN.test(correction.path)) {
      skippedCorrections.push({ path: correction.path, reason: "Path is not on the correctable-field allowlist." });
      continue;
    }

    const resolved = resolvePath(output, correction.path);
    if (!resolved) {
      skippedCorrections.push({ path: correction.path, reason: "Path did not resolve inside the primary output." });
      continue;
    }

    const original = readField(resolved.container, resolved.key);
    if (original === undefined) {
      skippedCorrections.push({ path: correction.path, reason: "Path did not resolve to an existing field." });
      continue;
    }

    if (correction.path.endsWith(".confidenceLevel")) {
      if (typeof correction.replacement !== "string" || !CONFIDENCE_LEVELS.includes(correction.replacement as ConfidenceLevel)) {
        skippedCorrections.push({
          path: correction.path,
          reason: "confidenceLevel replacement must be one of high/medium/low/insufficient_evidence.",
        });
        continue;
      }
    } else if (typeof correction.replacement !== typeof original) {
      skippedCorrections.push({
        path: correction.path,
        reason: `Replacement type (${typeof correction.replacement}) does not match the original field's type (${typeof original}).`,
      });
      continue;
    }

    writeField(resolved.container, resolved.key, correction.replacement);
    appliedCorrections.push({
      path: correction.path,
      original,
      replacement: correction.replacement,
      reason: correction.reason,
    });
  }

  return { output, appliedCorrections, skippedCorrections };
}
