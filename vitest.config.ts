import { defineConfig } from "vitest/config";

// Run the tests in a zone far from Paris, so a test that relies on the machine's local zone
// fails on every machine, not only on the UTC CI runners.
process.env.TZ = "America/Los_Angeles";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/cli.ts", "src/main.ts"],
    },
  },
});
