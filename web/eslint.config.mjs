import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Builds into another distDir (check.sh, and a build beside a running
    // `next dev`) and Playwright's output: generated, and tens of thousands
    // of findings that bury the real ones.
    ".next-build*/**",
    "playwright-report/**",
    "test-results/**",
  ]),
  {
    rules: {
      // A leading underscore marks a name kept on purpose: a parameter an API
      // shape requires, or a key destructured out to drop it from the rest.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
]);

export default eslintConfig;
