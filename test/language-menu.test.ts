import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  LANGUAGE_MENU_ORDER,
  getMenuLocales,
  getLocaleInfo,
} from "@/lib/i18n/locale-codes";

// Spec: the selector is generated from the central registry, shows every live
// language in its native name, in the defined order, with English as the
// first-visit default.
describe("language menu", () => {
  const menu = getMenuLocales();

  it("defaults first-time visitors to English", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(menu[0].code).toBe("en");
  });

  it("lists all 12 built languages", () => {
    expect(menu.map((m) => m.code)).toEqual([
      "en",
      "fr",
      "th",
      "lo",
      "vi",
      "km",
      "es",
      "zh-CN",
      "pt-BR",
      "de",
      "ja",
      "ko",
    ]);
  });

  it("renders each option in its native name", () => {
    const byCode = Object.fromEntries(menu.map((m) => [m.code, m.nativeName]));
    expect(byCode["en"]).toBe("English");
    expect(byCode["th"]).toBe("ไทย");
    expect(byCode["zh-CN"]).toBe("中文");
    expect(byCode["pt-BR"]).toBe("Português (Brasil)");
    expect(byCode["ja"]).toBe("日本語");
    expect(byCode["ko"]).toBe("한국어");
    expect(byCode["lo"]).toBe("ລາວ");
    expect(byCode["km"]).toBe("ខ្មែរ");
  });

  it("does not offer generic pt (only pt-BR)", () => {
    expect(menu.map((m) => m.code)).not.toContain("pt");
  });

  it("only offers locales that have display info", () => {
    for (const m of menu) {
      expect(getLocaleInfo(m.code)).toBeTruthy();
      expect(m.nativeName.length).toBeGreaterThan(0);
    }
  });

  it("menu order is a subset of the canonical order", () => {
    const order: string[] = [...LANGUAGE_MENU_ORDER];
    const positions = menu.map((m) => order.indexOf(m.code));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
