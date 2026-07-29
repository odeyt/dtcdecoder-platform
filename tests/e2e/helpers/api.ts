// Direct API-route assertions (Phase 7/8) — server-side authorization is
// the real security boundary, not UI visibility, so these hit routes
// directly via Playwright's APIRequestContext rather than only through the
// browser.
import type { APIRequestContext } from "@playwright/test";

export async function postDiagnosticEngineTurn(
  request: APIRequestContext,
  caseId: string,
  requestId: string,
): Promise<{ status: number; body: unknown }> {
  const res = await request.post(`/api/diagnostic-engine/v1/cases/${caseId}/turn`, {
    data: { requestId },
    failOnStatusCode: false,
  });
  const body = await res.json().catch(() => null);
  return { status: res.status(), body };
}

export async function createScanCase(
  request: APIRequestContext,
  fields: Record<string, unknown> = {},
): Promise<{ status: number; caseId: string | null }> {
  const res = await request.post("/api/scan-diagnostics/cases", {
    data: fields,
    failOnStatusCode: false,
  });
  const body = await res.json().catch(() => null);
  const caseId = (body as { case?: { id?: string } } | null)?.case?.id ?? null;
  return { status: res.status(), caseId };
}
