const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: [
      '**/node_modules/**',
      'e2e/test-results/**',
      'e2e/playwright-report/**',
      'e2e/blob-report/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['*.js', 'backend/**/*.js', 'e2e/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // Express requires error-handling middleware to declare all 4 params
    // (err, req, res, next) even when a given handler never calls next().
    files: ['backend/**/*.js', 'e2e/**/*.js'],
    rules: {
      'no-unused-vars': ['error', { args: 'none' }],
    },
  },
  {
    // Playwright specs run in Node but embed page.evaluate() callbacks that
    // execute in the browser, so both global sets are legitimately in play.
    files: ['e2e/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    files: ['frontend/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    // api.js/utils.js exist purely to define globals other page scripts
    // consume -- "unused" here just means "used elsewhere via global scope".
    files: ['frontend/js/api.js', 'frontend/js/utils.js'],
    rules: {
      'no-unused-vars': 'off',
    },
  },
  {
    // Plain <script>-tag files sharing one global scope (no bundler/modules).
    // These four files consume globals defined in api.js/utils.js -- declared
    // here (not on api.js/utils.js themselves) so no-redeclare doesn't flag
    // the files that actually define them.
    files: ['frontend/js/tasks.js', 'frontend/js/dashboard.js', 'frontend/js/profile.js', 'frontend/js/auth.js'],
    languageOptions: {
      globals: {
        api: 'readonly',
        formatDate: 'readonly',
        toDateInputValue: 'readonly',
        redirectToLogin: 'readonly',
        getSafeRedirectTarget: 'readonly',
      },
    },
  },
];
