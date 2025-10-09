import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: globals.worker,
    },
    rules: {
      "no-unused-vars": ["warn", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_"
      }],
      "no-undef": "error",
      "prefer-const": "error",
      "semi": "off",
    }
  },
  {
    files: ["test/**/*.mjs"],
    languageOptions: {
      globals: globals.mocha,
    }
  }
];
