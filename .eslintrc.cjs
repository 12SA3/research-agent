module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: ["eslint:recommended", "plugin:react/recommended", "plugin:react-hooks/recommended"],
  parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
  plugins: ["react-refresh"],
  settings: { react: { version: "detect" } },
  ignorePatterns: [
    "dist", "node_modules", "data",
    "src/config/aiService.js", "src/config/gemini.js",
    "src/context/Context.jsx", "src/services/streamParser.js", "src/services/toolRegistry.js", "src/services/skills.js",
    "src/components/Main/**", "src/components/SideBar/**"
  ],
  overrides: [
    {
      files: ["*.ts", "*.tsx"],
      parser: "@typescript-eslint/parser",
      plugins: ["@typescript-eslint"],
      rules: { "no-undef": "off", "no-unused-vars": "off" }
    }
  ],
  rules: {
    "react/prop-types": "off",
    "react/react-in-jsx-scope": "off",
    "react-refresh/only-export-components": ["warn", { "allowConstantExport": true }]
  }
};
