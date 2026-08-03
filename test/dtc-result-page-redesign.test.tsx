// @vitest-environment jsdom
// Covers the DTC result-page redesign (docs/design/DTC_RESULT_PAGE.md).
//
// The headline change is the conversion panel: the page previously rendered
// LOCKED_SECTION_CATALOG through LockedResultPanel — nine placeholder cards,
// each with skeleton lines and its own "Upgrade" button. Nine near-identical
// CTAs read as a failed load rather than an offer.
//
// The cause/step components are deliberately thin. `DtcCode.causes` and
// `.diagnostic_steps` are `string[]`; there is no reasoning, confidence,
// tool, or expected value anywhere in the schema, so none is rendered and
// none is asserted here. Tests for those fields would only be possible by
// inventing them.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { RankedCauseList } from "@/components/RankedCauseList";
import { DiagnosticStepList } from "@/components/DiagnosticStepList";
import { ProfessionalReportUpsell } from "@/components/ProfessionalReportUpsell";
import { PROFESSIONAL_REPORT_ONE_TIME } from "@/lib/pricing";
import { LOCKED_SECTION_CATALOG } from "@/lib/ai-diagnostics/redaction";

vi.mock("@/lib/analytics/client", () => ({ recordClientEvent: vi.fn() }));

afterEach(cleanup);

const CAUSES = [
  "Vacuum leak in the intake boot or PCV hose",
  "Dirty or failing mass airflow sensor",
  "Faulty oxygen sensor",
];

describe("ranked causes", () => {
  it("renders every rank as visible text, not colour or badge alone", () => {
    render(<RankedCauseList causes={CAUSES.map((text, i) => ({ rank: i + 1, text }))} />);
    expect(screen.getByText("#1")).toBeTruthy();
    expect(screen.getByText("#2")).toBeTruthy();
    expect(screen.getByText("#3")).toBeTruthy();
  });

  it("marks only the first cause as most likely", () => {
    render(<RankedCauseList causes={CAUSES.map((text, i) => ({ rank: i + 1, text }))} />);
    expect(screen.getAllByText(/most likely/i)).toHaveLength(1);
    const top = screen.getByTestId("ranked-cause-1");
    expect(within(top).getByText(/most likely/i)).toBeTruthy();
  });

  it("renders the cause text verbatim", () => {
    render(<RankedCauseList causes={CAUSES.map((text, i) => ({ rank: i + 1, text }))} />);
    for (const text of CAUSES) expect(screen.getByText(text)).toBeTruthy();
  });

  it("uses an ordered list so rank is conveyed semantically", () => {
    const { container } = render(
      <RankedCauseList causes={CAUSES.map((text, i) => ({ rank: i + 1, text }))} />,
    );
    expect(container.querySelector("ol")).toBeTruthy();
  });

  it("renders nothing rather than an empty shell when there are no causes", () => {
    const { container } = render(<RankedCauseList causes={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("diagnostic workflow", () => {
  const STEPS = ["Check for stored freeze-frame data", "Inspect the intake tract for cracks"];

  it("numbers steps and renders their text unchanged", () => {
    render(<DiagnosticStepList steps={STEPS.map((text, i) => ({ step: i + 1, text }))} />);
    for (const text of STEPS) expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByTestId("diagnostic-step-1")).toBeTruthy();
    expect(screen.getByTestId("diagnostic-step-2")).toBeTruthy();
  });

  it("uses an ordered list", () => {
    const { container } = render(
      <DiagnosticStepList steps={STEPS.map((text, i) => ({ step: i + 1, text }))} />,
    );
    expect(container.querySelector("ol")).toBeTruthy();
  });

  it("handles an empty workflow safely", () => {
    const { container } = render(<DiagnosticStepList steps={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("professional report conversion panel", () => {
  it("uses DTC Technician terminology, not generic AI wording", () => {
    render(<ProfessionalReportUpsell signedIn />);
    expect(screen.getByRole("heading", { name: /complete the diagnosis with dtc technician/i })).toBeTruthy();
    expect(screen.queryByText(/unlock full ai diagnosis/i)).toBeNull();
    expect(screen.queryByText(/\bAI diagnosis\b/i)).toBeNull();
  });

  it("shows the canonical one-time price rather than a second hardcoded figure", () => {
    render(<ProfessionalReportUpsell signedIn />);
    const cta = screen.getByTestId("professional-report-cta");
    // Sourced from PROFESSIONAL_REPORT_ONE_TIME so a price change in
    // pricing.ts cannot leave this panel showing a stale number.
    expect(cta.textContent).toContain(PROFESSIONAL_REPORT_ONE_TIME.priceUsd.toFixed(2));
    expect(cta.textContent).toContain(PROFESSIONAL_REPORT_ONE_TIME.name);
  });

  it("offers exactly one primary purchase action and one secondary plans action", () => {
    render(<ProfessionalReportUpsell signedIn />);
    expect(screen.getAllByTestId("professional-report-cta")).toHaveLength(1);
    expect(screen.getAllByTestId("pro-plan-cta")).toHaveLength(1);
  });

  it("renders no repeated Upgrade buttons", () => {
    render(<ProfessionalReportUpsell signedIn />);
    expect(screen.queryAllByRole("button", { name: /^upgrade$/i })).toHaveLength(0);
    expect(screen.queryAllByRole("link", { name: /^upgrade$/i })).toHaveLength(0);
  });

  it("replaces the nine-card locked grid with a single panel", () => {
    render(<ProfessionalReportUpsell signedIn />);
    // Every locked-section title that used to occupy its own card, with its
    // own Upgrade button, is gone from this surface.
    for (const section of LOCKED_SECTION_CATALOG) {
      expect(screen.queryByText(section.title)).toBeNull();
    }
    expect(screen.getAllByTestId("professional-report-upsell")).toHaveLength(1);
  });

  it("states both what the free result already gives and what the report adds", () => {
    render(<ProfessionalReportUpsell signedIn />);
    expect(screen.getByText(/your free result includes/i)).toBeTruthy();
    expect(screen.getByText(/complete root-cause ranking/i)).toBeTruthy();
    expect(screen.getByText(/five dtc technician follow-up questions/i)).toBeTruthy();
    expect(screen.getByText(/one-time payment\. no subscription required\./i)).toBeTruthy();
  });

  it("sends an anonymous visitor through the existing sign-in resume flow", () => {
    render(<ProfessionalReportUpsell signedIn={false} />);
    const cta = screen.getByTestId("professional-report-cta") as HTMLAnchorElement;
    // Not a second checkout implementation: /pricing already knows how to
    // auto-resume this exact purchase after login.
    expect(cta.getAttribute("href")).toContain("/account/login");
    expect(cta.getAttribute("href")).toContain(encodeURIComponent(PROFESSIONAL_REPORT_ONE_TIME.key));
  });

  it("gives a signed-in visitor a real button rather than a link", () => {
    render(<ProfessionalReportUpsell signedIn />);
    expect(screen.getByTestId("professional-report-cta").tagName).toBe("BUTTON");
  });

  it("labels the panel for assistive technology", () => {
    render(<ProfessionalReportUpsell signedIn />);
    const panel = screen.getByTestId("professional-report-upsell");
    expect(panel.getAttribute("aria-labelledby")).toBe("professional-report-upsell-heading");
  });
});
