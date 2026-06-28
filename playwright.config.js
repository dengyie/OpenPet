const { defineConfig, devices } = require('@playwright/test')

const controlCenterPort = Number(process.env.OPENPET_CONTROL_CENTER_PORT || 4173)
const controlCenterBaseURL = `http://127.0.0.1:${controlCenterPort}`
const reuseExistingControlCenterServer = process.env.OPENPET_CONTROL_CENTER_REUSE_SERVER === '1'

module.exports = defineConfig({
  testDir: './tests/control-center',
  testMatch: /.*\.spec\.[jt]s/,
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  use: {
    baseURL: controlCenterBaseURL,
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: `npm run dev:control-center -- --port ${controlCenterPort} --strictPort`,
    url: controlCenterBaseURL,
    reuseExistingServer: !process.env.CI && reuseExistingControlCenterServer,
    timeout: 30_000
  }
})
