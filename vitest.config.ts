import path from "node:path";
import { defineConfig } from "vitest/config";

const root = path.resolve(import.meta.dirname);

/**
 * Vitest setup for NEXORA AI.
 *
 * - `@/*` maps to `src/*` (same as tsconfig paths).
 * - "server-only" is aliased to an empty module: unit/integration tests run
 *   in plain Node, not inside Next's react-server runtime.
 * - next/headers, next/navigation and next/cache are stubbed with
 *   functional stand-ins so auth modules import cleanly.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.join(root, "src"),
      "server-only": path.join(root, "tests", "stubs", "server-only.ts"),
      "next/headers": path.join(root, "tests", "stubs", "next-headers.ts"),
      "next/navigation": path.join(root, "tests", "stubs", "next-navigation.ts"),
      "next/cache": path.join(root, "tests", "stubs", "next-cache.ts"),
    },
  },
  test: {
    environment: "node",
    globalSetup: path.join(root, "tests", "global-setup.ts"),
    setupFiles: path.join(root, "tests", "setup.ts"),
    testTimeout: 30_000,
    hookTimeout: 60_000,
    include: ["tests/**/*.test.ts"],
  },
});
