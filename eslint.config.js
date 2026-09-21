import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.data/**', '**/coverage/**', '.tools/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } }, globals: { ...globals.browser, ...globals.node } },
    // JSX component references are validated by the build. Avoid treating them
    // as unused JavaScript bindings without a separate React parser plugin.
    rules: { 'no-unused-vars': 'off', 'no-empty': ['error', { allowEmptyCatch: true }] },
  },
];
