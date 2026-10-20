import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
    server: {
      // `convex-test` uses `import.meta.glob`, which only works when the
      // package is processed by Vite instead of being loaded as plain CJS.
      deps: {
        inline: ["convex-test"],
      },
    },
  },
});
