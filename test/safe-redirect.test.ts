import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/safe-redirect";

const SITE = "https://dtcdecoder.com";

// Every rejected candidate is also asserted against the real URL parser, so
// these tests fail if a future change re-introduces a guard that merely
// looks correct. `new URL(candidate, SITE)` is exactly what the auth
// callback does with whatever it accepts.
function resolvesOffSite(candidate: string): boolean {
  try {
    return new URL(candidate, SITE).origin !== SITE;
  } catch {
    return false;
  }
}

describe("safeRedirectPath — same-origin paths are honored", () => {
  it("accepts a plain path", () => {
    expect(safeRedirectPath("/account", SITE)).toBe("/account");
  });

  it("preserves query and hash", () => {
    expect(safeRedirectPath("/diagnostics?case=1#top", SITE)).toBe("/diagnostics?case=1#top");
  });

  it("returns null for absent input rather than throwing", () => {
    expect(safeRedirectPath(null, SITE)).toBeNull();
    expect(safeRedirectPath(undefined, SITE)).toBeNull();
    expect(safeRedirectPath("", SITE)).toBeNull();
  });
});

describe("safeRedirectPath — open-redirect payloads are rejected", () => {
  // The regression this whole module exists for. The previous guard was
  // `next.startsWith("/") && !next.startsWith("//")`, which accepts both of
  // these: the URL parser treats a backslash as a path separator in the
  // authority position, so they resolve to an attacker's host.
  it("rejects a backslash-smuggled authority (the original bypass)", () => {
    expect(resolvesOffSite("/\\evil.example")).toBe(true); // genuinely dangerous
    expect(safeRedirectPath("/\\evil.example", SITE)).toBeNull();
  });

  it("rejects a mixed backslash/slash authority", () => {
    expect(resolvesOffSite("/\\/evil.example")).toBe(true);
    expect(safeRedirectPath("/\\/evil.example", SITE)).toBeNull();
  });

  it("rejects a protocol-relative URL", () => {
    expect(safeRedirectPath("//evil.example", SITE)).toBeNull();
  });

  it("rejects absolute URLs, including ones naming our own origin", () => {
    expect(safeRedirectPath("https://evil.example/phish", SITE)).toBeNull();
    expect(safeRedirectPath(`${SITE}/account`, SITE)).toBeNull();
  });

  it("rejects non-http schemes", () => {
    expect(safeRedirectPath("javascript:alert(1)", SITE)).toBeNull();
    expect(safeRedirectPath("data:text/html,<script>", SITE)).toBeNull();
  });

  it("rejects anything not written as a site-relative path", () => {
    expect(safeRedirectPath("account", SITE)).toBeNull();
    expect(safeRedirectPath("\\/evil.example", SITE)).toBeNull();
  });
});

describe("safeRedirectPath — every accepted value stays on-origin", () => {
  // Property-style backstop: whatever the guard returns must resolve to the
  // site's own origin, for every candidate above.
  const candidates = [
    "/account",
    "/diagnostics?case=1#top",
    "/\\evil.example",
    "/\\/evil.example",
    "//evil.example",
    "https://evil.example/phish",
    `${SITE}/account`,
    "javascript:alert(1)",
    "data:text/html,<script>",
    "account",
    "\\/evil.example",
    "/..//evil.example",
    "/%2f%2fevil.example",
  ];

  it("never returns a path that resolves to another origin", () => {
    for (const candidate of candidates) {
      const result = safeRedirectPath(candidate, SITE);
      if (result === null) continue;
      expect(new URL(result, SITE).origin, `candidate ${JSON.stringify(candidate)}`).toBe(SITE);
    }
  });
});

describe("safeRedirectPath — malformed base URL", () => {
  it("returns null rather than throwing when the base is unusable", () => {
    expect(safeRedirectPath("/account", "not-a-url")).toBeNull();
  });
});
