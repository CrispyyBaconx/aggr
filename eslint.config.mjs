import globals from "globals";
import prettier from "eslint-plugin-prettier";
import js from "@eslint/js";
import pluginVue from "eslint-plugin-vue";
import tseslint from "typescript-eslint";
import vueParser from "vue-eslint-parser";

export default [
    js.configs.recommended,
    ...pluginVue.configs['flat/essential'],
    ...tseslint.configs.recommended,
    {
        files: ["**/*.vue"],
        languageOptions: {
            parser: vueParser,
            parserOptions: {
                parser: tseslint.parser,
                sourceType: "module",
            },
        },
    },
    {
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
            },
            ecmaVersion: 2020,
        },

        plugins: {
            prettier,
        },

        rules: {
            "no-console": process.env.NODE_ENV === "production" ? "warn" : "off",
            "no-debugger": process.env.NODE_ENV === "production" ? "warn" : "off",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-unused-vars": "off",
            "no-irregular-whitespace": "off",
            "vue/no-reserved-component-names": "off",
            "vue/multi-word-component-names": "off",
            "@typescript-eslint/no-require-imports": "off",

            "prettier/prettier": ["warn", {
                semi: false,
                singleQuote: true,
                printWidth: 80,
                tabWidth: 2,
                useTabs: false,
                endOfLine: "auto",
                trailingComma: "none",
                arrowParens: "avoid",
            }],
        },
    }
];
