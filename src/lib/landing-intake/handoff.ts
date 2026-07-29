// Client-side-only carrier for handing an anonymous visitor's in-progress
// landing intake across the sign-in redirect (never the URL — see spec
// "Do not place long diagnostic content directly in URLs"). Shared between
// the homepage hero and /diagnostics/from-intake, which reads this same key
// once the visitor is signed in.
import type { LandingDiagnosticIntake } from "@/lib/landing-intake/types";

export const LANDING_INTAKE_STORAGE_KEY = "dtc_landing_intake";

export function saveIntakeForHandoff(intake: LandingDiagnosticIntake) {
  try {
    sessionStorage.setItem(LANDING_INTAKE_STORAGE_KEY, JSON.stringify(intake));
  } catch {
    // sessionStorage can throw in a locked-down/private-browsing context —
    // losing the handoff convenience is an acceptable degradation, never a
    // crash of the intake flow itself.
  }
}
