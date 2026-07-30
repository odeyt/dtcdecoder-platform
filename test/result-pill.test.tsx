// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResultPill } from "@/components/ResultPill";

describe("ResultPill — severity mapping", () => {
  it.each([
    ["critical", "Critical"],
    ["high", "High"],
    ["medium", "Medium"],
    ["low", "Low"],
    ["informational", "Informational"],
  ] as const)("renders the correct label text for severity=%s", (value, expectedLabel) => {
    render(<ResultPill category="severity" value={value} />);
    expect(screen.getByText(expectedLabel)).toBeInTheDocument();
  });
});

describe("ResultPill — safety mapping", () => {
  it.each([
    ["do_not_drive", "Do not drive"],
    ["limited_operation", "Limited operation / caution"],
    ["service_soon", "Service soon"],
    ["monitor", "Monitor"],
    ["no_restriction", "No immediate restriction identified"],
  ] as const)("renders the correct label text for safety=%s", (value, expectedLabel) => {
    render(<ResultPill category="safety" value={value} />);
    expect(screen.getByText(expectedLabel)).toBeInTheDocument();
  });
});

describe("ResultPill — diagnostic status mapping", () => {
  it.each([
    ["confirmed", "Confirmed"],
    ["supported", "Supported"],
    ["suspected", "Suspected"],
    ["unverified", "Unverified"],
    ["ruled_out", "Ruled out"],
    ["failed_test", "Failed test"],
    ["passed_test", "Passed test"],
    ["not_tested", "Not tested"],
    ["in_progress", "In progress"],
    ["action_required", "Action required"],
  ] as const)("renders the correct label text for status=%s", (value, expectedLabel) => {
    render(<ResultPill category="status" value={value} />);
    expect(screen.getByText(expectedLabel)).toBeInTheDocument();
  });
});

describe("ResultPill — system category mapping", () => {
  it.each([
    ["powertrain", "Powertrain"],
    ["transmission", "Transmission"],
    ["electrical", "Electrical"],
    ["network_can", "Network / CAN"],
    ["abs_brakes", "ABS / Brakes"],
    ["steering", "Steering"],
    ["airbag_srs", "Airbag / SRS"],
    ["ev_hybrid", "EV / Hybrid"],
    ["hvac", "HVAC"],
    ["body", "Body"],
    ["informational", "Informational"],
  ] as const)("renders the correct label text for system=%s", (value, expectedLabel) => {
    render(<ResultPill category="system" value={value} />);
    expect(screen.getByText(expectedLabel)).toBeInTheDocument();
  });
});

describe("ResultPill — accessibility and overrides", () => {
  it("always renders visible label text, never color-only", () => {
    const { container } = render(<ResultPill category="severity" value="critical" />);
    expect(container.textContent?.trim().length).toBeGreaterThan(0);
  });

  it("accepts a label override for localized callers", () => {
    render(<ResultPill category="severity" value="critical" label="Crítico" />);
    expect(screen.getByText("Crítico")).toBeInTheDocument();
    expect(screen.queryByText("Critical")).not.toBeInTheDocument();
  });

  it("marks itself with data-result-pill for the print-override stylesheet rule", () => {
    const { container } = render(<ResultPill category="status" value="confirmed" />);
    expect(container.querySelector("[data-result-pill]")).not.toBeNull();
  });
});
