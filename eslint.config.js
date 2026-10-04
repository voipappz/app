import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

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
      // Formatting a date or number locale-blind is how the same timestamp
      // came to render three different ways depending on the screen: ~50 call
      // sites, variously pinned to 'en-GB', to 'en-US', or to nothing at all.
      // src/utils/{dateUtils,numberUtils}.js are the only places that may
      // reach for Intl directly; everything else goes through them, so the
      // active language reaches every screen.
      //
      // `warn`, not `error`, for now: the existing violations are real and
      // numerous, and converting them belongs in batches by directory rather
      // than in whatever change happens to trip over them first. Promote to
      // error once the count is zero.
      'no-restricted-syntax': ['warn',
        {
          selector: "CallExpression[callee.property.name=/^toLocale(String|DateString|TimeString)$/]",
          message: 'Locale-blind. Use formatDate/formatOnlyDate from src/utils/dateUtils.js or formatNumber from src/utils/numberUtils.js.',
        },
        {
          selector: "NewExpression[callee.object.name='Intl']",
          message: 'Use src/utils/dateUtils.js or src/utils/numberUtils.js, which follow the active language.',
        },
      ],
    },
  },
  {
    // The modules allowed to call Intl directly: the two choke points, and the
    // test that proves English still formats as en-GB — which can only do that
    // by building a raw en-GB reference to compare against.
    files: ['src/utils/dateUtils.js', 'src/utils/numberUtils.js', 'src/utils/dateUtils.test.js'],
    rules: { 'no-restricted-syntax': 'off' },
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
