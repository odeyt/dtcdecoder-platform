// M-DIAG0.1 Phase 5/6 tests — safety warnings render through the existing
// locale architecture (owner decision #8), never forcing every non-English
// technician onto English-only warnings, while technical identifiers stay
// untouched (Phase 6 #16/#17). See docs/M-DIAG0.1-SAFETY-PROVENANCE-REMEDIATION.md.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { resolveLocalizedSafetyMessage } from "@/lib/scan-diagnostics/safety-rule-i18n";

const LIVE_LOCALES = ["en", "es", "fr", "de", "pt-BR", "vi", "zh-CN", "ja", "ko", "th", "lo", "km"];

const EXPECTED_RULE_IDS = [
  "high-cost-module-replacement-no-tests",
  "high-cost-module-replacement-untested",
  "ev-high-voltage-missing-ppe-warning",
  "airbag-squib-circuit-probing",
  "immobilizer-security-bypass",
  "comm-fault-module-replacement-without-power-ground-network-tests",
  "brake-hydraulic-work-missing-safety-guidance",
  "brake-unsafe-road-test-with-fault",
  "steering-work-missing-safety-guidance",
  "steering-lock-security-bypass",
  "steering-unsafe-road-test-with-fault",
  "fuel-system-pressurized-work-missing-safety-guidance",
  "fuel-system-ignition-source-hazard",
  "unsafe-road-test-general-hazard",
];

function loadMessages(locale: string): Record<string, unknown> {
  const p = path.join(process.cwd(), "messages", `${locale}.json`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

describe("scanSafetyRules message catalog — every live locale has every rule (Phase 6 #17)", () => {
  for (const locale of LIVE_LOCALES) {
    it(`${locale}.json defines a non-empty translation for every safety rule id`, () => {
      const messages = loadMessages(locale);
      const rules = messages.scanSafetyRules as Record<string, string> | undefined;
      expect(rules).toBeDefined();
      for (const ruleId of EXPECTED_RULE_IDS) {
        expect(rules![ruleId], `${locale} missing rule "${ruleId}"`).toBeTruthy();
        expect(typeof rules![ruleId]).toBe("string");
      }
    });
  }

  it("a non-English locale's safety-rule text is not simply the English string copy-pasted (real translation exists, not a stub)", () => {
    const en = loadMessages("en").scanSafetyRules as Record<string, string>;
    const es = loadMessages("es").scanSafetyRules as Record<string, string>;
    for (const ruleId of EXPECTED_RULE_IDS) {
      expect(es[ruleId]).not.toBe(en[ruleId]);
    }
  });
});

describe("resolveLocalizedSafetyMessage — fallback behavior (Phase 5)", () => {
  it("returns the localized text when the translator resolves the key", () => {
    const translate = (ruleId: string) => `[es] ${ruleId}`;
    const result = resolveLocalizedSafetyMessage(translate, "immobilizer-security-bypass", "English fallback");
    expect(result).toBe("[es] immobilizer-security-bypass");
  });

  it("falls back to the canonical English message when the translator throws (missing key)", () => {
    const translate = () => {
      throw new Error("MISSING_MESSAGE");
    };
    const result = resolveLocalizedSafetyMessage(translate, "some-future-rule-id", "English fallback");
    expect(result).toBe("English fallback");
  });

  it("falls back to the canonical English message when the translator returns an empty string", () => {
    const translate = () => "";
    const result = resolveLocalizedSafetyMessage(translate, "some-rule-id", "English fallback");
    expect(result).toBe("English fallback");
  });

  it("never returns a blank or broken warning — always either the localized or the English text", () => {
    const throwing = () => {
      throw new Error("x");
    };
    const result = resolveLocalizedSafetyMessage(throwing, "x", "English fallback");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("Technical identifiers are structurally untouched by translation (Phase 6 #16)", () => {
  // Safety-rule message TEXT is translated (Phase 5), but the DTC codes,
  // module identifiers, ruleId, and severity on a SafetyFinding are never
  // part of any translated string — they are separate, untranslated
  // fields on the finding object itself (see safety-rules.ts SafetyFinding
  // and ScanDtcRecord.code/module in types.ts). This test documents and
  // locks that structural guarantee: translating a rule's message can
  // never alter a ruleId, since ruleId is the *lookup key* into the
  // catalog, not translated content.
  it("the ruleId used to look up a translation is never itself run through translation", () => {
    const seenKeys: string[] = [];
    const translate = (ruleId: string) => {
      seenKeys.push(ruleId);
      return `translated:${ruleId}`;
    };
    resolveLocalizedSafetyMessage(translate, "ev-high-voltage-missing-ppe-warning", "fallback");
    expect(seenKeys).toEqual(["ev-high-voltage-missing-ppe-warning"]);
  });
});
