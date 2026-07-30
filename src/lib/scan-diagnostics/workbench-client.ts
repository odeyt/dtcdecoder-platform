// Client-safe fetch wrappers for the Diagnostic Workbench API routes
// (src/app/api/scan-diagnostics/cases/[caseId]/...). No "server-only" here —
// this file is imported by client components. Each function throws on a
// non-2xx response so callers can drive an honest saving/saved/error state
// instead of assuming success.
import type {
  ScanCaseNote,
  ScanCaseNoteCategory,
  ScanCauseStatus,
  ScanCaseVerification,
  ScanReportCauseStatus,
  ScanReportTestProgress,
  ScanTestOutcome,
} from "@/lib/types";
import type { CompletionSummary } from "@/lib/scan-diagnostics/workbench";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

function base(caseId: string) {
  return `/api/scan-diagnostics/cases/${caseId}`;
}

export async function createNote(
  caseId: string,
  input: { category: ScanCaseNoteCategory; body: string; pinned?: boolean },
): Promise<ScanCaseNote> {
  const { note } = await request<{ note: ScanCaseNote }>(`${base(caseId)}/notes`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return note;
}

export async function updateNote(
  caseId: string,
  noteId: string,
  input: Partial<{ category: ScanCaseNoteCategory; body: string; pinned: boolean }>,
): Promise<ScanCaseNote> {
  const { note } = await request<{ note: ScanCaseNote }>(`${base(caseId)}/notes/${noteId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return note;
}

export async function deleteNote(caseId: string, noteId: string): Promise<void> {
  await request<{ ok: true }>(`${base(caseId)}/notes/${noteId}`, { method: "DELETE" });
}

export async function updateTestProgress(
  caseId: string,
  testIndex: number,
  input: Partial<{ completed: boolean; outcome: ScanTestOutcome; actualResult: string; technicianNote: string }>,
): Promise<ScanReportTestProgress> {
  const { progress } = await request<{ progress: ScanReportTestProgress }>(`${base(caseId)}/tests/${testIndex}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return progress;
}

export async function updateCauseStatus(
  caseId: string,
  causeIndex: number,
  input: Partial<{ status: ScanCauseStatus; reviewed: boolean }>,
): Promise<ScanReportCauseStatus> {
  const { status } = await request<{ status: ScanReportCauseStatus }>(`${base(caseId)}/causes/${causeIndex}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return status;
}

export async function updateVerification(
  caseId: string,
  input: Partial<{
    concernResolved: boolean;
    dtcsCleared: boolean;
    dtcsDidNotReturn: boolean;
    calibrationCompleted: boolean;
    roadTestCompleted: boolean;
    noNewWarningLights: boolean;
    postRepairScanReviewed: boolean;
    customerNotesRecorded: boolean;
  }>,
): Promise<ScanCaseVerification> {
  const { verification } = await request<{ verification: ScanCaseVerification }>(`${base(caseId)}/verification`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return verification;
}

export async function fetchCompletionSummary(caseId: string): Promise<CompletionSummary> {
  const { summary } = await request<{ summary: CompletionSummary }>(`${base(caseId)}/complete`);
  return summary;
}

export async function markCaseComplete(caseId: string): Promise<void> {
  await request<{ case: unknown }>(`${base(caseId)}/complete`, { method: "POST" });
}
