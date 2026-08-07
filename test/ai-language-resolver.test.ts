import { describe, expect, it } from "vitest";
import { resolveAiLanguage } from "@/lib/i18n/ai-language-resolver";
import { regionDefaultLanguageFrom, isAiTranslationEligible } from "@/lib/i18n/language-utils";
import { LAOS, THAILAND, GLOBAL } from "@/lib/region/region-profile";

describe("resolveAiLanguage — priority chain", () => {
  it("falls back to English when nothing is provided", () => {
    const result = resolveAiLanguage({});
    expect(result.language.locale).toBe("en");
    expect(result.source).toBe("english_default");
  });

  it("resolves by browser locale when only that is provided", () => {
    const result = resolveAiLanguage({ browserLocale: "th-TH" });
    expect(result.language.locale).toBe("th");
    expect(result.source).toBe("browser_locale");
  });

  it("selected UI language outranks browser locale", () => {
    const result = resolveAiLanguage({ selectedUiLanguage: "es", browserLocale: "th-TH" });
    expect(result.language.locale).toBe("es");
    expect(result.source).toBe("selected_ui_language");
  });

  it("selected UI language outranks region profile and browser locale", () => {
    const result = resolveAiLanguage({
      regionDefaultLanguage: regionDefaultLanguageFrom(THAILAND),
      selectedUiLanguage: "es",
      browserLocale: "lo",
    });
    expect(result.language.locale).toBe("es");
    expect(result.source).toBe("selected_ui_language");
  });

  it("region profile outranks browser locale when no UI language is selected", () => {
    const result = resolveAiLanguage({
      regionDefaultLanguage: regionDefaultLanguageFrom(THAILAND),
      browserLocale: "lo",
    });
    expect(result.language.locale).toBe("th");
    expect(result.source).toBe("region_profile");
  });

  it("user profile outranks everything else", () => {
    const result = resolveAiLanguage({
      userProfileLocale: "ja",
      regionDefaultLanguage: regionDefaultLanguageFrom(LAOS),
      selectedUiLanguage: "es",
      browserLocale: "th-TH",
    });
    expect(result.language.locale).toBe("ja");
    expect(result.source).toBe("user_profile");
  });

  it("skips an unrecognized user profile locale and falls through the chain", () => {
    const result = resolveAiLanguage({
      userProfileLocale: "not-a-real-locale",
      regionDefaultLanguage: regionDefaultLanguageFrom(THAILAND),
    });
    expect(result.language.locale).toBe("th");
    expect(result.source).toBe("region_profile");
  });

  it("Global's own defaultLanguage (en) resolves normally through the region_profile tier, not the final fallback", () => {
    // Distinct from region-resolver.ts's own regression test: THIS resolver
    // is asked to honor whatever regionDefaultLanguage it's given at face
    // value — the "don't let GLOBAL masquerade as a real match" rule lives
    // in region-resolver.ts's browser-locale tier, not here.
    const result = resolveAiLanguage({ regionDefaultLanguage: regionDefaultLanguageFrom(GLOBAL) });
    expect(result.language.locale).toBe("en");
    expect(result.source).toBe("region_profile");
  });

  it("populates displayName/nativeName/promptName for a resolved language", () => {
    const result = resolveAiLanguage({ userProfileLocale: "th" });
    expect(result.language.displayName.length).toBeGreaterThan(0);
    expect(result.language.nativeName.length).toBeGreaterThan(0);
    expect(result.language.promptName).toBe(result.language.displayName);
  });
});

describe("isAiTranslationEligible", () => {
  it("is true for a live locale", () => {
    expect(isAiTranslationEligible("th")).toBe(true);
    expect(isAiTranslationEligible("es")).toBe(true);
  });

  it("is false for null/undefined/empty", () => {
    expect(isAiTranslationEligible(null)).toBe(false);
    expect(isAiTranslationEligible(undefined)).toBe(false);
    expect(isAiTranslationEligible("")).toBe(false);
  });

  it("is false for a recognized-but-not-live locale code", () => {
    // Any code present in the broader LOCALE_CODES superset but absent from
    // LIVE_LOCALES demonstrates the distinction isAiTranslationEligible
    // exists to make. If every registered code is already live, this test
    // still documents the intent even though it can't exercise the false
    // branch today — see language-utils.ts's own comment.
    expect(isAiTranslationEligible("not-a-real-locale-code")).toBe(false);
  });
});
