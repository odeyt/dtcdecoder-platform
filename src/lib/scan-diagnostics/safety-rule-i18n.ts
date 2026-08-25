// M-DIAG0.1 Phase 5 (owner decision #8): resolves a safety-rule finding's
// message through the existing next-intl "scanSafetyRules" message
// catalog, keyed by ruleId, so the technician sees the warning in their
// selected language. The canonical English text in safety-rules.ts
// (finding.message) is always the fallback — a locale missing a specific
// rule's translation degrades to English, never to a blank or broken
// warning. No machine-translation call is made for this deterministic
// text; it only ever reads the static message catalog.
export function resolveLocalizedSafetyMessage(
  translate: (ruleId: string) => string,
  ruleId: string,
  canonicalEnglishMessage: string,
): string {
  try {
    const localized = translate(ruleId);
    return localized || canonicalEnglishMessage;
  } catch {
    return canonicalEnglishMessage;
  }
}
