// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
    // This app deliberately synchronizes screens with socket/lifecycle events
    // in effects. Keep the hook ordering and dependency checks enabled.
    rules: { "react-hooks/set-state-in-effect": "off" },
  }
]);
