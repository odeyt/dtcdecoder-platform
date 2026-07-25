import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LIVE_LOCALES } from "@/lib/i18n/locale-codes";

// English is the canonical source catalog. Every other catalog file must have
// EXACTLY the same set of keys — no missing keys (would fall back to English
// or, worse, surface a raw key) and no extra/stale keys. This test fails CI
// the moment a catalog drifts out of parity.

const MESSAGES_DIR = join(process.cwd(), "messages");

function flatKeys(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object") return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return v !== null && typeof v === "object" && !Array.isArray(v) ? flatKeys(v, key) : [key];
  });
}

function loadCatalog(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8"));
}

const catalogFiles = readdirSync(MESSAGES_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));

const canonicalKeys = new Set(flatKeys(loadCatalog("en")));

describe("catalog parity (English is canonical)", () => {
  it("has an English canonical catalog with keys", () => {
    expect(canonicalKeys.size).toBeGreaterThan(0);
  });

  it("ships a catalog file for every LIVE_LOCALE", () => {
    for (const locale of LIVE_LOCALES) {
      expect(catalogFiles).toContain(locale);
    }
  });

  for (const locale of catalogFiles) {
    if (locale === "en") continue;

    describe(`${locale}.json`, () => {
      const keys = new Set(flatKeys(loadCatalog(locale)));

      it("is missing no canonical keys", () => {
        const missing = [...canonicalKeys].filter((k) => !keys.has(k));
        expect(missing, `missing keys in ${locale}: ${missing.slice(0, 20).join(", ")}`).toEqual([]);
      });

      it("has no extra/stale keys", () => {
        const extra = [...keys].filter((k) => !canonicalKeys.has(k));
        expect(extra, `extra keys in ${locale}: ${extra.slice(0, 20).join(", ")}`).toEqual([]);
      });
    });
  }
});
