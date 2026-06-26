const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { chromium } = require('@playwright/test')
const sharp = require('sharp')

const { createCreatorStudioServer } = require('../../examples/plugins/creator-studio/service/studio-service')

const openDashboardServer = async (dataDir) => {
  const dashboardPath = path.join(__dirname, '../../examples/plugins/creator-studio/web/dashboard/index.html')
  const server = createCreatorStudioServer({ dataDir, dashboardPath })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return server
}

const openDashboardPage = async (server) => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  return { browser, page }
}

test('creator studio dashboard drives a single-action fixture run to the host import handoff', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-dashboard-browser-'))
  const dashboardPath = path.join(__dirname, '../../examples/plugins/creator-studio/web/dashboard/index.html')
  const server = createCreatorStudioServer({ dataDir, dashboardPath })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto(`http://127.0.0.1:${port}`)
    await page.locator('#prompt-input').fill('新增一个自定义动作：原地打滚，动作要循环。')
    await page.locator('#draft-button').click()

    await page.waitForSelector('[data-answer=\"manual\"]')
    assert.match(await page.locator('#next-step-panel').textContent(), /Answer follow-up/i)

    await page.locator('[data-answer=\"manual\"]').click()
    await page.waitForFunction(() => !document.querySelector('#confirm-button').disabled)
    assert.match(await page.locator('#task-preview').textContent(), /原地打滚/i)

    await page.locator('#confirm-button').click()
    await page.waitForFunction(() => !document.querySelector('#generate-button').disabled)
    assert.match(await page.locator('#status-line').textContent(), /Task confirmed/i)

    await page.locator('#generate-button').click()
    await page.waitForFunction(() => !document.querySelector('#approve-button').disabled)
    assert.match(await page.locator('#action-review-panel').textContent(), /Review status/i)
    assert.match(await page.locator('#import-handoff-panel').textContent(), /Review the generated frames, repair any bad frame, then approve the action/i)

    await page.locator('#approve-button').click()
    await page.waitForFunction(() => /Run approved/.test(document.querySelector('#status-line').textContent))

    const handoffText = await page.locator('#import-handoff-panel').textContent()
    assert.match(await page.locator('#status-line').textContent(), /import-approved-action/i)
    assert.match(handoffText, /Import Approved Action/i)
    assert.match(handoffText, /Control Center -> Plugins/i)
    assert.match(handoffText, /Command ID: import-approved-action/i)
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio dashboard drives a full-pet fixture run to the host import handoff', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-dashboard-browser-full-pet-'))
  const server = await openDashboardServer(dataDir)
  const port = server.address().port
  const { browser, page } = await openDashboardPage(server)

  try {
    await page.goto(`http://127.0.0.1:${port}`)
    await page.locator('#prompt-input').fill('生成一只完整的新桌宠，要软乎乎的橘猫风格，包含 idle 动作。')
    await page.locator('#draft-button').click()

    await page.waitForFunction(() => !document.querySelector('#confirm-button').disabled)
    assert.match(await page.locator('#task-preview').textContent(), /Character brief/i)
    assert.match(await page.locator('#trigger-panel').textContent(), /Trigger plan/i)

    await page.locator('#confirm-button').click()
    await page.waitForFunction(() => !document.querySelector('#generate-button').disabled)
    assert.match(await page.locator('#status-line').textContent(), /Task confirmed/i)

    await page.locator('#generate-button').click()
    await page.waitForFunction(() => !document.querySelector('#approve-button').disabled)
    assert.match(await page.locator('#status-line').textContent(), /Generated pet-pack output/i)
    assert.match(await page.locator('#full-pet-review-panel').textContent(), /Atlas QA/i)
    assert.match(await page.locator('#import-handoff-panel').textContent(), /Review the generated pet-pack output and approve the run before host-owned pet import/i)

    await page.locator('#approve-button').click()
    await page.waitForFunction(() => /Run approved/.test(document.querySelector('#status-line').textContent))

    const handoffText = await page.locator('#import-handoff-panel').textContent()
    assert.match(await page.locator('#status-line').textContent(), /import-approved-pet/i)
    assert.match(handoffText, /Import Approved Pet/i)
    assert.match(handoffText, /Control Center -> Plugins/i)
    assert.match(handoffText, /Command ID: import-approved-pet/i)
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio dashboard lets users edit a drafted action task before confirmation', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-dashboard-browser-task-edit-'))
  const server = await openDashboardServer(dataDir)
  const { browser, page } = await openDashboardPage(server)

  try {
    await page.locator('#prompt-input').fill('新增一个自定义动作：原地打滚，动作要循环。')
    await page.locator('#draft-button').click()

    await page.waitForSelector('[data-answer="manual"]')
    await page.locator('[data-answer="manual"]').click()
    await page.waitForFunction(() => !document.querySelector('#confirm-button').disabled)

    await page.locator('#task-edit-name').fill('害羞打滚')
    await page.locator('#task-edit-motion').fill('先缩起来，再沿着地面慢慢打滚一圈。')
    await page.locator('#task-edit-loop').selectOption('false')
    await page.locator('#task-edit-trigger').selectOption('manual')
    await page.locator('#save-task-button').click()

    await page.waitForFunction(() => /Task edits saved\./.test(document.querySelector('#status-line').textContent))
    assert.match(await page.locator('#task-preview').textContent(), /害羞打滚/i)
    assert.match(await page.locator('#task-preview').textContent(), /先缩起来，再沿着地面慢慢打滚一圈/i)
    assert.match(await page.locator('#trigger-panel').textContent(), /manual/i)

    await page.locator('#confirm-button').click()
    await page.waitForFunction(() => !document.querySelector('#generate-button').disabled)
    await page.locator('#generate-button').click()
    await page.waitForFunction(() => !document.querySelector('#approve-button').disabled)

    const reviewText = await page.locator('#action-review-panel').textContent()
    assert.match(reviewText, /害羞打滚/i)
    assert.match(reviewText, /manual/i)
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio dashboard shows failed generation recovery and retries the same run', { concurrency: false }, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-dashboard-browser-retry-'))
  let generationAttempts = 0
  const bridgeServer = http.createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      const payload = body ? JSON.parse(body) : {}
      response.setHeader('Content-Type', 'application/json')
      if (request.url.endsWith('/creator/model-settings')) {
        response.end(JSON.stringify({
          ok: true,
          config: {
            provider: 'openai-compatible',
            baseUrl: 'http://127.0.0.1:7860/v1',
            model: 'local-custom-sprite-v2'
          }
        }))
        return
      }
      if (request.url.endsWith('/creator/model-image-generate')) {
        generationAttempts += 1
        if (generationAttempts === 1) {
          response.statusCode = 503
          response.end(JSON.stringify({ ok: false, error: 'Provider queue overloaded' }))
          return
        }
        const dataRelativePath = `runs/${payload.output.dataRelativeDir.split('/')[1]}/frames/base/0001.png`
        const generatedPath = path.join(dataDir, dataRelativePath)
        fs.mkdirSync(path.dirname(generatedPath), { recursive: true })
        sharp({
          create: {
            width: 96,
            height: 112,
            channels: 4,
            background: { r: 255, g: 170, b: 90, alpha: 1 }
          }
        })
          .png()
          .toFile(generatedPath)
          .then(() => {
            response.end(JSON.stringify({
              ok: true,
              result: {
                ok: true,
                backend: 'provider',
                model: 'local-custom-sprite-v2',
                generatedAt: '2026-06-27T00:00:00.000Z',
                outputs: [{
                  dataRelativePath,
                  mimeType: 'image/png',
                  sha256: 'retry-sha'
                }]
              }
            }))
          })
          .catch((error) => {
            response.statusCode = 500
            response.end(JSON.stringify({ ok: false, error: error.message }))
          })
        return
      }
      response.statusCode = 404
      response.end(JSON.stringify({ ok: false, error: 'Unknown route' }))
    })
  })
  await new Promise((resolve) => bridgeServer.listen(0, '127.0.0.1', resolve))
  const previousBridgeUrl = process.env.OPENPET_BRIDGE_URL
  const previousBridgeToken = process.env.OPENPET_BRIDGE_TOKEN
  process.env.OPENPET_BRIDGE_URL = `http://127.0.0.1:${bridgeServer.address().port}`
  process.env.OPENPET_BRIDGE_TOKEN = 'bridge-token'
  const server = await openDashboardServer(dataDir)
  const { browser, page } = await openDashboardPage(server)

  try {
    await page.locator('#backend-select').selectOption('provider')
    await page.locator('#prompt-input').fill('新增一个自定义动作：害羞转圈，点击后轻轻转一圈。')
    await page.locator('#draft-button').click()
    await page.waitForFunction(() => !document.querySelector('#confirm-button').disabled)

    await page.locator('#confirm-button').click()
    await page.waitForFunction(() => !document.querySelector('#generate-button').disabled)
    await page.locator('#generate-button').click()
    await page.waitForFunction(() => /Provider queue overloaded/.test(document.querySelector('#status-line').textContent))

    assert.match(await page.locator('#recovery-panel').textContent(), /Generation failed/i)
    assert.match(await page.locator('#recovery-panel').textContent(), /Provider queue overloaded/i)
    await expectRetryButtonLabel(page, 'Retry generation')

    const runIdBeforeRetry = await page.locator('#run-select').inputValue()
    await page.locator('#generate-button').click()
    await page.waitForFunction(() => !document.querySelector('#approve-button').disabled)

    const runIdAfterRetry = await page.locator('#run-select').inputValue()
    assert.equal(runIdAfterRetry, runIdBeforeRetry)
    assert.equal(generationAttempts, 2)
    assert.match(await page.locator('#status-line').textContent(), /Generated action output/i)
    assert.match(await page.locator('#action-review-panel').textContent(), /Review status/i)
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
    bridgeServer.closeAllConnections?.()
    await new Promise((resolve) => bridgeServer.close(resolve))
    if (previousBridgeUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousBridgeUrl
    if (previousBridgeToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousBridgeToken
  }
})

const expectRetryButtonLabel = async (page, label) => {
  await page.waitForFunction((expected) => document.querySelector('#generate-button')?.textContent?.includes(expected), label)
}
