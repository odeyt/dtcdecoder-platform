// Single shared DTC normalization/classification utility. Consolidates
// logic that was previously scattered inline (searchDtcCodes, dtc-category,
// landing-intake/engine) — those call sites should migrate to this, not
// duplicate its rules again. Classification is derived purely from the
// code's own structure (SAE J2012), never a claim about a specific vehicle
// — see src/lib/dtc-category.ts's header comment for the same principle,
// which this module supersedes as the one normalization entry point.
import { deriveDtcCodeStructure, type DtcCodeCategory } from "@/lib/dtc-category";

export interface NormalizedDtcResult {
  rawInput: string;
  normalizedCode: string;
  family: string | null;
  numericSection: string | null;
  isValid: boolean;
  isGeneric: boolean;
  isManufacturerSpecific: boolean;
  isReserved: boolean;
  category: DtcCodeCategory | null;
  system: string | null;
  validationError: string | null;
}

// Benign separators a technician might type/paste (scanner output, voice
// dictation, copy-paste from a forum) — stripped before validation. Anything
// else left after this is either a real shape mismatch or unsafe input.
const BENIGN_SEPARATORS = /[\s\-_.]+/g;

const VALID_SHAPE = /^([PBCU])(\d)(\d)(\d{1,2})$/;

// Deliberately NOT a structural guess: this module doesn't claim to know
// which specific codes SAE J2012 has formally reserved-but-unassigned —
// that requires an authoritative per-code table, not a pattern rule invented
// here. "Reserved" is a fact about a specific code, recorded on that code's
// dtc_codes row (reserved_code) by a reviewer, not inferred from shape. A
// code with no database row is therefore always "generic, not yet in our
// database" or "manufacturer-specific" here — never "reserved" — the
// lookup service (src/lib/dtc-lookup.ts) is what layers the DB's
// reserved_code flag on top of this purely-structural result.

export function normalizeDtcInput(rawInput: string): NormalizedDtcResult {
  const trimmed = rawInput.trim();

  if (trimmed.length === 0) {
    return {
      rawInput,
      normalizedCode: "",
      family: null,
      numericSection: null,
      isValid: false,
      isGeneric: false,
      isManufacturerSpecific: false,
      isReserved: false,
      category: null,
      system: null,
      validationError: "Enter a DTC code.",
    };
  }

  // Reject anything containing a character that isn't alphanumeric or one
  // of the benign separators BEFORE stripping them — this is what catches
  // unsafe/malformed input (script tags, SQL-looking strings, etc.) rather
  // than silently normalizing them into something that happens to parse.
  if (!/^[A-Za-z0-9\s\-_.]+$/.test(trimmed)) {
    return {
      rawInput,
      normalizedCode: "",
      family: null,
      numericSection: null,
      isValid: false,
      isGeneric: false,
      isManufacturerSpecific: false,
      isReserved: false,
      category: null,
      system: null,
      validationError: "That doesn't look like a valid DTC code.",
    };
  }

  const collapsed = trimmed.replace(BENIGN_SEPARATORS, "").toUpperCase();
  const match = collapsed.match(VALID_SHAPE);

  if (!match) {
    return {
      rawInput,
      normalizedCode: collapsed,
      family: null,
      numericSection: null,
      isValid: false,
      isGeneric: false,
      isManufacturerSpecific: false,
      isReserved: false,
      category: null,
      system: null,
      validationError:
        "DTC codes are one letter (P, B, C, or U) followed by 3–4 digits, e.g. P0300.",
    };
  }

  const [, letter, , , numericSection] = match;
  const structure = deriveDtcCodeStructure(collapsed);

  return {
    rawInput,
    normalizedCode: collapsed,
    family: letter,
    numericSection,
    isValid: true,
    isGeneric: structure.type === "Generic OBD-II",
    isManufacturerSpecific: structure.type === "Manufacturer-specific",
    // Always false at this purely-structural layer — see the comment above
    // isReserved's use in the DB-backed lookup service instead.
    isReserved: false,
    category: structure.category,
    system: structure.system,
    validationError: null,
  };
}
