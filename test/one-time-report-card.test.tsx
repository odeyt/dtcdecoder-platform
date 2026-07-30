// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import en from "../messages/en.json";
import { OneTimeReportCard } from "@/components/OneTimeReportCard";

let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

function withProviders(children: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC" now={new Date()} formats={{}}>
      {children}
    </NextIntlClientProvider>
  );
}

// Two independently-controllable mocks dispatched by URL — the card fires
// a fire-and-forget analytics beacon (POST /api/analytics/event) on mount,
// which would otherwise consume a mockReturnValueOnce/mockResolvedValueOnce
// meant for the checkout call that happens later (on click, or via the
// auto-resume effect).
let checkoutFetchMock: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => unknown>>;
let originalLocation: Location;

beforeEach(() => {
  mockSearchParams = new URLSearchParams();
  checkoutFetchMock = vi.fn();
  const fetchDispatcher = (url: string, init?: RequestInit) => {
    if (url === "/api/checkout/single-report") return checkoutFetchMock(url, init);
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  };
  vi.stubGlobal("fetch", fetchDispatcher);
  originalLocation = window.location;
  // @ts-expect-error -- narrowing window.location for the redirect assertion below
  delete window.location;
  // @ts-expect-error -- minimal stand-in, only `.href` is ever read/written by the component
  window.location = { href: "" };
});

afterEach(() => {
  vi.unstubAllGlobals();
  // @ts-expect-error -- restoring the real Location object narrowed away above
  window.location = originalLocation;
});

describe("OneTimeReportCard — signed out", () => {
  it("renders the required testids, price, features, and links to sign-in with the return intent preserved", () => {
    render(withProviders(<OneTimeReportCard signedIn={false} />));

    expect(screen.getByTestId("one-time-report-card")).toBeInTheDocument();
    expect(screen.getByTestId("one-time-report-reference-price")).toHaveTextContent("$9.99");
    expect(screen.getByTestId("one-time-report-price")).toHaveTextContent("$6.99");
    expect(screen.getByTestId("one-time-report-features").querySelectorAll("li")).toHaveLength(8);

    const cta = screen.getByTestId("one-time-report-cta");
    expect(cta.tagName).toBe("A");
    expect(cta).toHaveAttribute(
      "href",
      "/account/login?next=%2Fpricing%3Fstart_checkout%3Dprofessional_report_one_time",
    );
  });
});

describe("OneTimeReportCard — signed in", () => {
  it("starts checkout on click: shows loading, aria-busy, then redirects", async () => {
    let resolveFetch: (value: unknown) => void;
    checkoutFetchMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const user = userEvent.setup();
    render(withProviders(<OneTimeReportCard signedIn={true} />));

    const cta = screen.getByTestId("one-time-report-cta");
    await user.click(cta);

    expect(cta).toBeDisabled();
    expect(cta).toHaveAttribute("aria-busy", "true");
    expect(cta).toHaveTextContent("Preparing secure checkout…");

    resolveFetch!({ ok: true, json: () => Promise.resolve({ checkoutUrl: "https://checkout.example/abc" }) });

    await waitFor(() => expect(window.location.href).toBe("https://checkout.example/abc"));
  });

  it("shows a retryable, accessible error and re-enables the button on failure", async () => {
    checkoutFetchMock.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "One-time checkout is temporarily unavailable. Please try again shortly." }),
    });

    const user = userEvent.setup();
    render(withProviders(<OneTimeReportCard signedIn={true} />));

    await user.click(screen.getByTestId("one-time-report-cta"));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("temporarily unavailable"));
    const cta = screen.getByTestId("one-time-report-cta");
    expect(cta).not.toBeDisabled();
    expect(cta).toHaveAttribute("aria-busy", "false");
  });

  it("auto-resumes checkout when returning signed-in with the start_checkout intent", async () => {
    mockSearchParams = new URLSearchParams({ start_checkout: "professional_report_one_time" });
    checkoutFetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ checkoutUrl: "https://checkout.example/resumed" }),
    });

    render(withProviders(<OneTimeReportCard signedIn={true} />));

    await waitFor(() => expect(window.location.href).toBe("https://checkout.example/resumed"));
    expect(checkoutFetchMock).toHaveBeenCalledWith("/api/checkout/single-report", { method: "POST" });
  });

  it("does not auto-resume checkout without the start_checkout intent", async () => {
    render(withProviders(<OneTimeReportCard signedIn={true} />));
    await new Promise((r) => setTimeout(r, 10));
    expect(checkoutFetchMock).not.toHaveBeenCalled();
  });
});
