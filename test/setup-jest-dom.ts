import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Without this, each render() in a component test leaves its DOM attached
// for the next test in the same file, causing "multiple elements found"
// errors on any query that should only match once.
afterEach(() => {
  cleanup();
});
