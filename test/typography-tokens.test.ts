// Golden-file style check on the canonical typography system
// (docs/design/TYPOGRAPHY_SYSTEM.md, src/app/globals.css) — asserts the
// design tokens/prose class this pass introduced actually exist with the
// right shape, without needing a full browser render. Real visual/computed-
// style verification happens in Playwright (tests/e2e/smoke/typography.spec.ts).
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf-8");

describe("typography design tokens (globals.css)", () => {
  it("keeps the existing near-white/soft-gray/muted-gray text token values", () => {
    expect(css).toMatch(/--text-primary:\s*#f5f3f1/);
    expect(css).toMatch(/--text-secondary:\s*#a8a6ad/);
    expect(css).toMatch(/--text-muted:\s*#86838c/);
  });

  it("sets a 16px/1.65 body baseline", () => {
    expect(css).toMatch(/font-size:\s*16px/);
    expect(css).toMatch(/line-height:\s*1\.65/);
  });

  it("defines the canonical .prose-diagnostic class with a readable content width", () => {
    expect(css).toMatch(/\.prose-diagnostic\s*\{/);
    expect(css).toMatch(/max-width:\s*74ch/);
  });

  it("defines a full heading scale (h1-h4) inside the prose class", () => {
    for (const level of ["h1", "h2", "h3", "h4"]) {
      expect(css).toMatch(new RegExp(`\\.prose-diagnostic ${level}\\s*\\{`));
    }
  });

  it("never sets a heading weight at 800 or 900 (reserved-for-marketing rule)", () => {
    const headingBlockMatch = css.match(/\.prose-diagnostic h1\s*\{[^}]*\}/);
    expect(headingBlockMatch).not.toBeNull();
    expect(headingBlockMatch![0]).not.toMatch(/font-weight:\s*(800|900)/);
  });

  it("styles code/pre blocks with the mono font and a bounded, scrollable container", () => {
    expect(css).toMatch(/\.prose-diagnostic code\s*\{[\s\S]*?font-family:\s*var\(--font-mono\)/);
    expect(css).toMatch(/\.prose-diagnostic pre\s*\{[\s\S]*?overflow-x:\s*auto/);
  });

  it("wraps tables so they never overflow the page horizontally", () => {
    expect(css).toMatch(/\.prose-diagnostic table\s*\{[\s\S]*?overflow-x:\s*auto/);
  });

  it("defines the inline technical-value (DTC/VIN/measurement) monospace utility", () => {
    expect(css).toMatch(/\.tech-value\s*\{[\s\S]*?font-family:\s*var\(--font-mono\)/);
  });

  it("keeps the Geist font variables wired into Tailwind's font-sans/font-mono", () => {
    expect(css).toMatch(/--font-sans:\s*var\(--font-geist-sans\)/);
    expect(css).toMatch(/--font-mono:\s*var\(--font-geist-mono\)/);
  });

  it("still respects prefers-reduced-motion (unrelated to typography, must not regress)", () => {
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });
});
