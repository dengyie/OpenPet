const test = require('node:test')
const assert = require('node:assert/strict')
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')

let chromium = null
try {
  ({ chromium } = require('@playwright/test'))
} catch (_) {}

const { createAgentAwarenessServer } = require('../../examples/plugins/agent-awareness/service/agent-awareness-service')
const { writeCodexHookPlan } = require('../../examples/plugins/agent-awareness/commands/codex-hook-plan')

const openDashboardPage = async (port) => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const consoleMessages = []
  page.on('console', (message) => {
    consoleMessages.push({ type: message.type(), text: message.text() })
  })
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' })
  return { browser, consoleMessages, page }
}

test('agent awareness dashboard browser view renders sanitized diagnostics and sessions', async (t) => {
  if (!chromium) {
    t.skip('Playwright runtime is not installed in this environment')
    return
  }
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-browser-'))
  writeCodexHookPlan({ dataDir, port: 0 })
  const service = createAgentAwarenessServer({
    dataDir,
    bridgeClient: {
      event: async () => {},
      say: async () => {}
    },
    createRolloutPoller: () => ({
      getStatus: () => ({
        enabled: true,
        seenCount: 9,
        ignoredContentRecordCount: 5,
        ignoredMetadataRecordCount: 3,
        unknownRecordCount: 2,
        malformedRecordCount: 1,
        unsupportedLifecycleRecordCount: 2,
        lastScanAt: '2026-07-03T12:10:00.000Z',
        lastError: ''
      }),
      start: () => {},
      stop: () => {}
    })
  })

  await service.start(0)
  await service.handleEvent({
    sessionId: 'raw-session-1',
    type: 'approval.requested',
    status: 'waiting',
    message: 'Need approval Bearer secret-token sk-test123 /Users/mango/private/OpenPet via http://127.0.0.1:8795/health',
    cwd: '/Users/mango/private/project/OpenPet',
    timestamp: '2026-07-03T12:00:00.000Z'
  }, { initial: false })
  await service.handleEvent({
    sessionId: 'raw-session-2',
    type: 'turn.completed',
    status: 'completed',
    message: 'Finished /Users/mango/private/Secrets',
    cwd: '/Users/mango/private/project/ClaudePetClone',
    timestamp: '2026-07-03T12:05:00.000Z'
  }, { initial: false })

  const port = service.server.address().port
  const { browser, page, consoleMessages } = await openDashboardPage(port)

  try {
    await page.waitForSelector('[data-testid="agent-summary"] .metric')
    await page.waitForSelector('[data-testid="agent-sessions"] [data-testid="agent-session"]')

    const statusLine = await page.textContent('#status-line')
    const summaryText = await page.textContent('[data-testid="agent-summary"]')
    const diagnosticsText = await page.textContent('[data-testid="agent-health"]')
    const sessionsText = await page.textContent('[data-testid="agent-sessions"]')
    const sessionCount = await page.locator('[data-testid="agent-session"]').count()
    const pageText = await page.textContent('body')

    assert.match(statusLine || '', /Service healthy/)
    assert.match(summaryText || '', /Tracked Sessions/)
    assert.match(summaryText || '', /Plan ready/)
    assert.match(diagnosticsText || '', /Unknown Records/)
    assert.match(diagnosticsText || '', /5 content · 3 metadata · 2 unsupported/)
    assert.match(diagnosticsText || '', /Malformed Records/)
    assert.match(diagnosticsText || '', /Local plan file exists/)
    assert.match(sessionsText || '', /OpenPet #[a-f0-9]{6}/)
    assert.match(sessionsText || '', /ClaudePetClone #[a-f0-9]{6}/)
    assert.match(sessionsText || '', /Need approval/)
    assert.match(sessionsText || '', /\[local-url\]/)
    assert.match(sessionsText || '', /Finished \[path\]/)
    assert.equal(sessionCount, 2)
    assert.equal(pageText.includes('/Users/mango/private'), false)
    assert.equal(pageText.includes('127.0.0.1:8795'), false)
    assert.equal(pageText.includes('sk-test123'), false)
    assert.equal(pageText.includes('secret-token'), false)
    assert.deepEqual(consoleMessages, [])
  } finally {
    await browser.close()
    await service.close()
  }
})
