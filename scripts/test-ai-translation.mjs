#!/usr/bin/env node
// Live test for the AI diagnostic-translation pipeline (Slice 5, item 5).
//
// This is a STANDALONE script, not a call into src/lib/ai/assistant.ts —
// that module starts with `import "server-only"`, which throws outside a
// Next.js server context. The system prompt below is duplicated from
// buildTranslationSystemPrompt() in src/lib/ai/assistant.ts on purpose; if
// that function's wording changes, update this copy to match, or the
// preservation checks here will drift from what the app actually sends.
//
// Requires a real ANTHROPIC_API_KEY in the environment. Refuses to run
// without one. Never logs the key itself.
//
// Usage:
//   ANTHROPIC_API_KEY=sk-ant-... node scripts/test-ai-translation.mjs

import Anthropic from "@anthropic-ai/sdk";

const API_KEY = process.env.ANTHROPIC_API_KEY;

if (!API_KEY || API_KEY.trim() === "") {
  console.error(
    "ANTHROPIC_API_KEY is not set. Refusing to run — this script makes real, " +
      "billed API calls and cannot be executed without a real key.\n" +
      "Set it for this invocation only, e.g.:\n" +
      "  ANTHROPIC_API_KEY=sk-ant-... node scripts/test-ai-translation.mjs",
  );
  process.exit(1);
}

const client = new Anthropic({ apiKey: API_KEY });

// One fixed canonical English diagnostic explanation (P0420, 2018 Toyota
// Camry) — every language below translates this SAME text, never a fresh
// diagnosis. This mirrors the app's real behavior: the diagnosis is decided
// once in English, and every locale gets a translation of that fixed text.
const CANONICAL_TEXT = `Diagnostic Trouble Code P0420 — Catalyst System Efficiency Below Threshold (Bank 1)
Vehicle: 2018 Toyota Camry (VIN: JTDBE40E699012345)

What this means:
P0420 indicates the Powertrain Control Module (PCM) has detected that the three-way catalytic converter on Bank 1 is no longer converting exhaust gases as efficiently as expected. The PCM compares the switching pattern of the upstream (Bank 1, Sensor 1) and downstream (Bank 1, Sensor 2) oxygen sensors — when the downstream sensor's voltage output starts to mirror the upstream sensor too closely (typically outside the expected 0.1–0.9V range of low correlation), the catalyst is flagged as degraded.

Most likely causes, ranked by frequency on this platform:
1. Deteriorated or failed catalytic converter (most common on Camrys past 100,000 miles)
2. Downstream oxygen sensor (Bank 1, Sensor 2) contamination or failure
3. Exhaust leak upstream of the catalytic converter, allowing false air into the exhaust stream
4. Engine misfire or rich/lean fuel condition causing thermal damage to the catalyst over time

Recommended diagnostic steps:
1. Scan for additional codes — a standalone P0420 with no misfire or fuel trim codes points toward the catalyst or sensor itself
2. Inspect the exhaust system for leaks between the engine and the catalytic converter
3. Monitor live Bank 1 Sensor 1 and Sensor 2 voltage waveforms with a scan tool; healthy catalysts show a much flatter, dampened waveform downstream compared to upstream
4. If the catalytic converter requires replacement, torque the mounting bolts to the manufacturer specification of 45 Nm

Driving recommendation: Safe to drive short-term, but schedule diagnosis soon — prolonged operation with a failing catalyst can lead to emissions test failure and, in rare cases, further exhaust system damage.`;

const TEST_LOCALES = [
  { code: "es", englishName: "Spanish" },
  { code: "lo", englishName: "Lao" },
  { code: "ar", englishName: "Arabic" },
  { code: "zh-CN", englishName: "Chinese (Simplified)" },
  { code: "th", englishName: "Thai" },
];

// Duplicated from buildTranslationSystemPrompt() in src/lib/ai/assistant.ts.
// No glossary rows are injected here (this script has no DB access) — the
// live app additionally injects terminology_glossary rows per locale, which
// this test does not exercise.
function buildTranslationSystemPrompt(outputLanguageName, outputLocale) {
  return `You are a precise technical translator for automotive diagnostic content. Translate the following English diagnostic explanation into ${outputLanguageName} (locale: ${outputLocale}).

Non-negotiable rules:
- Preserve DTC codes (e.g. P0420), VINs, part numbers, connector/pin names, wire colors, CAN High/CAN Low/LIN/FlexRay/MOST, voltages, resistance/pressure/torque/temperature values and their units, module acronyms (PCM, ECU, ABS, etc.), calibration IDs, and TSB numbers exactly as written in the source — never translate or alter them.
- Do not add, remove, reinterpret, or reorder any diagnostic content. This is a translation task, not a new diagnosis — the conclusion, ranked causes, and recommended steps must match the source exactly in meaning and order.
- Preserve the original structure (headings, lists, paragraph breaks).
- Write naturally in ${outputLanguageName}, not a stilted word-for-word rendering.`;
}

// Preservation checks are limited to what buildTranslationSystemPrompt()
// actually guarantees (DTC codes / VINs / module acronyms / values+units).
// "Bank 1" / "Sensor 2" are NOT checked verbatim — the app's own rules
// don't mandate preserving those as opaque tokens, so a legitimate
// translation could render them and still be correct.
function checkPreservation(translated) {
  const checks = {
    dtcCodePreserved: translated.includes("P0420"),
    vinPreserved: translated.includes("JTDBE40E699012345"),
    acronymPreserved: translated.includes("PCM"),
    voltageRangePreserved: /0[.,]1.{0,3}0[.,]9\s*V/.test(translated),
    torqueValuePreserved: translated.includes("45 Nm"),
    // Heuristic ordering check: two 4-item numbered lists in the source
    // should produce roughly 8 numbered-list markers in the translation.
    listStructurePreserved: (translated.match(/(?:^|\n)\s*[1-4][.．]/g) ?? []).length >= 6,
  };
  const passed = Object.values(checks).every(Boolean);
  return { checks, passed };
}

async function translate(locale) {
  const systemPrompt = buildTranslationSystemPrompt(locale.englishName, locale.code);
  const message = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2048,
    system: systemPrompt,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    messages: [{ role: "user", content: CANONICAL_TEXT }],
  });
  const textBlock = message.content.find((b) => b.type === "text");
  return textBlock?.text ?? "";
}

async function main() {
  console.log(`Testing AI translation pipeline against ${TEST_LOCALES.length} languages.`);
  console.log("Canonical case: P0420, 2018 Toyota Camry\n");

  const results = [];
  for (const locale of TEST_LOCALES) {
    process.stdout.write(`  ${locale.englishName} (${locale.code}) ... `);
    try {
      const translated = await translate(locale);
      const { checks, passed } = checkPreservation(translated);
      results.push({ locale, translated, checks, passed, error: null });
      console.log(passed ? "PASS" : "FAIL");
      if (!passed) {
        for (const [name, ok] of Object.entries(checks)) {
          if (!ok) console.log(`      ✗ ${name}`);
        }
      }
    } catch (err) {
      results.push({ locale, translated: null, checks: null, passed: false, error: String(err) });
      console.log("ERROR");
      console.log(`      ${String(err)}`);
    }
  }

  console.log("\n--- Summary ---");
  const passCount = results.filter((r) => r.passed).length;
  for (const r of results) {
    console.log(`${r.passed ? "PASS" : "FAIL"}  ${r.locale.englishName} (${r.locale.code})`);
  }
  console.log(`\n${passCount}/${results.length} languages passed all preservation checks.`);

  if (passCount !== results.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Unexpected script failure:", err);
  process.exit(1);
});
