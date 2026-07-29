// Static structure for the homepage "Digital Service Bay" hero
// (ServiceBayHero.tsx). Deliberately just data + canonical tokens — every
// string a visitor reads comes from the `serviceBay` translation namespace
// via its `labelKey`; this file only fixes the stable keys and the values
// actually sent to /api/public/diagnostic-intake.
//
// Locale-safety note: the deterministic intake engine
// (src/lib/landing-intake/engine.ts, untouched by this hero) matches the
// "status" step's message against English-only keyword regexes
// (/\bcurrent\b|\bactive\b/i etc.) — so STATUS_CHOICES.value below is
// always sent verbatim as the API `message`, regardless of UI locale, and
// only the displayed label is translated. Every other step's message is
// either locale-independent (a DTC code) or free text the engine stores
// without parsing (vehicle line, complaint) or checks purely by regex for
// a code substring (symptom description) — safe to send localized text.

export interface SymptomOption {
  key: string;
  labelKey: string;
}

export interface SymptomCategory {
  key: string;
  labelKey: string;
  options: SymptomOption[];
}

export const SYMPTOM_CATEGORIES: SymptomCategory[] = [
  {
    key: "engine",
    labelKey: "engine",
    options: [
      { key: "crankNoStart", labelKey: "crankNoStart" },
      { key: "startsStalls", labelKey: "startsStalls" },
      { key: "lossOfPower", labelKey: "lossOfPower" },
      { key: "misfire", labelKey: "misfire" },
      { key: "overheating", labelKey: "overheating" },
      { key: "roughIdle", labelKey: "roughIdle" },
      { key: "other", labelKey: "other" },
    ],
  },
  {
    key: "transmission",
    labelKey: "transmission",
    options: [
      { key: "hardShifting", labelKey: "hardShifting" },
      { key: "slippingGears", labelKey: "slippingGears" },
      { key: "delayedEngagement", labelKey: "delayedEngagement" },
      { key: "shiftNoise", labelKey: "shiftNoise" },
      { key: "wontEngage", labelKey: "wontEngage" },
      { key: "other", labelKey: "other" },
    ],
  },
  {
    key: "electrical",
    labelKey: "electrical",
    options: [
      { key: "batteryDrain", labelKey: "batteryDrain" },
      { key: "warningLights", labelKey: "warningLights" },
      { key: "intermittentPower", labelKey: "intermittentPower" },
      { key: "wontStart", labelKey: "wontStart" },
      { key: "flickeringLights", labelKey: "flickeringLights" },
      { key: "other", labelKey: "other" },
    ],
  },
  {
    key: "evHybrid",
    labelKey: "evHybrid",
    options: [
      { key: "reducedRange", labelKey: "reducedRange" },
      { key: "chargingFault", labelKey: "chargingFault" },
      { key: "hvWarning", labelKey: "hvWarning" },
      { key: "unusualNoise", labelKey: "unusualNoise" },
      { key: "powerLossHighway", labelKey: "powerLossHighway" },
      { key: "other", labelKey: "other" },
    ],
  },
  {
    key: "steering",
    labelKey: "steering",
    options: [
      { key: "looseSteering", labelKey: "looseSteering" },
      { key: "pullingToSide", labelKey: "pullingToSide" },
      { key: "turnNoise", labelKey: "turnNoise" },
      { key: "powerSteeringWarning", labelKey: "powerSteeringWarning" },
      { key: "vibration", labelKey: "vibration" },
      { key: "other", labelKey: "other" },
    ],
  },
  {
    key: "brakes",
    labelKey: "brakes",
    options: [
      { key: "softPedal", labelKey: "softPedal" },
      { key: "grindingNoise", labelKey: "grindingNoise" },
      { key: "pullingWhenBraking", labelKey: "pullingWhenBraking" },
      { key: "warningLightOn", labelKey: "warningLightOn" },
      { key: "brakeVibration", labelKey: "brakeVibration" },
      { key: "other", labelKey: "other" },
    ],
  },
  {
    key: "hvac",
    labelKey: "hvac",
    options: [
      { key: "noHeat", labelKey: "noHeat" },
      { key: "noAc", labelKey: "noAc" },
      { key: "weakAirflow", labelKey: "weakAirflow" },
      { key: "unusualSmell", labelKey: "unusualSmell" },
      { key: "blowerNoise", labelKey: "blowerNoise" },
      { key: "other", labelKey: "other" },
    ],
  },
];

// Shown at the DTC-code flow's final "complaint" step — a code is already
// known there, so this is a flat, generic list rather than the full
// category → symptom taxonomy the symptom-first flow uses.
export const COMMON_COMPLAINTS: string[] = [
  "checkEngineOnly",
  "roughIdleMisfire",
  "lossOfPower",
  "wontStart",
  "stalling",
  "reducedPerformance",
  "other",
];

// Canonical values sent verbatim as the "status" step's message — must stay
// in sync with engine.ts's STATUS_KEYWORDS. Labels are translated; values
// are not.
export const STATUS_CHOICES: Array<{ value: "current" | "history" | "pending" | "permanent" | "unknown"; labelKey: string }> = [
  { value: "current", labelKey: "current" },
  { value: "history", labelKey: "history" },
  { value: "pending", labelKey: "pending" },
  { value: "permanent", labelKey: "permanent" },
  { value: "unknown", labelKey: "unknown" },
];

// Honest, short stage lists for DiagnosticProgress — each pair describes
// the real network round trip a step actually performs, never a fabricated
// capability. See DiagnosticProgress.tsx's own header comment.
export const PROGRESS_STAGES = {
  codeSubmitted: ["progressReadingCode", "progressPreparingVehicleProfile"],
  vehicleSubmitted: ["progressVehicleIdentified", "progressBuildingProfile"],
  statusSubmitted: ["progressProfileUpdated", "progressAlmostReady"],
  complaintSubmitted: ["progressCrossReferencing", "progressPreparingSummary"],
  symptomSubmitted: ["progressAnalyzingSymptom", "progressCheckingForCode"],
  scanHandoff: ["progressPreparingBay", "progressOpeningUpload"],
  historyHandoff: ["progressOpeningHistory"],
} as const;
