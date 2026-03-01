import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@angband/core": path.resolve(__dirname, "packages/@angband/core/src"),
    },
  },
  test: {
    globals: true,
    include: ["packages/**/src/**/*.test.ts", "tools/**/src/**/*.test.ts"],
  },
});
