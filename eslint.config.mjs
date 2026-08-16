import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Underscore-prefixed params are intentionally unused (e.g. a
      // uniform entitlements API signature some checks don't need yet).
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // Playwright fixtures take a teardown callback conventionally named
    // `use` (test.extend({ x: async ({}, use) => { ... } })) — the
    // react-hooks lint rule misreads that as a React Hook call because
    // of the name. Not React code, so the rule doesn't apply here.
    files: ["tests/e2e/**/*.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Native Android project (Capacitor) — Gradle build output and
    // Capacitor's generated web-bridge JS, not this project's source.
    "android/**",
  ]),
]);

export default eslintConfig;
