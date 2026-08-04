// Region Profile System — Playwright coverage (docs/REGION_PROFILE_ARCHITECTURE.md).
// Uses a throwaway synthetic account per run, same pattern as
// tests/e2e/auth/ordinary-user.spec.ts, granted a comped Pro plan (the
// preferences page is Pro/Workshop-gated) so the save flow can actually be
// exercised — the comp is deleted in afterAll alongside the account.
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { signInWithPassword } from "../helpers/auth";
import { syntheticEmail } from "../helpers/synthetic-data";
import { createSyntheticUser, cleanupSyntheticUsers } from "../helpers/database-cleanup";

const hasSupabaseAdmin = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function grantComponentedProPlan(userId: string, email: string) {
  const { error } = await adminClient().from("subscriptions").insert({
    user_id: userId,
    email,
    plan: "pro",
    billing_interval: "monthly",
    status: "active",
    creem_subscription_id: null,
    creem_customer_id: null,
    current_period_end: null,
    is_comp: true,
    comp_reason: "e2e-region-profile-test",
  });
  if (error) throw error;
}

test.describe("Region Profile System — settings selector", () => {
  test.skip(!hasSupabaseAdmin, "Supabase admin credentials not configured.");
  // These three tests share one synthetic account's user_preferences row
  // (one beforeAll, not one per test) and each genuinely saves to it —
  // running them in parallel races on that shared row (e.g. one test's
  // save landing mid-read of another). Serial execution matches what's
  // actually being shared.
  test.describe.configure({ mode: "serial" });

  let userId: string | null = null;
  const email = syntheticEmail("region-settings");
  const password = `E2eRegion!${Math.random().toString(36).slice(2)}9`;

  test.beforeAll(async () => {
    userId = await createSyntheticUser(email, password);
    if (userId) await grantComponentedProPlan(userId, email);
  });

  test.afterAll(async () => {
    if (userId) {
      await adminClient().from("subscriptions").delete().eq("user_id", userId);
      await cleanupSyntheticUsers([userId]);
    }
  });

  test("selecting Thailand pre-fills language/timezone/date format, leaves an unavailable currency default untouched, and saving persists it", async ({ page }) => {
    await signInWithPassword(page, email, password);
    await page.goto("/account/preferences");

    const regionSelect = page.locator("#regionCode");
    const interfaceLocaleSelect = page.locator("#interfaceLocale");
    const timezoneInput = page.locator("#timezone");
    const dateFormatSelect = page.locator("#dateFormat");
    const currencySelect = page.locator("#preferredCurrency");

    const currencyBefore = await currencySelect.inputValue();

    await regionSelect.selectOption("TH");

    await expect(interfaceLocaleSelect).toHaveValue("th");
    await expect(timezoneInput).toHaveValue("Asia/Bangkok");
    await expect(dateFormatSelect).toHaveValue("dd-mm-yyyy");
    // THB is not yet an enabled currency in this environment's registry —
    // the honest-fallback behavior leaves the currency field exactly as it
    // was rather than silently saving a value the server would reject.
    await expect(currencySelect).toHaveValue(currencyBefore);

    await page.getByRole("button", { name: /save preferences/i }).click();
    // Not English text: selecting Thailand sets interfaceLocale to "th" and
    // saving it immediately switches the WHOLE (app) shell to Thai on the
    // next render (resolveAppShellLocale reads the just-saved preference) —
    // this is the intended, correct behavior, not a bug. The saved-state
    // paragraph's class (see AccountPreferencesForm.tsx) is locale-agnostic.
    await expect(page.locator("p.text-emerald-400")).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(page.locator("#regionCode")).toHaveValue("TH");
    await expect(page.locator("#interfaceLocale")).toHaveValue("th");
    await expect(page.locator("#timezone")).toHaveValue("Asia/Bangkok");
    await expect(page.locator("#dateFormat")).toHaveValue("dd-mm-yyyy");
  });

  test("selecting Laos applies its own distinct defaults", async ({ page }) => {
    await signInWithPassword(page, email, password);
    await page.goto("/account/preferences");

    await page.locator("#regionCode").selectOption("LA");

    await expect(page.locator("#interfaceLocale")).toHaveValue("lo");
    await expect(page.locator("#timezone")).toHaveValue("Asia/Vientiane");
    await expect(page.locator("#dateFormat")).toHaveValue("dd-mm-yyyy");
  });

  test("selecting Global resets to English/UTC/ISO date defaults", async ({ page }) => {
    await signInWithPassword(page, email, password);
    await page.goto("/account/preferences");

    await page.locator("#regionCode").selectOption("GLOBAL");

    await expect(page.locator("#interfaceLocale")).toHaveValue("en");
    await expect(page.locator("#timezone")).toHaveValue("UTC");
    await expect(page.locator("#dateFormat")).toHaveValue("yyyy-mm-dd");
  });
});

test.describe("Region Profile System — geo-detection banner", () => {
  test.skip(!hasSupabaseAdmin, "Supabase admin credentials not configured.");
  test.use({ locale: "th-TH" });
  // Same reason as the settings-selector describe above: both tests here
  // sign in with one shared beforeAll-created account, and concurrent
  // sign-in attempts against the same credentials raced.
  test.describe.configure({ mode: "serial" });

  let userId: string | null = null;
  const email = syntheticEmail("region-geo");
  const password = `E2eGeo!${Math.random().toString(36).slice(2)}9`;

  test.beforeAll(async () => {
    userId = await createSyntheticUser(email, password);
  });
  test.afterAll(async () => {
    if (userId) await cleanupSyntheticUsers([userId]);
  });

  test("suggests Thailand on first visit for a th-TH browser locale, and switching sets the preference cookie", async ({ page }) => {
    await signInWithPassword(page, email, password);
    await page.goto("/account");

    const banner = page.getByTestId("region-geo-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Thailand");

    await banner.getByRole("button", { name: /switch to thailand/i }).click();
    await expect(banner).not.toBeVisible();

    const cookies = await page.context().cookies();
    const regionCookie = cookies.find((c) => c.name === "dtc_region_preference");
    expect(regionCookie?.value).toBe("TH");
  });

  test("never shows again after a choice, even after reload", async ({ page }) => {
    await signInWithPassword(page, email, password);
    await page.goto("/account");
    await expect(page.getByTestId("region-geo-banner")).toBeVisible();
    await page.getByTestId("region-geo-banner").getByRole("button", { name: /no thanks/i }).click();
    await expect(page.getByTestId("region-geo-banner")).not.toBeVisible();

    await page.reload();
    await expect(page.getByTestId("region-geo-banner")).not.toBeVisible();
  });
});
