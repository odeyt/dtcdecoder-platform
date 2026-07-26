import { describe, expect, it } from "vitest";
import { localizeContentHref } from "@/lib/i18n/localized-href";

// Spec: switching locale preserves the current page where an equivalent route
// exists. localizeContentHref prefixes public content routes with the active
// locale; (app)-shell routes (cookie-driven) and external/default hrefs pass
// through unchanged.
describe("localizeContentHref", () => {
  it("leaves everything unprefixed for the default locale (English)", () => {
    expect(localizeContentHref("/dtc", "en")).toBe("/dtc");
    expect(localizeContentHref("/", "en")).toBe("/");
  });

  it("prefixes public content routes with a non-default live locale", () => {
    expect(localizeContentHref("/dtc", "es")).toBe("/es/dtc");
    expect(localizeContentHref("/blog", "fr")).toBe("/fr/blog");
    expect(localizeContentHref("/", "th")).toBe("/th");
    expect(localizeContentHref("/dtc?q=P0420", "de")).toBe("/de/dtc?q=P0420");
  });

  it("handles region codes", () => {
    expect(localizeContentHref("/dtc", "zh-CN")).toBe("/zh-CN/dtc");
    expect(localizeContentHref("/dtc", "pt-BR")).toBe("/pt-BR/dtc");
  });

  it("never prefixes (app)-shell routes (cookie-driven, no URL locale)", () => {
    expect(localizeContentHref("/pricing", "es")).toBe("/pricing");
    expect(localizeContentHref("/account/login", "fr")).toBe("/account/login");
    expect(localizeContentHref("/faq", "th")).toBe("/faq");
  });

  it("does not double-prefix an already-localized href", () => {
    expect(localizeContentHref("/es/dtc", "es")).toBe("/es/dtc");
    expect(localizeContentHref("/th", "th")).toBe("/th");
  });

  it("leaves external, hash, and relative hrefs untouched", () => {
    expect(localizeContentHref("https://youtube.com", "es")).toBe("https://youtube.com");
    expect(localizeContentHref("#top", "es")).toBe("#top");
    expect(localizeContentHref("mailto:x@y.com", "es")).toBe("mailto:x@y.com");
  });
});
