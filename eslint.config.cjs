const {
    defineConfig,
} = require("eslint/config");

const globals = require("globals");
const prettier = require("eslint-plugin-prettier");
const js = require("@eslint/js");

const {
    FlatCompat,
} = require("@eslint/eslintrc");

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

module.exports = defineConfig([{
    languageOptions: {
        globals: {
            ...globals.node,
        },

        ecmaVersion: 2020,
        parserOptions: {},
    },

    extends: compat.extends(
        "plugin:vue/essential",
        "eslint:recommended",
        "@vue/typescript/recommended",
    ),

    plugins: {
        prettier,
    },

    rules: {
        "no-console": process.env === "production" ? "warn" : "off",
        "no-debugger": process.env === "production" ? "warn" : "off",
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/camelcase": "off",
        "no-irregular-whitespace": "off",
        "vue/no-reserved-component-names": "off",
        "@typescript-eslint/no-var-requires": 0,
        camelcase: "off",

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
}]);
