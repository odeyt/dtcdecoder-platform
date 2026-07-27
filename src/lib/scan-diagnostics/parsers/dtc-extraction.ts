// Shared DTC/VIN extraction pass reused by every generic-format parser.
// Deliberately its own copy of the DTC-code regex rather than importing
// src/lib/ai/grounding.ts's CODE_PATTERN — this module must stay fully
// decoupled from the unrelated AI-chat grounding feature.
import type { ParsedDtcCode } from "@/lib/scan-diagnostics/parsers/types";

// P/B/C/U + 4-6 hex-valid characters, optionally with a manufacturer
// subcode/failure-type suffix like "-16" or ".04". Widened from a
// decimal-only \d{3,4} (see docs/FULL_SCAN_DATA_LOSS_AUDIT.md finding #2) —
// that narrower pattern silently dropped any code with a hex letter glued
// directly on (P000B, B1054FF, U0100FF) and any 5-6 digit extended
// manufacturer-format code with no separator (U121183, P184481, C120700) —
// both real, common formats from non-US-market/aftermarket scan tools, not
// edge cases. The 4-6 range still matches every standard SAE J2012 4-digit
// code exactly as before (regex tries the longest run of hex chars up to
// 6, but a real 4-digit code is bounded by a non-hex character — space,
// punctuation, end of line — right after, so it naturally matches only 4).
const DTC_PATTERN = /\b([PBCU][0-9A-F]{4,6})(-[0-9A-Z]{1,3}|\.[0-9A-Z]{1,3})?\b/gi;

// 17-char VIN, excluding I/O/Q which are never valid VIN characters.
const VIN_PATTERN = /\b[A-HJ-NPR-Z0-9]{17}\b/g;

// Recognizes a status keyword at the very END of a DTC's line — this class
// of scan-tool export (LAUNCH X431 and similar) puts status after the
// description on the same line ("...Timing Over-Retarded Generic Type
// DTC,reference Only", "...(Inlet) Current"), not in a separate column.
// Matching "reference only" distinctly (rather than folding it into
// "current"/"history") preserves a real distinction the source draws that
// the app previously discarded entirely — see extraction.ts
// normalizeStoredDtcStatus.
const TRAILING_STATUS_PATTERN =
  /\b(current|history|pending|permanent|intermittent|stored|generic type dtc,\s*reference\s*only|reference\s*only)\s*$/i;

export function normalizeDtcCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

function splitTrailingStatus(text: string): { description: string | undefined; status: string | undefined } {
  const match = text.match(TRAILING_STATUS_PATTERN);
  if (!match || match.index === undefined) {
    return { description: text.trim() || undefined, status: undefined };
  }
  const status = match[1].trim();
  const description = text.slice(0, match.index).trim() || undefined;
  return { description, status };
}

// Extracts DTC codes from unstructured plain text (used by the TXT/HTML/
// PDF/XML parsers, and as CSV/JSON's fallback when no dedicated code
// column is found). Module association isn't inferable from plain text at
// this generic level, so it's left undefined — structured parsers that DO
// know the module fill it in themselves before merging. `status`, when a
// trailing status keyword is recognized on the same line, is now captured
// here too (previously only descriptionRaw was split out, silently
// dropping any inline status text for plain-text sources).
export function extractDtcCodesFromText(text: string): ParsedDtcCode[] {
  const results: ParsedDtcCode[] = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const matches = line.matchAll(DTC_PATTERN);
    for (const match of matches) {
      const code = normalizeDtcCode(match[0]);
      const restOfLine = line.slice((match.index ?? 0) + match[0].length).trim();
      const cleaned = restOfLine.replace(/^[-:\s]+/, "").trim();
      const { description, status } = splitTrailingStatus(cleaned);
      results.push({ code, descriptionRaw: description, status, sourceText: line.trim() || undefined });
    }
  }

  return results;
}

export function extractVinFromText(text: string): string | undefined {
  // Prefer a VIN that appears near the literal word "VIN" in the text.
  const vinKeywordIdx = text.search(/\bVIN\b/i);
  if (vinKeywordIdx !== -1) {
    const nearby = text.slice(vinKeywordIdx, vinKeywordIdx + 200);
    const nearbyMatch = nearby.match(VIN_PATTERN);
    if (nearbyMatch) return nearbyMatch[0].toUpperCase();
  }

  const anyMatch = text.match(VIN_PATTERN);
  return anyMatch ? anyMatch[0].toUpperCase() : undefined;
}

// In-memory mirror of the DB dedupe key in scan_dtc_records (module +
// system_name + code + status, NULLs coalesced) — keeps parser output
// consistent with what persistExtraction() will eventually write. Multi-
// system reports (e.g. the LAUNCH X431 format) can legitimately report the
// SAME code (module absent) from two different systems with the same
// status text — e.g. U012100 appears under both "Electric Power Steering"
// and "A/C System" with status History in each — so systemName must be
// part of the key or one of the two real, distinct findings is silently
// discarded as a false duplicate.
export function dedupeDtcCodes(codes: ParsedDtcCode[]): ParsedDtcCode[] {
  const seen = new Map<string, ParsedDtcCode>();
  for (const entry of codes) {
    const key = `${entry.module ?? ""}|${entry.systemName ?? ""}|${entry.code}|${entry.status ?? ""}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, entry);
    } else if (!existing.descriptionRaw && entry.descriptionRaw) {
      // Keep the first occurrence but backfill a description if the first
      // one didn't have one and a later duplicate does.
      seen.set(key, { ...existing, descriptionRaw: entry.descriptionRaw });
    }
  }
  return [...seen.values()];
}
