import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@kikimimi/shared": new URL("../shared/src/index.ts", import.meta.url).pathname,
    },
  },
});
