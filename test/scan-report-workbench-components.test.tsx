// @vitest-environment jsdom
// Component tests for the Diagnostic Workbench's interactive report
// sections. Each test wraps components in a real NextIntlClientProvider
// with the actual en.json catalog (not a stub) — this doubles as a
// translation-key smoke test: a missing/renamed key would surface as a
// next-intl MISSING_MESSAGE error here, not just silently render blank.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import en from "../messages/en.json";
import { WorkbenchSaveStatusProvider, SaveStatusIndicator } from "@/components/scan-report/WorkbenchSaveStatus";
import { TestPlanSection } from "@/components/scan-report/TestPlanSection";
import { LikelyCausesSection } from "@/components/scan-report/LikelyCausesSection";
import { TechnicianNotesSection } from "@/components/scan-report/TechnicianNotesSection";
import { VerificationChecklistSection } from "@/components/scan-report/VerificationChecklistSection";
import { CaseCompletionSection } from "@/components/scan-report/CaseCompletionSection";
import { CopyReportButton } from "@/components/scan-report/CopyReportButton";
import type { ScanReportVisibleResult } from "@/lib/ai-diagnostics/redaction";

function withProviders(children: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC" now={new Date()} formats={{}}>
      <WorkbenchSaveStatusProvider>{children}</WorkbenchSaveStatusProvider>
    </NextIntlClientProvider>
  );
}

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // Default fallback for any call not given a specific mockReturnValueOnce —
  // in particular the fire-and-forget analytics beacon (recordClientEvent)
  // that every successful/failed save now also triggers alongside the real
  // API call under test.
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TestPlanSection", () => {
  const tests = [{ step: "Check battery voltage", purpose: "Rule out low voltage", expectedResult: "12.6V or higher" }];

  it("renders a not-tested pill by default and shows the save status after marking pass", async () => {
    fetchMock.mockReturnValueOnce(
      jsonResponse({
        progress: {
          id: "p1",
          case_id: "case-1",
          report_id: "report-1",
          test_index: 0,
          completed: true,
          outcome: "pass",
          actual_result: null,
          technician_note: null,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      }),
    );

    const user = userEvent.setup();
    render(withProviders(<TestPlanSection caseId="case-1" tests={tests} initialProgress={[]} />));

    // "Not tested" is ambiguous on its own — it's both the pill's initial
    // label and the "Not tested" outcome button's label.
    expect(screen.getByRole("button", { name: "Not tested" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Pass" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Pass" })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByText("Passed test")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/scan-diagnostics/cases/case-1/tests/0",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("shows an empty state when there are no recommended tests", () => {
    render(withProviders(<TestPlanSection caseId="case-1" tests={[]} initialProgress={[]} />));
    expect(screen.getByText("None recommended.")).toBeInTheDocument();
  });
});

