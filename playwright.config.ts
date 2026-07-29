// Playwright E2E config (docs/PLAYWRIGHT_IMPLEMENTATION.md). Three target
// modes, selected by PLAYWRIGHT_TARGET (default "local"):
//   local               — starts `next dev` via webServer, full browser matrix
//   production-smoke    — targets https://dtcdecoder.com, anonymous/public only
//   production-internal — targets https://dtcdecoder.com, requires
//                          RUN_PRODUCTION_INTERNAL_E2E=true + real owner auth
// Real-provider/internal tests self-gate inside the spec files (see
// tests/e2e/helpers/provider-gate.ts) — this config only decides base URL
// and whether a local dev server is started.
import { defineConfig, devices } from "@playwright/test";
import fs from "fs";
import path from "path";

// Playwright (unlike `next dev`) does not read .env.local automatically.
// Load it manually — no dotenv dependency needed, this repo's env files
// are always plain KEY=VALUE lines — so SUPABASE_SERVICE_ROLE_KEY etc.
// reach the synthetic-user fixtures. Never overwrites a value already set
// in the real environment (CI secrets take precedence).
function loadDotEnvLocal() {
  const envPath = path.join(__dirname, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }
}
loadDotEnvLocal();

const target = process.env.PLAYWRIGHT_TARGET ?? "local";
const isProduction = target === "production-smoke" || target === "production-internal";

const baseURL = process.env.E2E_BASE_URL ?? (isProduction ? "https://dtcdecoder.com" : "http://localhost:3000");

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results/artifacts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: !isProduction,
  forbidOnly: !!process.env.CI,
  // Local: no retries — a flaky deterministic test is a bug, not noise.
  // CI: a couple of retries absorb real network flakiness, never used as
  // proof a *deterministic* assertion passed (see PLAYWRIGHT_AUDIT.md).
  retries: process.env.CI ? 2 : 0,
  workers: isProduction ? 1 : process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }], ["json", { outputFile: "test-results/results.json" }]]
    : [["html", { open: "never", outputFolder: "playwright-report" }], ["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 14"] } },
    { name: "tablet", use: { ...devices["iPad (gen 7)"] } },
  ],
  // Only local runs manage their own server — production targets hit a
  // deployment that already exists.
  webServer: isProduction
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
