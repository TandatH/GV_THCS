import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".next/**",
      "coverage/**",
      "functions/lib/**",
      "packages/shared/dist/**",
      ".firebase-data/**",
      "next-env.d.ts",
      "tmp-quote.ts",
    ],
  },
];

export default eslintConfig;