describe("LikelyCausesSection", () => {
  const causes = [
    {
      cause: "Failing coil pack",
      confidenceLevel: "high" as const,
      rationale: "Misfire pattern matches",
      supportingEvidence: ["P0301 present"],
      contradictingEvidence: [],
      confirmationTestsRequired: ["Swap coil and retest"],
    },
  ];

  it("marks the top candidate and updates status after clicking Confirmed", async () => {
    fetchMock.mockReturnValueOnce(
      jsonResponse({
        status: {
          id: "s1",
          case_id: "case-1",
          report_id: "report-1",
          cause_index: 0,
          status: "confirmed",
          reviewed: false,
          updated_at: new Date().toISOString(),
        },
      }),
    );

    const user = userEvent.setup();
    render(withProviders(<LikelyCausesSection caseId="case-1" causes={causes} initialStatus={[]} />));

    expect(screen.getByText("TOP CANDIDATE")).toBeInTheDocument();
    expect(screen.getByText("Untested")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirmed" }));

    // Both the status pill and the now-active button read "Confirmed" once
    // the mutation resolves — assert the button's pressed state specifically
    // rather than a bare text match, which would be ambiguous between them.
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmed" })).toHaveAttribute("aria-pressed", "true"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/scan-diagnostics/cases/case-1/causes/0",
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});

describe("TechnicianNotesSection", () => {
  it("shows the empty state, then adds a note and displays it", async () => {
    fetchMock.mockReturnValueOnce(
      jsonResponse({
        note: {
          id: "n1",
          case_id: "case-1",
          user_id: "user-1",
          category: "observation",
          body: "Voltage reads 11.9V at idle",
          pinned: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      }),
    );

    const user = userEvent.setup();
    render(withProviders(<TechnicianNotesSection caseId="case-1" initialNotes={[]} />));

    expect(screen.getByText("No notes yet for this case.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Note text"), "Voltage reads 11.9V at idle");
    await user.click(screen.getByRole("button", { name: "Add note" }));

    await waitFor(() => expect(screen.getByText("Voltage reads 11.9V at idle")).toBeInTheDocument());
  });
});

describe("VerificationChecklistSection", () => {
  it("toggles a checklist item and calls the verification API", async () => {
    fetchMock.mockReturnValueOnce(
      jsonResponse({
        verification: {
          case_id: "case-1",
          concern_resolved: true,
          dtcs_cleared: false,
          dtcs_did_not_return: false,
          calibration_completed: false,
          road_test_completed: false,
          no_new_warning_lights: false,
          post_repair_scan_reviewed: false,
          customer_notes_recorded: false,
          updated_at: new Date().toISOString(),
        },
      }),
    );

    const user = userEvent.setup();
    render(withProviders(<VerificationChecklistSection caseId="case-1" initialVerification={null} />));

    const checkbox = screen.getByLabelText("Customer's original concern resolved");
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);

    await waitFor(() => expect(checkbox).toBeChecked());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/scan-diagnostics/cases/case-1/verification",
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});

describe("CaseCompletionSection", () => {
  const summary = {
    totalTests: 2,
    completedTests: 1,
    openTests: 1,
    failedTests: 0,
    totalCauses: 1,
    unresolvedCauses: 1,
    verificationTotal: 8,
    verificationCompleted: 0,
    readyToComplete: false,
  };

  it("shows the pre-completion summary and advisory note, then marks complete", async () => {
    fetchMock.mockReturnValueOnce(jsonResponse({ case: { id: "case-1" } }));

    const user = userEvent.setup();
    render(withProviders(<CaseCompletionSection caseId="case-1" summary={summary} initialCompletedAt={null} />));

    expect(screen.getByText("Tests completed: 1 / 2")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Some tests, causes, or checklist items are still open. You can still mark this case complete if you have a reason to skip them.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mark case complete" }));

    await waitFor(() => expect(screen.getByText(/Case marked complete on/)).toBeInTheDocument());
  });

  it("renders the completed state directly when already completed", () => {
    render(
      withProviders(
        <CaseCompletionSection caseId="case-1" summary={summary} initialCompletedAt="2026-01-01T00:00:00.000Z" />,
      ),
    );
    expect(screen.getByText(/Case marked complete on/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark case complete" })).not.toBeInTheDocument();
  });
});

describe("CopyReportButton", () => {
  const result: ScanReportVisibleResult = {
    vehicleSummary: { vin: null, make: "Honda", model: "Civic", modelYear: 2019, engine: null, odometerMiles: null },
    dtcs: [{ module: null, code: "P0301", status: "current" }],
    safety: { findings: [] },
    schemaVersion: "2.0",
    scannerMeta: {
      scannerBrand: null,
      diagnosticApplicationVersion: null,
      vehicleSoftwareVersion: null,
      diagnosticPath: null,
      testTime: null,
      reportType: null,
    },
    healthSummary: {
      faultedSystemCount: 1,
      okSystemCount: 0,
      totalDtcCount: 1,
      currentCount: 1,
      historyCount: 0,
      permanentCount: 0,
      intermittentCount: 0,
      networkCount: 0,
      batteryVoltageCount: 0,
      safetyCriticalCount: 0,
    },
    moduleHealthTable: [],
    patterns: [],
    extractionQuality: { truncated: false, confidence: "high", warnings: [] },
  };

  // @testing-library/user-event installs its own working Clipboard stub the
  // moment userEvent.setup() runs (see its Clipboard.js) — replacing
  // navigator.clipboard ourselves gets silently clobbered by that stub, so
  // these tests spy on the stub's own writeText instead of substituting a
  // fresh mock object.
  it("copies the formatted report and shows Copying then Copied", async () => {
    const user = userEvent.setup();
    render(withProviders(<CopyReportButton result={result} />));

    await user.click(screen.getByRole("button", { name: "Copy report" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument());
    const clipboardText = await navigator.clipboard.readText();
    expect(clipboardText).toContain("P0301");
  });

  it("shows Copy failed when the Clipboard API rejects", async () => {
    const user = userEvent.setup();
    render(withProviders(<CopyReportButton result={result} />));

    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(new Error("denied"));
    await user.click(screen.getByRole("button", { name: "Copy report" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Copy failed" })).toBeInTheDocument());
  });
});

describe("SaveStatusIndicator", () => {
  it("renders nothing when idle", () => {
    const { container } = render(withProviders(<SaveStatusIndicator />));
    expect(container).toBeEmptyDOMElement();
  });

  it("shows Save failed with the error message after a failed mutation", async () => {
    fetchMock.mockReturnValueOnce(jsonResponse({ error: "Sign in to update this finding." }, false, 401));

    const user = userEvent.setup();
    render(
      withProviders(
        <>
          <SaveStatusIndicator />
          <VerificationChecklistSection caseId="case-1" initialVerification={null} />
        </>,
      ),
    );

    await user.click(screen.getByLabelText("Customer's original concern resolved"));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Save failed"));
  });
});
