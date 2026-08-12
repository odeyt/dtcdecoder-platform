import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

// Loads the REAL shipped public/sw.js (not a duplicated copy) via the
// CommonJS export guarded by `typeof module !== "undefined"` at the bottom
// of that file — a no-op in a real ServiceWorkerGlobalScope, so this is the
// exact policy logic the browser runs.
const require = createRequire(import.meta.url);
const sw = require("../public/sw.js");

describe("service worker cache policy — isNetworkOnlyPath", () => {
  it("never lets an /api/ request be intercepted for caching", () => {
    expect(sw.isNetworkOnlyPath("/api/ai/assistant")).toBe(true);
    expect(sw.isNetworkOnlyPath("/api/scan-diagnostics/cases/abc/analyze")).toBe(true);
    expect(sw.isNetworkOnlyPath("/api/webhooks/creem")).toBe(true);
    expect(sw.isNetworkOnlyPath("/api/account/billing-portal")).toBe(true);
    expect(sw.isNetworkOnlyPath("/api/vin/decode")).toBe(true);
  });

  it("does not flag ordinary navigations as network-only (they get the offline fallback instead)", () => {
    expect(sw.isNetworkOnlyPath("/account")).toBe(false);
    expect(sw.isNetworkOnlyPath("/diagnostics/abc")).toBe(false);
    expect(sw.isNetworkOnlyPath("/pricing")).toBe(false);
    expect(sw.isNetworkOnlyPath("/")).toBe(false);
  });
});

describe("service worker cache policy — isStaticAsset", () => {
  it("matches Next's content-hashed build assets", () => {
    expect(sw.isStaticAsset("/_next/static/chunks/main-abc123.js")).toBe(true);
  });

  it("matches the generated icon set", () => {
    expect(sw.isStaticAsset("/icons/icon-192.png")).toBe(true);
  });

  it("matches fonts and other build assets nested under _next/static", () => {
    expect(sw.isStaticAsset("/_next/static/media/font-abc123.woff2")).toBe(true);
    expect(sw.isStaticAsset("/_next/static/chunks/0vforlehol292.css")).toBe(true);
  });

  it("does not match API or page routes", () => {
    expect(sw.isStaticAsset("/api/ai/assistant")).toBe(false);
    expect(sw.isStaticAsset("/account")).toBe(false);
  });

  it("does not match /sw.js itself, even though it ends in .js — no generic extension fallback", () => {
    expect(sw.isStaticAsset("/sw.js")).toBe(false);
  });

  it("does not match a same-named .js/.css file outside the two allowed prefixes", () => {
    expect(sw.isStaticAsset("/some/random/script.js")).toBe(false);
    expect(sw.isStaticAsset("/some/random/style.css")).toBe(false);
  });
});

describe("service worker precache list", () => {
  it("precaches the offline fallback page and the manifest icons", () => {
    expect(sw.PRECACHE_URLS).toContain("/offline");
    expect(sw.PRECACHE_URLS).toContain("/icons/icon-192.png");
    expect(sw.PRECACHE_URLS).toContain("/icons/icon-512.png");
  });

  it("never precaches an /api/ path", () => {
    for (const url of sw.PRECACHE_URLS) {
      expect(sw.isNetworkOnlyPath(url)).toBe(false);
    }
  });
});
