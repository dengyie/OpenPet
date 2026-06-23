const { defineConfig, devices } = require('@playwright/test')

const controlCenterPort = Number(process.env.OPENPET_CONTROL_CENTER_PORT || 5173)
const controlCenterBaseURL = `http://127.0.0.1:${controlCenterPort}`

module.exports = defineConfig({
  testDir: './tests/control-center',
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
    reuseExistingServer: !process.env.CI && !process.env.OPENPET_CONTROL_CENTER_PORT,
    timeout: 30_000
  }
})
