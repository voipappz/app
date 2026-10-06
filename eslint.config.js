import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

// MUI v7 Grid sizes with `size`; `item`/`xs`/`md` are silently ignored.
const GRID_SIZE_PROPS = {
  selector: "JSXOpeningElement[name.name='Grid'] > JSXAttribute[name.name=/^(item|xs|sm|md|lg|xl)$/]",
  message: 'MUI v7 Grid ignores item/xs/sm/md/lg/xl — use size={{ xs, md }}.',
}

// Dates and numbers follow the active language only through the helpers.
const HAND_FORMATTED_DATES_AND_NUMBERS = [
  ...['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'].map((property) => ({
    property, message: 'Use formatDate/formatOnlyDate (utils/dateUtils) or formatNumber (utils/numberUtils).',
  })),
  ...['NumberFormat', 'DateTimeFormat'].map((property) => ({
    object: 'Intl', property, message: 'Use formatNumber (utils/numberUtils) or the date helpers (utils/dateUtils).',
  })),
]

// Physical sides in `sx` do not mirror in Hebrew: use ms/me/ps/pe,
// marginInlineStart, insetInlineEnd, textAlign: 'start'...
const PHYSICAL_SIDES_IN_SX = [
  {
    selector: "JSXAttribute[name.name='sx'] Property[key.name=/^(ml|mr|pl|pr|marginLeft|marginRight|paddingLeft|paddingRight|left|right|borderLeft|borderRight)$/]",
    message: 'Use a logical side (ms/me/ps/pe, marginInlineStart, insetInlineEnd...) so it mirrors in Hebrew.',
  },
  {
    selector: "JSXAttribute[name.name='sx'] Property[key.name='textAlign'][value.value=/^(left|right)$/]",
    message: "Use textAlign: 'start' or 'end' so it mirrors in Hebrew.",
  },
]

// Screens already converted to translations and logical sides: here the
// rules are errors, so they stay converted. Add a folder when you convert it
// (docs/i18n-guide.md).
const CONVERTED = [
  'src/i18n/**',
  'src/components/Extensions/**',
  'src/components/Login/**',
  'src/components/shared/ResponsiveTable/**',
  'src/components/ui/**',
]

export default [
  { ignores: ['dist', 'test-results/**', 'playwright-report/**', '.playwright/**', 'src/context/AuthContext.jsx', 'va-voipbox-admin/**', 'old-ionic-portal/**', 'test-api.cjs', 'docs/**'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        process: 'readonly',
        __APP_VERSION__: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      'react-refresh/only-export-components': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'no-restricted-syntax': ['error', GRID_SIZE_PROPS],
      // A warning elsewhere: existing code is converted screen by screen.
      'no-restricted-properties': ['warn', ...HAND_FORMATTED_DATES_AND_NUMBERS],
    },
  },
  {
    files: CONVERTED,
    rules: {
      'no-restricted-properties': ['error', ...HAND_FORMATTED_DATES_AND_NUMBERS],
      'no-restricted-syntax': ['error', GRID_SIZE_PROPS, ...PHYSICAL_SIDES_IN_SX],
    },
  },
  // The helpers themselves, and tests, may call Intl directly.
  {
    files: ['src/utils/dateUtils.js', 'src/utils/numberUtils.js', '**/*.test.{js,jsx}'],
    rules: { 'no-restricted-properties': 'off' },
  },
  // Tests may use a physical side on purpose, e.g. to check that Hebrew mirrors it.
  {
    files: ['**/*.test.{js,jsx}'],
    rules: { 'no-restricted-syntax': ['error', GRID_SIZE_PROPS] },
  },
  // TypeScript files configuration
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]|^_', argsIgnorePattern: '^_' }],
    },
  },
  // Playwright test files (JavaScript and TypeScript)
  {
    files: ['tests/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        describe: 'readonly',
        test: 'readonly',
        it: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        expect: 'readonly',
        context: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]|^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-unused-vars': 'off', // Turn off base rule for test files
    },
  },
  // Node.js files configuration
  {
    files: ['server.js', 'vite.config.js', 'test-websocket.js', 'analyze-reports.js', 'playwright.config.ts'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.node,
        __dirname: 'readonly',
        process: 'readonly',
      },
      sourceType: 'module',
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
    },
  },
]
