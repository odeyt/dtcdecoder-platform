import { describe, expect, it } from "vitest";
import {
  LIVE_LOCALES,
  DEFAULT_LOCALE,
  isLiveLocale,
  isRecognizedLocaleCode,
  getLocaleInfo,
} from "@/lib/i18n/locale-codes";

// These invariants underpin the proxy's locale gating: a recognized-but-not
// -live prefix (e.g. /fr) is redirected to English, while a live locale
// (/en, /es) renders. If the built/recognized distinction breaks, untranslated
// locales would serve English under a foreign <html lang> again.
describe("locale gating helpers", () => {
  it("treats only English and Spanish as live today", () => {
    expect([...LIVE_LOCALES].sort()).toEqual(["en", "es"]);
  });

  it("includes the default locale in the live set", () => {
    expect(isLiveLocale(DEFAULT_LOCALE)).toBe(true);
  });

  it("marks live locales as live", () => {
    expect(isLiveLocale("en")).toBe(true);
    expect(isLiveLocale("es")).toBe(true);
  });

  it("marks recognized-but-unbuilt locales as not live", () => {
    for (const code of ["fr", "de", "ar", "zh-CN", "pt"]) {
      expect(isRecognizedLocaleCode(code)).toBe(true);
      expect(isLiveLocale(code)).toBe(false);
    }
  });

  it("rejects unknown codes from both sets", () => {
    for (const code of ["xx", "zz", "klingon", ""]) {
      expect(isRecognizedLocaleCode(code)).toBe(false);
      expect(isLiveLocale(code)).toBe(false);
    }
  });

  it("is case-insensitive", () => {
    expect(isLiveLocale("EN")).toBe(true);
    expect(isLiveLocale("Es")).toBe(true);
    expect(isRecognizedLocaleCode("FR")).toBe(true);
  });

  it("every live locale is also a recognized routing code with display info", () => {
    for (const code of LIVE_LOCALES) {
      expect(isRecognizedLocaleCode(code)).toBe(true);
      expect(getLocaleInfo(code)?.nativeName).toBeTruthy();
    }
  });
});
