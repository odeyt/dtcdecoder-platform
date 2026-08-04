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
  // Not "Sign Out" visibility — SiteNav.tsx only renders that button inside
  // the collapsed mobile nav panel below the `lg` breakpoint, so it's never
  // visible on a mobile viewport without first opening the hamburger menu.
  // The post-sign-in redirect to /account is viewport-independent.
  await expect(page.getByRole("heading", { name: "My Account" })).toBeVisible({ timeout: 15_000 });
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
