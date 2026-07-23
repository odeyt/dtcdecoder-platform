import { defineConfig } from "vitest/config";
import path from "node:path";

// "server-only" throws when imported outside a Next.js server-component
// bundling context (see node_modules/server-only/package.json — it only
// no-ops under the "react-server" export condition). Vitest runs in plain
// Node, so it's aliased to a no-op here purely for the test environment;
// this changes nothing about how the real app resolves it.
export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "test/mocks/server-only.ts"),
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
