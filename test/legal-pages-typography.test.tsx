// @vitest-environment jsdom
// Verifies the typography modernization pass (docs/design/TYPOGRAPHY_SYSTEM.md):
// legal/FAQ-style pages use the canonical `.prose-diagnostic` class and bare
// semantic heading/paragraph/list tags instead of the old per-element
// `text-zinc-*`/`text-white` utility repetition. These are the sync, no-
// dependency legal pages — a representative sample of the 11 that were
// migrated identically.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import TermsPage from "@/app/(app)/terms/page";
import PrivacyPage from "@/app/(app)/privacy/page";
import DpaPage from "@/app/(app)/dpa/page";
import AffiliateDisclosurePage from "@/app/(app)/affiliate-disclosure/page";

const PAGES = [
  ["Terms", TermsPage],
  ["Privacy", PrivacyPage],
  ["DPA", DpaPage],
  ["Affiliate Disclosure", AffiliateDisclosurePage],
] as const;

describe.each(PAGES)("%s page typography", (_name, Page) => {
  it("wraps content in the canonical prose-diagnostic class, not hardcoded zinc utilities", () => {
    const { container } = render(<Page />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("prose-diagnostic");
    expect(container.innerHTML).not.toMatch(/text-zinc-\d/);
    // The old pattern hardcoded "text-white" on every heading/strong — the
    // prose class now supplies heading/strong color, so no element should
    // still carry it explicitly.
    expect(container.innerHTML).not.toMatch(/class="[^"]*\btext-white\b/);
  });

  it("uses a real semantic <h1>, not a styled div", () => {
    const { container } = render(<Page />);
    const h1 = container.querySelector("h1");
    expect(h1).not.toBeNull();
    // Bare heading — no per-instance className duplicating what the prose
    // class already provides.
    expect(h1?.className).toBe("");
  });

  it("does not skip a heading level (h1 followed by h2, never h3+ directly)", () => {
    const { container } = render(<Page />);
    const headings = [...container.querySelectorAll("h1, h2, h3, h4")].map((h) =>
      Number(h.tagName[1]),
    );
    for (let i = 1; i < headings.length; i++) {
      expect(headings[i] - headings[i - 1]).toBeLessThanOrEqual(1);
    }
  });
});
