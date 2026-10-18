import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // `server-only` throws outside React Server Components; tests run server code directly.
      "server-only": path.resolve(import.meta.dirname, "src/test/empty-module.ts"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/lib/**/*.test.ts", "src/config/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          include: ["src/server/**/*.test.ts", "src/services/**/*.test.ts", "src/test/**/*.test.ts"],
          environment: "node",
          globalSetup: ["src/test/global-setup.ts"],
          setupFiles: ["src/test/setup-env.ts"],
          // One shared test database; each test creates its own users. Serial keeps connections low.
          fileParallelism: false,
        },
      },
    ],
  },
});
