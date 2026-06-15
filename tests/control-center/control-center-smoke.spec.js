const { test, expect } = require('@playwright/test')

const tabs = ['Pet', 'Actions', 'AI', 'Plugins', 'Catalog', 'Service', 'About']
const pageErrorsByPage = new WeakMap()

test.describe('Control Center smoke', () => {
  test.beforeEach(async ({ page }) => {
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') pageErrors.push(message.text())
    })
    pageErrorsByPage.set(page, pageErrors)
  })

  test.afterEach(async ({ page }) => {
    expect(pageErrorsByPage.get(page)).toEqual([])
  })

  test('loads the app shell and every tab with the demo API', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle('OpenPet Control Center')
    await expect(page.getByText('OpenPet')).toBeVisible()
    await expect(page.getByText('Control Center')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Pet' })).toBeVisible()

    for (const tab of tabs) {
      await page.getByRole('button', { name: tab }).click()
      await expect(page.getByRole('heading', { name: tab })).toBeVisible()
    }
  })

  test('keeps key Pet and About interactions responsive', async ({ page }) => {
    await page.goto('/')

    const scale = page.locator('input[type="range"]')
    await expect(scale).toHaveValue('100')
    await scale.evaluate((input) => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      valueSetter.call(input, '125')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await expect(page.getByText('125%')).toBeVisible()

    await page.getByRole('button', { name: '快' }).click()
    await expect(page.getByRole('group', { name: '散步速度' }).getByRole('button', { name: '快' })).toHaveClass(/active/)

    await page.getByRole('button', { name: 'About' }).click()
    await page.getByRole('button', { name: '检查更新' }).click()
    await expect(page.locator('.readonly-row', { hasText: '更新状态' })).toContainText('Update feed is not configured.')
  })

  test('persists Pet settings in the demo API session', async ({ page }) => {
    await page.goto('/')

    const scale = page.locator('input[type="range"]')
    await scale.evaluate((input) => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      valueSetter.call(input, '135')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await page.getByRole('button', { name: '快' }).click()
    await page.getByRole('button', { name: '保存', exact: true }).click()

    await expect(page.locator('.status-line')).toContainText('原始大小 135%')
    await page.getByRole('button', { name: '还原' }).click()
    await expect(scale).toHaveValue('135')
    await expect(page.getByRole('group', { name: '散步速度' }).getByRole('button', { name: '快' })).toHaveClass(/active/)
  })

  test('persists AI config and clears API key drafts with the demo API', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    await page.getByLabel('Base URL').fill('https://ai.example.test/v1')
    await page.getByLabel('Model').fill('openpet-test-model')
    await page.getByLabel('System Prompt').fill('Stay tiny, helpful, and local-first.')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.locator('.status-line')).toContainText('AI 配置已保存')

    const apiKeyInput = page.locator('.field-row', { hasText: 'API Key' }).locator('input[type="password"]')
    await apiKeyInput.fill('sk-demo-secret')
    await page.getByRole('button', { name: '保存密钥' }).click()
    await expect(page.locator('.status-line')).toContainText('API Key 已保存')
    await expect(apiKeyInput).toHaveValue('')
    await expect(page.locator('.field-row', { hasText: 'API Key' })).toContainText('已保存')

    await page.reload()
    await page.getByRole('button', { name: 'AI' }).click()
    await expect(page.getByLabel('Base URL')).toHaveValue('https://ai.example.test/v1')
    await expect(page.getByLabel('Model')).toHaveValue('openpet-test-model')
    await expect(page.getByLabel('System Prompt')).toHaveValue('Stay tiny, helpful, and local-first.')
    await expect(page.locator('.field-row', { hasText: 'API Key' })).toContainText('已保存')
  })

  test('persists Service config and exposes the updated loopback endpoint', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Service' }).click()

    await page.getByLabel('端口').fill('4318')
    await page.getByRole('button', { name: '保存', exact: true }).click()

    await expect(page.locator('.status-line')).toContainText('本地服务已启动')
    await expect(page.locator('.readonly-row', { hasText: '当前端点' })).toContainText('http://127.0.0.1:4318/api/status')
    await expect(page.getByText('MCPhttp://127.0.0.1:4318/mcp')).toBeVisible()

    await page.reload()
    await page.getByRole('button', { name: 'Service' }).click()
    await expect(page.getByLabel('端口')).toHaveValue('4318')
    await expect(page.locator('.readonly-row', { hasText: '当前端点' })).toContainText('http://127.0.0.1:4318/api/status')
  })

  test('manages MCP sessions from the Service tab with the demo API', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Service' }).click()

    const mcpSessionsRow = page.locator('.readonly-row', { hasText: 'MCP Sessions' })
    await expect(page.locator('.field-row', { hasText: 'HTTP API' })).toContainText('运行中')
    await expect(mcpSessionsRow).toContainText('2')

    await mcpSessionsRow.getByRole('button', { name: '撤销全部' }).click()
    await expect(page.locator('.status-line')).toContainText('MCP sessions 已撤销')
    await expect(mcpSessionsRow).toContainText('0')
    await expect(mcpSessionsRow.getByRole('button', { name: '撤销全部' })).toBeDisabled()

    await page.reload()
    await page.getByRole('button', { name: 'Service' }).click()
    await expect(page.locator('.readonly-row', { hasText: 'MCP Sessions' })).toContainText('0')

    await page.evaluate(() => window.sessionStorage.removeItem('openpet.controlCenter.demoState'))
    await page.reload()
    await page.getByRole('button', { name: 'Service' }).click()

    const resetMcpSessionsRow = page.locator('.readonly-row', { hasText: 'MCP Sessions' })
    await expect(resetMcpSessionsRow).toContainText('2')
    await expect(page.locator('.readonly-row', { hasText: '访问令牌' })).toContainText('demo-token')
    await page.getByRole('button', { name: '轮换令牌' }).click()
    await expect(page.locator('.status-line')).toContainText('访问令牌已轮换')
    await expect(page.locator('.readonly-row', { hasText: '访问令牌' })).toContainText('demo-token-rotated')
    await expect(resetMcpSessionsRow).toContainText('0')
  })

  test('installs Catalog plugins from the review panel with the demo API', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Catalog' }).click()

    const weatherPlugin = page.locator('.catalog-item', { hasText: 'Demo Weather' })
    await expect(weatherPlugin).toContainText('Available')
    await weatherPlugin.getByRole('button', { name: 'Install' }).click()

    const reviewPanel = page.locator('.plugin-review-panel', { hasText: 'Demo Weather' })
    await expect(reviewPanel).toContainText('安装 1.0.0')
    await expect(reviewPanel).toContainText('新增 pet:say, network')
    await expect(reviewPanel).toContainText('Unsigned local demo')
    await reviewPanel.getByRole('button', { name: '确认安装' }).click()

    await expect(page.locator('.status-line')).toContainText('插件已安装，默认保持停用')
    await expect(weatherPlugin).toContainText('Installed 1.0.0')
    await expect(reviewPanel).toBeHidden()

    await page.reload()
    await page.getByRole('button', { name: 'Catalog' }).click()
    await expect(page.locator('.catalog-item', { hasText: 'Demo Weather' })).toContainText('Installed 1.0.0')
  })

  test('updates Catalog plugins and installs Catalog pet packs with the demo API', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Catalog' }).click()

    const pomodoroPlugin = page.locator('.catalog-item', { hasText: 'Demo Pomodoro' })
    await expect(pomodoroPlugin).toContainText('Update 1.0.0 → 1.1.0')
    await pomodoroPlugin.getByRole('button', { name: 'Update' }).click()

    const pluginReviewPanel = page.locator('.plugin-review-panel', { hasText: 'Demo Pomodoro' })
    await expect(pluginReviewPanel).toContainText('更新 1.0.0 → 1.1.0')
    await expect(pluginReviewPanel).toContainText('保留 pet:say')
    await pluginReviewPanel.getByRole('button', { name: '确认安装' }).click()

    await expect(page.locator('.status-line')).toContainText('插件已安装，默认保持停用')
    await expect(pomodoroPlugin).toContainText('Installed 1.1.0')

    const pixelCatPack = page.locator('.catalog-item', { hasText: 'Demo Pixel Cat' })
    await expect(pixelCatPack).toContainText('Available')
    await pixelCatPack.getByRole('button', { name: 'Install' }).click()

    const petPackReviewPanel = page.locator('.plugin-review-panel', { hasText: 'Demo Pixel Cat' })
    await expect(petPackReviewPanel).toContainText('openpet.demo.pixel-cat · 1.0.0 · 3 actions')
    await expect(petPackReviewPanel).toContainText('默认动作')
    await petPackReviewPanel.getByRole('button', { name: '安装 Pet Pack' }).click()

    await expect(page.locator('.status-line')).toContainText('Pet pack 已安装')
    await expect(pixelCatPack).toContainText('Installed 1.0.0')

    await page.reload()
    await page.getByRole('button', { name: 'Catalog' }).click()
    await expect(page.locator('.catalog-item', { hasText: 'Demo Pomodoro' })).toContainText('Installed 1.1.0')
    await expect(page.locator('.catalog-item', { hasText: 'Demo Pixel Cat' })).toContainText('Installed 1.0.0')
  })
})
