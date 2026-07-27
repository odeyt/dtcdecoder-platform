// Shared shape between the landing hero's client component
// (LandingDtcTechnician) and the public diagnostic intake API
// (POST /api/public/diagnostic-intake, Slice 3). Deliberately a plain
// serializable object — this is the ONLY state carried between an
// unauthenticated visitor's browser and the deterministic intake endpoint,
// never anything that reaches a paid provider directly.
export interface LandingDiagnosticIntake {
  year?: string;
  make?: string;
  model?: string;
  engine?: string;
  vin?: string;
  dtcCodes: string[];
  symptoms?: string;
  complaint?: string;
  currentCodeStatus?: "current" | "history" | "pending" | "permanent" | "unknown";
  scanUploadRequested?: boolean;
  locale: string;
  currentStep: string;
}

export function emptyIntake(locale: string): LandingDiagnosticIntake {
  return { dtcCodes: [], locale, currentStep: "issue" };
}

export type PublicIntakeStatus = "needs_more_information" | "basic_result" | "sign_in_required" | "upgrade_required";

export interface PublicIntakeBasicResult {
  dtcCode: string;
  definition: string;
  category: string;
  genericSymptoms: string[];
  genericCauses: string[];
  basicChecks: string[];
  safetyWarnings: string[];
  manufacturerSpecificUncertainty?: string;
}

export interface PublicIntakeNextQuestion {
  field: string;
  responseType: "text" | "choice";
  choices?: string[];
}

export interface PublicIntakeAction {
  key: string;
  label: string;
}

export interface PublicIntakeResponse {
  status: PublicIntakeStatus;
  message: string;
  nextQuestion?: PublicIntakeNextQuestion;
  basicResult?: PublicIntakeBasicResult;
  preservedIntake: LandingDiagnosticIntake;
  actions: PublicIntakeAction[];
}

export interface PublicIntakeErrorResponse {
  error: string;
  code?: string;
}
