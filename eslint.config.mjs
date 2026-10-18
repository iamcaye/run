import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const rawDbImport = {
  group: ["@/server/db/client", "**/server/db/client"],
  message: "Use forUser(userId) from @/server/dal. Only dal/, system/, services/ and scripts may use the raw db.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
    },
  },
  // Tenancy: the raw db handle is off-limits outside the data layer.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/server/dal/**",
      "src/server/system/**",
      "src/server/db/**",
      "src/server/auth/**",
      "src/services/**",
      "src/test/**",
    ],
    rules: { "no-restricted-imports": ["error", { patterns: [rawDbImport] }] },
  },
  // Domain logic stays pure: no db, framework or server imports.
  {
    files: ["src/lib/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/server/*", "@/services/*", "@/app/*"], message: "lib/ must stay pure." },
            { group: ["next", "next/*", "react", "drizzle-orm", "drizzle-orm/*", "postgres"], message: "lib/ must stay pure." },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "drizzle/**", "public/sw.js", "test-results/**", "playwright-report/**"]),
]);

export default eslintConfig;
