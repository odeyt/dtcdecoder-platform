// Fails a test on unexpected console.error / uncaught page errors instead of
// letting them pass silently (Phase 6). Call attach() right after the page
// is created (before navigation) and assertClean() at the end of the test —
// don't rely on an afterEach alone, since some errors only matter relative
// to a specific action.
import type { Page } from "@playwright/test";

// Kept intentionally short and specific — a broad ignore pattern here would
// defeat the purpose of this monitor. Add an entry only with a comment
// explaining exactly why that message is expected noise.
const EXPECTED_PATTERNS: RegExp[] = [
  // Next.js dev-mode fast-refresh notices are not real errors.
  /\[Fast Refresh\]/,
];

export interface ConsoleMonitor {
  errors: string[];
  pageErrors: string[];
  assertClean(): void;
}

export function attachConsoleMonitor(page: Page): ConsoleMonitor {
  const errors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (EXPECTED_PATTERNS.some((p) => p.test(text))) return;
    errors.push(text);
  });

  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });

  return {
    errors,
    pageErrors,
    assertClean() {
      if (errors.length > 0 || pageErrors.length > 0) {
        const details = [...errors.map((e) => `console.error: ${e}`), ...pageErrors.map((e) => `pageerror: ${e}`)].join("\n");
        throw new Error(`Unexpected console/page errors:\n${details}`);
      }
    },
  };
}
