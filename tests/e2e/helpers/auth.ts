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
  await expect(page.getByRole("button", { name: "Sign Out" })).toBeVisible({ timeout: 15_000 });
}

export async function signOut(page: Page): Promise<void> {
  const signOutButton = page.getByRole("button", { name: "Sign Out" });
  if (await signOutButton.isVisible().catch(() => false)) {
    await signOutButton.click();
  }
}
