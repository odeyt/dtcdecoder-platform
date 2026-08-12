import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { APP_SHELL_TOP_LEVEL_SEGMENTS } from "@/lib/i18n/app-shell-routes";

// The file's own header comment is the spec under test: "Every folder under
// src/app/(app)/ must have its top segment listed here, or proxy.ts will
// incorrectly try to rewrite it into the [locale] content tree." Reads the
// REAL src/app/(app)/ directory (not a hand-maintained duplicate list) so
// adding a new (app)-shell route without registering it here fails this
// test immediately, instead of silently 404ing/mis-localizing in
// production — the exact regression this test exists to catch.
describe("APP_SHELL_TOP_LEVEL_SEGMENTS", () => {
  it("lists every real subdirectory of src/app/(app)/", () => {
    const appShellDir = join(process.cwd(), "src", "app", "(app)");
    const actualSegments = readdirSync(appShellDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    // Sanity check the directory read itself isn't accidentally empty
    // (e.g. wrong cwd) before trusting a passing diff against it.
    expect(actualSegments.length).toBeGreaterThan(15);

    const missing = actualSegments.filter((seg) => !APP_SHELL_TOP_LEVEL_SEGMENTS.has(seg));
    expect(missing).toEqual([]);
  });

  it("includes 'api', the one entry with no matching (app)/ directory", () => {
    // src/app/api/ is a sibling of the (app) route group, not nested inside
    // it — still needs to be in this set since proxy.ts checks it against
    // the same URL first-segment, regardless of which directory it lives in.
    expect(APP_SHELL_TOP_LEVEL_SEGMENTS.has("api")).toBe(true);
  });

  it("includes the PWA-related routes added alongside the service worker", () => {
    expect(APP_SHELL_TOP_LEVEL_SEGMENTS.has("offline")).toBe(true);
    expect(APP_SHELL_TOP_LEVEL_SEGMENTS.has("install")).toBe(true);
  });
});
