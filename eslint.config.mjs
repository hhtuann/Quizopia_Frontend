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
    // Local GitNexus CLI tooling (git-ignored; never present in CI).
    ".gitnexus/**",
    // P4-C: vendored ONNX Runtime wasm loader (copied artifact, not source).
    "public/ort/**",
    // P4-C: AI model artifacts (binary + card; never linted).
    "public/models/**",
  ]),
]);

export default eslintConfig;
