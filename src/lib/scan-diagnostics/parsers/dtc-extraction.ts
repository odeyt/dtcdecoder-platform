// Shared DTC/VIN extraction pass reused by every generic-format parser.
// Deliberately its own copy of the DTC-code regex rather than importing
// src/lib/ai/grounding.ts's CODE_PATTERN — this module must stay fully
// decoupled from the unrelated AI-chat grounding feature.
import type { ParsedDtcCode } from "@/lib/scan-diagnostics/parsers/types";

// P/B/C/U + 3-4 digits, optionally with a manufacturer subcode/failure-type
// suffix like "-16" or ".04" — preserves the suffix rather than discarding
// it, since it can carry real diagnostic meaning.
const DTC_PATTERN = /\b([PBCU]\d{3,4})(-[0-9A-Z]{1,3}|\.[0-9A-Z]{1,3})?\b/gi;

// 17-char VIN, excluding I/O/Q which are never valid VIN characters.
const VIN_PATTERN = /\b[A-HJ-NPR-Z0-9]{17}\b/g;

export function normalizeDtcCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

// Extracts DTC codes from unstructured plain text (used by the TXT/HTML/
// PDF/XML parsers, and as CSV/JSON's fallback when no dedicated code
// column is found). Module association isn't inferable from plain text at
// this generic level, so it's left undefined — structured parsers that DO
// know the module fill it in themselves before merging.
export function extractDtcCodesFromText(text: string): ParsedDtcCode[] {
  const results: ParsedDtcCode[] = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const matches = line.matchAll(DTC_PATTERN);
    for (const match of matches) {
      const code = normalizeDtcCode(match[0]);
      const restOfLine = line.slice((match.index ?? 0) + match[0].length).trim();
      const descriptionRaw = restOfLine.replace(/^[-:\s]+/, "").trim() || undefined;
      results.push({ code, descriptionRaw });
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

// In-memory mirror of the DB dedupe key in scan_dtc_records (module + code
// + status, NULLs coalesced) — keeps parser output consistent with what
// persistExtraction() will eventually write.
export function dedupeDtcCodes(codes: ParsedDtcCode[]): ParsedDtcCode[] {
  const seen = new Map<string, ParsedDtcCode>();
  for (const entry of codes) {
    const key = `${entry.module ?? ""}|${entry.code}|${entry.status ?? ""}`;
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
