// Password sign-in only — magic-link is not automatable in this environment
// (Outlook Safe Links consumes the one-time token before automation can use
// it; confirmed empirically, see docs/PLAYWRIGHT_AUTH_SETUP.md). Every E2E
// account must have a password already set.
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export async function signInWithPassword(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/account/login");
  const passwordToggle = page.getByRole("button", { name: "Sign in with a password instead" });
  if (await passwordToggle.isVisible().catch(() => false)) {
    await passwordToggle.click();
  }
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // Not "Sign Out" visibility (hidden on mobile behind SiteNav.tsx's
  // collapsed hamburger panel) and not the "My Account" heading text either
  // (an account whose saved interface_locale isn't English — e.g. a Region
  // Profile test that just switched it to Thai — renders that heading in
  // its own language, not literally "My Account"). The post-sign-in
  // redirect to /account is both viewport- and locale-independent.
  // A predicate on url.pathname, not a regex against the full URL string:
  // a regex here is easy to get subtly wrong in both directions — unanchored,
  // "/account/login" (where this flow starts) itself satisfies "contains
  // /account", so waitForURL resolves before sign-in even happens; anchored
  // with `^`, it stops matching the full "http://host/account" URL
  // entirely, since that doesn't start with "/". Comparing the parsed
  // pathname sidesteps both.
  await page.waitForURL((url) => url.pathname === "/account" || url.pathname === "/account/", {
    timeout: 15_000,
  });
  // The client-side redirect can land before the session cookie has fully
  // propagated to server-side reads — confirmed via a real repro where the
  // header already showed "Sign Out" and the signed-in email, but the
  // server-rendered page body still showed the sign-in form. One reload
  // gives the next request a cookie that's actually settled.
  if (await page.getByPlaceholder("you@example.com").isVisible().catch(() => false)) {
    await page.reload();
  }
  await expect(page.getByPlaceholder("you@example.com")).not.toBeVisible({ timeout: 15_000 });
}

export async function signOut(page: Page): Promise<void> {
  let signOutButton = page.getByRole("button", { name: "Sign Out" });
  if (!(await signOutButton.isVisible().catch(() => false))) {
    // Mobile viewport (below SiteNav.tsx's `lg` breakpoint) — Sign Out only
    // renders inside the collapsed hamburger panel, so open it first.
    const openMenu = page.getByRole("button", { name: "Open menu" });
    if (await openMenu.isVisible().catch(() => false)) {
      await openMenu.click();
      signOutButton = page.getByRole("button", { name: "Sign Out" });
    }
  }
  if (await signOutButton.isVisible().catch(() => false)) {
    await signOutButton.click();
  }
}
