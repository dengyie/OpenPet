const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { chromium } = require('@playwright/test')

const { createCreatorStudioServer } = require('../../examples/plugins/creator-studio/service/studio-service')

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
  const dashboardPath = path.join(__dirname, '../../examples/plugins/creator-studio/web/dashboard/index.html')
  const server = createCreatorStudioServer({ dataDir, dashboardPath })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

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
