import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Ensure the DOM is reset between tests to avoid cross-test leakage.
afterEach(() => {
  cleanup();
});
