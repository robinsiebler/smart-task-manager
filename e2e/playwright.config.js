const path = require('path');
const { defineConfig, devices } = require('@playwright/test');
const config = require('../backend/src/config/env');

const BASE_URL = `http://localhost:${config.port}`;

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm start',
    cwd: path.resolve(__dirname, '../backend'),
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 30000,
  },
});
