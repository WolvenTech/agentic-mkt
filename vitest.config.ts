import { defineConfig } from "vitest/config";

// Live-gated specs use the `*.live.test.ts` suffix so `unit` stays offline-safe
// and `live` opts in via `pnpm test:live` (which runs `vendor:gate` first).
export default defineConfig({
  test: {
    // No `live` specs exist until task 02, so empty runs must not fail.
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 80,
      },
    },
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/**/*.live.test.ts", "node_modules/**"],
        },
      },
      {
        test: {
          name: "live",
          include: ["tests/**/*.live.test.ts"],
          exclude: ["node_modules/**"],
        },
      },
    ],
  },
});
