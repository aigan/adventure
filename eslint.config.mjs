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
      "jsdoc/check-types": "off",
      "jsdoc/no-undefined-types": "off",
      "jsdoc/reject-any-type": "off",
      "jsdoc/require-param": "warn",
      "jsdoc/require-param-description": "off",
      "jsdoc/require-returns": "off",
      "jsdoc/require-returns-description": "off",
      "jsdoc/require-yields": "off",
      "jsdoc/require-jsdoc": "off",
    }
  },
  {
    files: ["public/worker/**/*.mjs"],
    languageOptions: {
      globals: globals.worker,
    }
  },
  {
    files: ["test/**/*.mjs"],
    languageOptions: {
      globals: globals.mocha,
    }
  }
];
