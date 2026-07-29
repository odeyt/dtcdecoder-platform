// Every record created by the E2E suite must be identifiable as synthetic
// and tied to the run that created it (Phase 6/20), so cleanup can target
// exactly — and only — what this run created.
const RUN_ID = process.env.E2E_RUN_ID ?? `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function e2eRunId(): string {
  return RUN_ID;
}

export function syntheticEmail(label: string): string {
  return `${label}-${RUN_ID}@dtcdecoder-e2e-test.invalid`;
}

export function syntheticRequestId(label: string): string {
  return `e2e-${RUN_ID}-${label}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isSyntheticEmail(email: string | null | undefined): boolean {
  return !!email && email.endsWith("@dtcdecoder-e2e-test.invalid");
}
