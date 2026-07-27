// Derives a DTC code's Category/Type/System purely from the code's own
// structure — the SAE J2012 standard first-character/second-character
// convention every generic OBD-II code follows, not manufacturer-specific
// knowledge. This is public, well-established automotive-standards
// information (the same kind of fact already implicit in this app's DTC
// content), not a fabricated or inferred manufacturer definition — see the
// "Do not fabricate manufacturer-specific definitions" requirement this
// module exists to respect: it derives only what the code's structure
// itself guarantees, and callers must always label the result as
// "inferred from code structure," never presented as verified per-vehicle
// content.
export type DtcCodeCategory = "Powertrain" | "Body" | "Chassis" | "Network/Communication";
export type DtcCodeType = "Generic OBD-II" | "Manufacturer-specific";

export interface DtcCodeStructure {
  category: DtcCodeCategory | null;
  type: DtcCodeType | null;
  system: string | null;
  /** True only when both category and type were derivable — a caller can
   * use this to decide whether to render the section at all. */
  isDerivable: boolean;
}

const CATEGORY_BY_LETTER: Record<string, DtcCodeCategory> = {
  P: "Powertrain",
  B: "Body",
  C: "Chassis",
  U: "Network/Communication",
};

// SAE J2012: the second character is a digit — 0 or 2 means the code is
// part of the generic, SAE-defined set; 1 or 3 means manufacturer-defined.
// This split applies uniformly across all four letter prefixes.
function typeFromSecondChar(secondChar: string): DtcCodeType | null {
  if (secondChar === "0" || secondChar === "2") return "Generic OBD-II";
  if (secondChar === "1" || secondChar === "3") return "Manufacturer-specific";
  return null;
}

// SAE J2012's own sub-system grouping for GENERIC Powertrain codes, keyed
// by the third character. Only defined for the generic (0/2) range — this
// grouping is not part of the standard for manufacturer-specific codes, so
// no system is claimed there.
const POWERTRAIN_SYSTEM_BY_THIRD_CHAR: Record<string, string> = {
  "0": "Fuel and air metering",
  "1": "Fuel and air metering",
  "2": "Fuel and air metering — injector circuit",
  "3": "Ignition system or misfire",
  "4": "Auxiliary emissions controls",
  "5": "Vehicle speed control and idle control",
  "6": "Computer output circuit",
  "7": "Transmission",
  "8": "Transmission",
  "9": "Transmission",
};

export function deriveDtcCodeStructure(code: string): DtcCodeStructure {
  const normalized = code.trim().toUpperCase();
  const match = normalized.match(/^([PBCU])(\d)(\d)\d{1,2}$/);
  if (!match) {
    return { category: null, type: null, system: null, isDerivable: false };
  }

  const [, letter, secondChar, thirdChar] = match;
  const category = CATEGORY_BY_LETTER[letter] ?? null;
  const type = typeFromSecondChar(secondChar);

  let system: string | null = null;
  if (letter === "P" && (secondChar === "0" || secondChar === "2")) {
    system = POWERTRAIN_SYSTEM_BY_THIRD_CHAR[thirdChar] ?? null;
  }

  return { category, type, system, isDerivable: category !== null && type !== null };
}

// Validates the generic DTC code SHAPE (letter + 4-5 digits) without
// claiming the code is a real, known code — used to distinguish "invalid
// format" (reject before consuming any quota) from "valid format, just
// not in our database yet" (a genuine, quota-counting lookup attempt with
// a useful fallback result).
export function isValidDtcCodeFormat(code: string): boolean {
  return /^[PBCU]\d{3,4}$/i.test(code.trim());
}
