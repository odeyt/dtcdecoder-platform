// Detects genuinely dangerous conditions from the DTC's own real content
// (meaning/symptoms/causes/drive_recommendation) rather than fabricating a
// risk score — this only fires when the admin-authored text actually
// mentions one of these conditions.
const DANGER_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /overheat/i, label: "Overheating" },
  { pattern: /oil pressure/i, label: "Oil pressure loss" },
  { pattern: /brake failure|brake fluid loss|no brakes/i, label: "Brake failure" },
  { pattern: /fuel leak/i, label: "Fuel leakage" },
  { pattern: /smoke|\bfire\b/i, label: "Smoke or fire risk" },
  { pattern: /knock(ing)?/i, label: "Severe engine knocking" },
  { pattern: /steering/i, label: "Loss of steering" },
  { pattern: /flashing check engine|flashing mil/i, label: "Flashing check-engine light" },
];

export function detectSafetyWarnings(text: string): string[] {
  const found = new Set<string>();
  for (const { pattern, label } of DANGER_PATTERNS) {
    if (pattern.test(text)) found.add(label);
  }
  return [...found];
}
