import { describe, expect, it, vi, beforeEach } from "vitest";

// resolveAppShellLocale() is what src/proxy.ts's PASSTHROUGH_TOP_LEVEL_SEGMENTS
// and every (app)-shell page depend on to pick a locale without a URL
// prefix — a regression here silently mis-localizes the whole (app) tree.
// Priority order under test: signed-in saved preference > anonymous cookie
// > DEFAULT_LOCALE, with isEnabledLocale() gating each candidate so a
// disabled/unrecognized locale never gets served.
let mockUser: { id: string } | null = null;
let mockCookieValue: string | undefined;
const getUserPreferencesMock = vi.fn();
const isEnabledLocaleMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
  }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "dtc_interface_locale" && mockCookieValue !== undefined
        ? { value: mockCookieValue }
        : undefined,
  }),
}));
vi.mock("@/lib/preferences", () => ({
  getUserPreferences: (...args: unknown[]) => getUserPreferencesMock(...args),
}));
vi.mock("@/lib/i18n/languages", () => ({
  isEnabledLocale: (...args: unknown[]) => isEnabledLocaleMock(...args),
}));

const { resolveAppShellLocale, getAppShellMessages } = await import(
  "@/lib/i18n/app-shell-locale"
);

beforeEach(() => {
  mockUser = null;
  mockCookieValue = undefined;
  getUserPreferencesMock.mockReset();
  isEnabledLocaleMock.mockReset();
});

describe("resolveAppShellLocale", () => {
  it("falls back to DEFAULT_LOCALE when signed out with no cookie", async () => {
    const locale = await resolveAppShellLocale();
    expect(locale).toBe("en");
    expect(getUserPreferencesMock).not.toHaveBeenCalled();
  });

  it("uses the anonymous cookie when it names an enabled locale", async () => {
    mockCookieValue = "th";
    isEnabledLocaleMock.mockResolvedValue(true);
    const locale = await resolveAppShellLocale();
    expect(locale).toBe("th");
    expect(isEnabledLocaleMock).toHaveBeenCalledWith("th");
  });

  it("ignores the cookie when its locale is not enabled, falling back to DEFAULT_LOCALE", async () => {
    mockCookieValue = "xx";
    isEnabledLocaleMock.mockResolvedValue(false);
    const locale = await resolveAppShellLocale();
    expect(locale).toBe("en");
  });

  it("prefers the signed-in user's saved preference over the cookie", async () => {
    mockUser = { id: "user-1" };
    mockCookieValue = "es";
    getUserPreferencesMock.mockResolvedValue({ interface_locale: "th" });
    isEnabledLocaleMock.mockResolvedValue(true);
    const locale = await resolveAppShellLocale();
    expect(locale).toBe("th");
    expect(isEnabledLocaleMock).toHaveBeenCalledWith("th");
  });

  it("falls through to the cookie when the saved preference's locale is disabled", async () => {
    mockUser = { id: "user-1" };
    mockCookieValue = "es";
    getUserPreferencesMock.mockResolvedValue({ interface_locale: "xx" });
    isEnabledLocaleMock.mockImplementation(async (code: string) => code === "es");
    const locale = await resolveAppShellLocale();
    expect(locale).toBe("es");
  });

  it("falls through to the cookie when the user has no saved preferences row", async () => {
    mockUser = { id: "user-1" };
    mockCookieValue = "es";
    getUserPreferencesMock.mockResolvedValue(null);
    isEnabledLocaleMock.mockResolvedValue(true);
    const locale = await resolveAppShellLocale();
    expect(locale).toBe("es");
  });

  it("falls through to DEFAULT_LOCALE for a signed-in user with no preference and no cookie", async () => {
    mockUser = { id: "user-1" };
    getUserPreferencesMock.mockResolvedValue({ interface_locale: null });
    const locale = await resolveAppShellLocale();
    expect(locale).toBe("en");
  });
});

describe("getAppShellMessages", () => {
  it("loads the real catalog for a live locale", async () => {
    const messages = await getAppShellMessages("th");
    expect(messages.nav).toBeDefined();
    expect(messages.installPage).toBeDefined();
  });

  it("falls back to the DEFAULT_LOCALE catalog for an unrecognized locale", async () => {
    const fallback = await getAppShellMessages("en");
    const messages = await getAppShellMessages("not-a-real-locale");
    expect(messages).toEqual(fallback);
  });
});
