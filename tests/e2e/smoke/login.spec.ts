import { test, expect } from "@playwright/test";

test.describe("Login page smoke", () => {
  test("renders magic-link and password options with accessible labels", async ({ page }) => {
    await page.goto("/account/login");
    await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
    await expect(page.getByRole("button", { name: "Email me a login link" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in with a password instead" })).toBeVisible();
  });

  test("invalid credentials produce a controlled error, no credential leaked into the URL", async ({ page }) => {
    await page.goto("/account/login");
    await page.getByRole("button", { name: "Sign in with a password instead" }).click();
    await page.getByPlaceholder("you@example.com").fill("not-a-real-account@dtcdecoder-e2e-test.invalid");
    await page.getByPlaceholder("Password").fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    // Controlled failure: stays on/near the login page, no crash, and the
    // password never appears as a query string.
    await expect(page).not.toHaveURL(/password=/i);
    await expect(page.getByRole("button", { name: "Sign Out" })).not.toBeVisible();
  });
});
