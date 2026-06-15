import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Node test harnesses, not shipped Next app/runtime code. The scripts/
    // suites already sit outside next-lint's default dirs (app/lib/components/
    // src), so the lib/ test files are excluded here to keep test code
    // consistently outside the app lint regardless of where it is colocated.
    ignores: [".next/**", "node_modules/**", "**/__tests__/**"],
  },
];

export default config;
