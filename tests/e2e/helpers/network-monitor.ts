// Tracks failed requests, 5xx responses, and Diagnostic Engine provider-turn
// calls for a page (Phase 6). Attach before navigation.
import type { Page, Request } from "@playwright/test";

export interface NetworkMonitor {
  failedRequests: string[];
  serverErrors: Array<{ url: string; status: number }>;
  diagnosticEngineTurnCalls: string[];
  duplicateRequestIds: string[];
  assertNoServerErrors(): void;
  assertNoDuplicateTurnCalls(): void;
}

export function attachNetworkMonitor(page: Page): NetworkMonitor {
  const failedRequests: string[] = [];
  const serverErrors: Array<{ url: string; status: number }> = [];
  const diagnosticEngineTurnCalls: string[] = [];
  const seenRequestIds = new Set<string>();
  const duplicateRequestIds: string[] = [];

  page.on("requestfailed", (request: Request) => {
    failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "unknown"}`);
  });

  page.on("response", (response) => {
    const url = response.url();
    if (response.status() >= 500) {
      serverErrors.push({ url, status: response.status() });
    }
    if (/\/api\/diagnostic-engine\/v1\/cases\/[^/]+\/turn/.test(url)) {
      diagnosticEngineTurnCalls.push(url);
    }
  });

  page.on("request", (request) => {
    if (!/\/api\/diagnostic-engine\/v1\/cases\/[^/]+\/turn/.test(request.url())) return;
    try {
      const body = request.postDataJSON() as { requestId?: string } | null;
      const requestId = body?.requestId;
      if (!requestId) return;
      if (seenRequestIds.has(requestId)) duplicateRequestIds.push(requestId);
      seenRequestIds.add(requestId);
    } catch {
      // Non-JSON body — nothing to dedupe on.
    }
  });

  return {
    failedRequests,
    serverErrors,
    diagnosticEngineTurnCalls,
    duplicateRequestIds,
    assertNoServerErrors() {
      if (serverErrors.length > 0) {
        throw new Error(`Unexpected 5xx responses:\n${serverErrors.map((e) => `${e.status} ${e.url}`).join("\n")}`);
      }
    },
    assertNoDuplicateTurnCalls() {
      if (duplicateRequestIds.length > 0) {
        throw new Error(`Duplicate diagnostic-engine turn requestId(s): ${duplicateRequestIds.join(", ")}`);
      }
    },
  };
}
