import js from "@eslint/js";
import globals from "globals";
import jsdoc from "eslint-plugin-jsdoc";

export default [
  {
    ignores: [
      "node_modules/**",
      ".claude/**",
      "docs/**",
      "lab/**",
      "public/vendor/**",
      "public/lab/**",
      "dist/**",
      "build/**",
    ]
  },
  js.configs.recommended,
  jsdoc.configs['flat/recommended'],
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
      "jsdoc/check-alignment": "warn",
      "jsdoc/check-param-names": "error",
      "jsdoc/check-tag-names": "error",
      "jsdoc/check-types": "warn",
      "jsdoc/require-param": "warn",
      "jsdoc/require-param-description": "warn",
      "jsdoc/require-returns": "warn",
      "jsdoc/require-returns-description": "warn",
      "jsdoc/require-jsdoc": "off",
    }
  },
  {
    files: ["test/**/*.mjs"],
    languageOptions: {
      globals: globals.mocha,
    }
  }
];
