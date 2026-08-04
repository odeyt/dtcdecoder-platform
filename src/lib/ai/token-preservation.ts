// Post-translation guard: verifies that every protected technical token in the
// canonical English source survives unchanged in a translated string. The
// translation system prompt already INSTRUCTS the model to preserve these, but
// instructions are not guarantees — this validates the output so a translation
// that dropped or mangled "P0420", a VIN, "PCM", or "12 V" can be rejected in
// favor of the English canonical (spec: "Validate protected tokens after
// translation. Reject or repair translations that modify protected values.").
//
// Pure and dependency-free so it can run server-side after any provider call
// and be unit-tested without a live model.

// Fixed module/network acronyms that must never be translated or altered.
const PROTECTED_ACRONYMS = [
  "PCM", "ECM", "ECU", "TCM", "BCM", "BECM", "ABS", "SRS", "TPMS", "EGR",
  "DPF", "SCR", "VVT", "MAF", "MAP", "IAT", "ECT", "CKP", "CMP", "DLC", "OBD",
  "CAN", "LIN", "FlexRay", "MOST", "ADAS", "HVAC", "EVAP", "VIN", "DTC",
];

// Ordered list of token patterns. Each match is treated as an opaque protected
// token that must appear verbatim in the translation.
const TOKEN_PATTERNS: RegExp[] = [
  // DTC fault codes, optional failure-type suffix: P0420, U0101-00, B1234, C0561
  /\b[PBCU][0-9][0-9A-F]{3}(?:-[0-9A-F]{2})?\b/gi,
  // 17-char VIN (no I/O/Q)
  /\b[A-HJ-NPR-Z0-9]{17}\b/g,
  // Measurements with unit: 12 V, 5 V, 60 Ω, 0.5 A, 100 Hz, 250 kPa, 30 psi,
  // 45 Nm, 90 °C, 200 °F, 1.5 bar, 12.6 mV, 4 mm. A trailing (?![A-Za-z])
  // (rather than \b) is required because symbol units like Ω/°C are not word
  // characters, so \b would not match after them.
  /\b\d+(?:\.\d+)?\s?(?:mV|kV|V|mΩ|kΩ|Ω|ohms?|mA|A|kHz|MHz|Hz|kPa|MPa|psi|bar|Nm|°C|°F|mm|cm|µs|ms)(?![A-Za-z])/gi,
  // Bank/Sensor and DLC pin references
  /\bBank\s?[0-9]+\s?Sensor\s?[0-9]+\b/gi,
  /\bDLC\s?pin\s?[0-9]+\b/gi,
  // CAN High / CAN Low
  /\bCAN\s?(?:High|Low)\b/gi,
  // Explicit reference-voltage phrase "5 V reference" is caught by the
  // measurement pattern for "5 V"; the word "reference" is natural language.
];

// Acronyms that collide with ordinary English words when matched
// case-insensitively — "can" (the modal verb) and "most" (the superlative)
// appear constantly in ordinary prose ("can all trigger", "in most areas"),
// and would otherwise be misidentified as the CAN-bus / MOST-network
// acronyms, producing a false "protected token dropped" verdict and an
// unwarranted English fallback. Confirmed live: real DTC reference content
// mentioning "...can all trigger P0420..." and "In most areas..." tripped
// this before the fix, with no CAN bus or MOST network content anywhere on
// the page. Real technical usage of these acronyms is always all-caps
// ("CAN bus", "MOST protocol"), so requiring exact case here loses no real
// protection.
const CASE_SENSITIVE_ACRONYMS = new Set(["CAN", "MAP", "MOST"]);

// Word-boundary regex for a literal acronym. Case-insensitive by default:
// token identity is compared case-insensitively (a dropped/translated
// acronym is the defect we guard against, not re-casing) — except for the
// handful above that collide with common English words, which require exact
// case to avoid a false-positive match on ordinary prose.
function acronymRegex(acr: string): RegExp {
  const escaped = acr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const flags = CASE_SENSITIVE_ACRONYMS.has(acr) ? "g" : "gi";
  return new RegExp(`\\b${escaped}\\b`, flags);
}

/**
 * Extract the multiset of protected tokens from a piece of text, normalized to
 * uppercase for case-insensitive comparison of the token identity (units and
 * codes are compared case-insensitively; the model must not re-case them, but
 * casing differences are not a safety defect the way a dropped code is).
 */
export function extractProtectedTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const pattern of TOKEN_PATTERNS) {
    for (const m of text.matchAll(pattern)) {
      tokens.push(m[0].replace(/\s+/g, " ").trim().toUpperCase());
    }
  }
  for (const acr of PROTECTED_ACRONYMS) {
    const count = (text.match(acronymRegex(acr)) ?? []).length;
    for (let i = 0; i < count; i++) tokens.push(acr.toUpperCase());
  }
  return tokens;
}

export interface TokenPreservationResult {
  ok: boolean;
  /** Protected tokens present in the source but missing/reduced in the translation. */
  missing: string[];
}

/**
 * Verify that every protected token in `source` appears at least as many times
 * in `translation`. Returns the tokens that were lost. A non-empty `missing`
 * means the translation must NOT be trusted — fall back to the English source.
 */
export function verifyTokenPreservation(source: string, translation: string): TokenPreservationResult {
  const sourceCounts = new Map<string, number>();
  for (const t of extractProtectedTokens(source)) {
    sourceCounts.set(t, (sourceCounts.get(t) ?? 0) + 1);
  }
  const translationCounts = new Map<string, number>();
  for (const t of extractProtectedTokens(translation)) {
    translationCounts.set(t, (translationCounts.get(t) ?? 0) + 1);
  }

  const missing: string[] = [];
  for (const [token, needed] of sourceCounts) {
    const have = translationCounts.get(token) ?? 0;
    if (have < needed) {
      for (let i = 0; i < needed - have; i++) missing.push(token);
    }
  }
  return { ok: missing.length === 0, missing };
}
