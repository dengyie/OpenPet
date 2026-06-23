const { test, expect } = require('@playwright/test')

const tabs = ['Pet', 'Actions', 'AI', 'Plugins', 'Catalog', 'Service', 'About']
const pageErrorsByPage = new WeakMap()

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const aiSection = (page, name) => (
  page.locator('details.ai-section').filter({
    has: page.locator('summary h2').filter({ hasText: new RegExp(`^${escapeRegExp(name)}$`) })
  })
)

const expandAiSection = async (page, name) => {
  const section = aiSection(page, name)
  await expect(section).toHaveCount(1)
  if (await section.getAttribute('open') === null) {
    await section.locator('summary').click()
  }
  await expect(section).toHaveAttribute('open', '')
  return section
}

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
    await expect(page.getByRole('navigation', { name: 'Control Center' })).toBeVisible()
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

    await page.getByRole('button', { name: '上方' }).click()
    await expect(page.getByRole('group', { name: '菜单位置' }).getByRole('button', { name: '上方' })).toHaveClass(/active/)

    await page.getByRole('button', { name: 'About' }).click()
    await page.getByRole('button', { name: '检查更新' }).click()
    await expect(page.locator('.readonly-row', { hasText: '更新状态' })).toContainText('Update feed is not configured.')
  })

  test('applies an action trigger proposal through the demo API', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Actions' }).click()

    await page.getByRole('button', { name: /Sleep/ }).click()
    const reviewCard = page.locator('[aria-label="触发建议审阅"]')
    await expect(reviewCard).toContainText('目标动作：Sleep')
    await expect(reviewCard).toContainText('接受后会立即把 clickAction 改成目标动作。')
    await reviewCard.locator('select').selectOption('click')
    await page.getByRole('button', { name: '应用点击触发' }).click()

    await expect(page.locator('.status-line')).toContainText('已应用 触发建议')
    await expect(reviewCard).toContainText('最近结果：已应用')
    await expect(reviewCard).toContainText('结果码：applied')
    await expect(page.locator('.readonly-row', { hasText: '点击动作' }).locator('select')).toHaveValue('sleep')

    await reviewCard.locator('select').selectOption('manual')
    await expect(reviewCard).not.toContainText('最近结果：已应用')
  })

  test('keeps host-rule trigger proposals pending in the Actions review UI', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Actions' }).click()

    await page.getByRole('button', { name: /Sleep/ }).click()
    const clickAction = page.locator('.readonly-row', { hasText: '点击动作' }).locator('select')
    const beforeClickAction = await clickAction.inputValue()
    const reviewCard = page.locator('[aria-label="触发建议审阅"]')

    await reviewCard.locator('select').selectOption('state')
    await expect(reviewCard).toContainText('状态条件和优先级必须由 host 统一校验和持久化。')
    await page.getByRole('button', { name: '确认待规则' }).click()

    await expect(page.locator('.status-line')).toContainText('已确认 触发建议')
    await expect(reviewCard).toContainText('最近结果：已确认')
    await expect(reviewCard).toContainText('结果码：pending_host_rule')
    await expect(clickAction).toHaveValue(beforeClickAction)
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
    await page.getByRole('button', { name: '左侧' }).click()
    await page.getByRole('button', { name: '保存', exact: true }).click()

    await expect(page.locator('.status-line')).toContainText('原始大小 135%')
    await page.getByRole('button', { name: '还原' }).click()
    await expect(scale).toHaveValue('135')
    await expect(page.getByRole('group', { name: '散步速度' }).getByRole('button', { name: '快' })).toHaveClass(/active/)
    await expect(page.getByRole('group', { name: '菜单位置' }).getByRole('button', { name: '左侧' })).toHaveClass(/active/)
  })

  test('configures a custom pet hover cursor in the redesigned cursor library', async ({ page }) => {
    await page.goto('/')

    const cursorHeader = page.locator('.cursor-selection-header')
    const cursorOptionsRow = page.locator('.cursor-options-row')
    const cursorOptionCards = page.locator('.cursor-option-card')
    const cursorLibraryPanel = page.locator('.cursor-library-panel')

    await expect(cursorHeader).toContainText('指针选择')
    await expect(cursorHeader).toContainText('预览会模拟真实指针落点')
    await expect(cursorOptionsRow).toBeVisible()
    await expect(cursorOptionCards).toHaveCount(7)
    await expect(cursorOptionCards.first()).toHaveCSS('width', '124px')
    await expect(cursorOptionCards.first().locator('.cursor-card-preview')).toHaveCSS('min-height', '78px')
    await expect(cursorOptionCards.first().locator('img')).toHaveCSS('width', '9px')
    await expect(page.getByRole('button', { name: '系统默认' })).toHaveCount(0)
    await expect(cursorLibraryPanel).toHaveCount(0)

    await page.getByRole('button', { name: '添加自定义' }).click()
    await expect(cursorOptionCards).toHaveCount(8)
    await expect(page.locator('.cursor-option-card.selected')).toContainText('demo-cursor')
    await expect(page.getByRole('button', { name: /demo-cursor/ })).toBeVisible()
  })

  test('persists grounded and home settings in the demo API session', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('switch', { name: 'Enable grounded mode' }).click()
    await page.getByRole('switch', { name: 'Enable home anchor' }).click()
    await page.getByRole('group', { name: '活动范围' }).getByRole('button', { name: '大' }).click()
    await page.getByRole('button', { name: '保存', exact: true }).click()

    await page.reload()
    await expect(page.getByRole('switch', { name: 'Enable grounded mode' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('switch', { name: 'Enable home anchor' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('group', { name: '活动范围' }).getByRole('button', { name: '大' })).toHaveClass(/active/)
  })

  test('turning grounded off disables home in the demo API session', async ({ page }) => {
    await page.goto('/')

    const grounded = page.getByRole('switch', { name: 'Enable grounded mode' })
    const home = page.getByRole('switch', { name: 'Enable home anchor' })

    await grounded.click()
    await home.click()
    await grounded.click()

    await expect(home).toBeDisabled()
    await expect(home).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByRole('group', { name: '活动范围' }).getByRole('button', { name: '中' })).toBeDisabled()
  })

  test('configures a custom pet hover cursor in the demo API session', async ({ page }) => {
    await page.goto('/')

    const customCursorRow = page.locator('.field-row', { hasText: '自定义鼠标指针' })
    await expect(customCursorRow).toContainText('未选择')
    await expect(customCursorRow.getByRole('switch', { name: '启用自定义鼠标指针' })).toBeDisabled()

    await customCursorRow.getByRole('button', { name: '选择图片' }).click()
    await expect(customCursorRow).toContainText('demo-cursor.png')
    await expect(customCursorRow.getByRole('switch', { name: '启用自定义鼠标指针' })).toHaveAttribute('aria-checked', 'true')
    await page.reload()

    const reloadedCursorRow = page.locator('.field-row', { hasText: '自定义鼠标指针' })
    await expect(reloadedCursorRow).toContainText('demo-cursor.png')
    await expect(reloadedCursorRow.getByRole('switch', { name: '启用自定义鼠标指针' })).toHaveAttribute('aria-checked', 'true')

    await reloadedCursorRow.getByRole('button', { name: '清除' }).click()
    await expect(reloadedCursorRow).toContainText('未选择')
    await expect(reloadedCursorRow.getByRole('switch', { name: '启用自定义鼠标指针' })).toBeDisabled()
  })

  test('persists AI config and clears API key drafts with the demo API', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    await page.getByLabel('Base URL').fill('https://ai.example.test/v1')
    await page.getByLabel('Model').fill('openpet-test-model')
    await page.getByLabel('System Prompt').fill('Stay tiny, helpful, and local-first.')
    await page.getByRole('switch', { name: 'Enable AI memory' }).click()
    await expect(page.locator('.provider-warning')).toContainText('未保存的 Provider 草稿')
    await page.getByRole('button', { name: '保存配置', exact: true }).click()
    await expect(page.locator('.status-line')).toContainText('AI 配置已保存')
    await expect(page.locator('.readonly-row', { hasText: '当前生效配置' })).toContainText('https://ai.example.test/v1')

    const apiKeyInput = page.locator('.field-row', { hasText: 'API Key' }).locator('input[type="password"]')
    await apiKeyInput.fill('sk-demo-secret')
    await page.getByRole('button', { name: '保存密钥' }).click()
    await expect(page.locator('.status-line')).toContainText('API Key 已保存')
    await expect(apiKeyInput).toHaveValue('')
    await expect(page.locator('.field-row', { hasText: 'API Key' })).toContainText('已保存')

    await page.getByRole('button', { name: '保存并测试' }).click()
    await expect(page.locator('.connection-result')).toContainText('连接测试通过')
    await expect(page.locator('.connection-result')).toContainText('openpet-test-model')

    await page.reload()
    await page.getByRole('button', { name: 'AI' }).click()
    await expect(page.getByLabel('Base URL')).toHaveValue('https://ai.example.test/v1')
    await expect(page.getByLabel('Model')).toHaveValue('openpet-test-model')
    await expect(page.getByLabel('System Prompt')).toHaveValue('Stay tiny, helpful, and local-first.')
    await expect(page.locator('.field-row', { hasText: 'API Key' })).toContainText('已保存')
  })

  test('save and test uses the current AI drafts as one flow in the demo API', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    await page.getByRole('textbox', { name: 'Base URL', exact: true }).fill('https://combo.example.test/v1')
    await page.getByRole('textbox', { name: 'Model', exact: true }).fill('combo-test-model')
    await page.getByPlaceholder('输入 API Key').fill('sk-combo-secret')

    await page.getByRole('button', { name: '保存并测试配置' }).click()

    await expect(page.locator('.readonly-row', { hasText: '当前生效配置' })).toContainText('https://combo.example.test/v1')
    await expect(page.locator('.readonly-row', { hasText: '当前生效配置' })).toContainText('combo-test-model')
    await expect(page.locator('.status-line').first()).toContainText('连接正常：openai-compatible · https://combo.example.test/v1 · combo-test-model')
    await expect(page.locator('.field-row').filter({ has: page.getByText('API Key', { exact: true }) })).toContainText('已保存')
  })

  test('persists image generation config and supports key health actions in the demo API', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    const imageProviderSection = await expandAiSection(page, '图片 Provider')
    await expect(page.getByLabel('图片默认后端')).toHaveCount(0)
    await expect(page.getByLabel('本地 Endpoint')).toHaveCount(0)
    await expect(page.getByLabel('本地 Health URL')).toHaveCount(0)
    await expect(page.getByLabel('本地模型')).toHaveCount(0)

    await imageProviderSection.getByRole('button', { name: /本地\/代理 OpenAI-compatible/ }).click()
    await expect(page.getByLabel('图片 Base URL')).toHaveValue('http://127.0.0.1:8317/v1')
    await expect(page.getByLabel('图片 Model')).toHaveValue('gpt-image-2')
    await expect(page.getByLabel('图片 Timeout MS')).toHaveValue('120000')
    await expect(page.getByLabel('图片最大并发')).toHaveValue('1')

    await page.getByLabel('图片 Base URL').fill('https://image.example.test/v1')
    await page.getByLabel('图片 Model').fill('openpet-image-test')
    await page.getByLabel('图片 Timeout MS').fill('90000')
    await page.getByLabel('图片最大并发').fill('2')
    await expect(page.locator('.readonly-row', { hasText: '图片草稿状态' })).toContainText('图片配置草稿未保存')
    await page.getByRole('button', { name: '检查图片健康' }).click()
    await expect(page.locator('.readonly-row', { hasText: '图片健康状态' })).toContainText('请先保存图片配置')

    await imageProviderSection.getByRole('button', { name: '保存图片 Provider' }).click()
    await expect(page.locator('.status-line')).toContainText('图片 Provider 配置已保存')
    await expect(page.locator('.readonly-row', { hasText: '图片当前 Provider' })).toContainText('openpet-image-test')
    await expect(page.locator('.readonly-row', { hasText: '图片草稿状态' })).toContainText('当前没有未保存')
    await expect(page.locator('.readonly-row', { hasText: '生成边界' })).toContainText('API Key')

    const imageApiKeyRow = page.locator('.field-row', { hasText: '图片 API Key' })
    const imageApiKeyInput = imageApiKeyRow.locator('input[type="password"]')
    await imageApiKeyInput.fill('sk-image-demo-1234')
    await page.getByRole('button', { name: '保存图片密钥' }).click()
    await expect(page.locator('.status-line')).toContainText('图片 API Key 已保存')
    await expect(imageApiKeyInput).toHaveValue('')
    await expect(imageApiKeyRow).toContainText('已保存')
    await expect(imageApiKeyRow).toContainText('••••1234')

    await page.getByRole('button', { name: '检查图片健康' }).click()
    await expect(page.locator('.readonly-row', { hasText: '图片健康状态' })).toContainText('图片 Provider 可达，但模型列表探测不可用')

    await page.getByRole('button', { name: '清除图片密钥' }).click()
    await expect(page.locator('.status-line')).toContainText('图片 API Key 已清除')
    await expect(imageApiKeyRow).toContainText('未保存')

    await page.getByRole('button', { name: '检查图片健康' }).click()
    await expect(page.locator('.readonly-row', { hasText: '图片健康状态' })).toContainText('图片 Provider 健康检查失败：Image generation API key is missing')

    await page.reload()
    await page.getByRole('button', { name: 'AI' }).click()
    await expandAiSection(page, '图片 Provider')
    await expect(page.getByLabel('图片 Base URL')).toHaveValue('https://image.example.test/v1')
    await expect(page.getByLabel('图片 Model')).toHaveValue('openpet-image-test')
    await expect(page.getByLabel('图片 Timeout MS')).toHaveValue('90000')
    await expect(page.getByLabel('图片最大并发')).toHaveValue('2')
    await expect(page.locator('.field-row', { hasText: '图片 API Key' })).toContainText('未保存')
  })

  test('persists pet persona override and follows the active pet-pack in the demo API', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    await expandAiSection(page, 'Pet Persona Override')
    await expect(page.getByRole('heading', { name: 'Pet Persona Override' })).toBeVisible()
    await expect(page.locator('.field-note', { hasText: '当前激活宠物包' })).toContainText('Legacy Cat')
    await expect(page.getByLabel('Tone')).toHaveAttribute('placeholder', 'warm and concise')

    await page.getByLabel('Tone').fill('sleepy and affectionate')
    await page.getByLabel('Core Traits').fill('loyal\nsoft-spoken')
    await page.getByRole('button', { name: '保存人格 override' }).click()

    await expect(page.locator('.status-line')).toContainText('宠物人格 override 已保存')
    await expect(page.locator('.json-preview').first()).toContainText('Tone: sleepy and affectionate')
    await expect(page.locator('.json-preview').first()).toContainText('Core traits: loyal, soft-spoken')

    await page.reload()
    await page.getByRole('button', { name: 'AI' }).click()
    await expect(page.getByLabel('Tone')).toHaveValue('sleepy and affectionate')
    await expect(page.getByLabel('Core Traits')).toHaveValue('loyal\nsoft-spoken')

    await page.getByRole('button', { name: 'Actions' }).click()
    await page.getByRole('button', { name: '启用' }).filter({ hasText: /^启用$/ }).nth(0).click()
    await expect(page.locator('.status-line')).toContainText('已启用 Citrus Cat')

    await page.getByRole('button', { name: 'AI' }).click()
    await expandAiSection(page, 'Pet Persona Override')
    await expect(page.locator('.field-note', { hasText: '当前激活宠物包' })).toContainText('Citrus Cat')
    await expect(page.getByLabel('Tone')).toHaveValue('')
    await expect(page.getByLabel('Tone')).toHaveAttribute('placeholder', 'light, sunny, and attentive')

    await page.getByLabel('Tone').fill('sparkly and kind')
    await page.getByRole('button', { name: '保存人格 override' }).click()
    await expect(page.locator('.json-preview').first()).toContainText('Tone: sparkly and kind')

    await page.getByRole('button', { name: '清空 override' }).click()
    await expect(page.locator('.status-line')).toContainText('宠物人格 override 已清空')
    await expect(page.getByLabel('Tone')).toHaveValue('')
    await expect(page.locator('.json-preview').first()).toContainText('Tone: light, sunny, and attentive')

    await page.getByLabel('生成说明').fill('更适合专注工作')
    await page.getByRole('button', { name: '生成人格草稿' }).click()
    await expect(page.locator('.status-line')).toContainText('宠物人格草稿已生成')
    await expect(page.getByText('Generated Persona Draft')).toBeVisible()
    await expect(page.locator('.json-preview', { hasText: 'generated from: 更适合专注工作' })).toBeVisible()
    await expect(page.getByLabel('Tone')).toHaveValue('')

    await page.getByRole('button', { name: '应用草稿' }).click()
    await expect(page.locator('.status-line')).toContainText('宠物人格草稿已应用')
    await expect(page.getByLabel('Tone')).toHaveValue('generated from: 更适合专注工作')

    await page.reload()
    await page.getByRole('button', { name: 'AI' }).click()
    await expandAiSection(page, 'Pet Persona Override')
    await expect(page.getByLabel('Tone')).toHaveValue('generated from: 更适合专注工作')
  })

  test('shows AI behavior decisions and supports replay and clearing diagnostics', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    await expandAiSection(page, 'Behavior')
    const decisionsPanel = page.locator('.field-row', { hasText: 'Decisions' })
    await expect(decisionsPanel).toContainText('1 条')
    await expect(decisionsPanel.locator('.behavior-decision-row')).toContainText('#1 matched')
    await expect(decisionsPanel.locator('.behavior-decision-row')).toContainText('matched rule demo-rule')

    await decisionsPanel.getByPlaceholder('Decision ID').fill('1')
    await decisionsPanel.getByRole('button', { name: 'Replay' }).click()
    await expect(page.locator('.status-line')).toContainText('Replay 命中')
    await expect(decisionsPanel.locator('.behavior-result')).toContainText('demo replay matched')

    await decisionsPanel.getByRole('button', { name: '导出' }).click()
    await expect(page.locator('.status-line')).toContainText('Behavior 诊断已导出')

    page.once('dialog', (dialog) => dialog.accept())
    await decisionsPanel.getByRole('button', { name: '清空' }).click()
    await expect(page.locator('.status-line')).toContainText('Behavior 决策已清空')
    await expect(decisionsPanel).toContainText('0 条')
    await expect(decisionsPanel.locator('.empty-chat')).toContainText('暂无决策记录')

    await expandAiSection(page, '聊天')
    await page.getByPlaceholder('说点什么').fill('hello decision viewer')
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.locator('.status-line')).toContainText('已触发动作：Wave')
    await expect(decisionsPanel).toContainText('1 条')
    await expect(decisionsPanel.locator('.behavior-decision-row')).toContainText('matched rule demo-chat')
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
    await expect(reviewPanel).toContainText('Entry declarations')
    await expect(reviewPanel).toContainText('Command entries')
    await expect(reviewPanel).toContainText('weather-report')
    await expect(reviewPanel).toContainText('Service entries')
    await expect(reviewPanel).toContainText('weather-companion')
    await expect(reviewPanel).toContainText('Dashboard entries')
    await expect(reviewPanel).toContainText('weather-dashboard')
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

  test('installs manual plugin packages from the Plugins review panel with the demo API', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Plugins' }).click()

    await expect(page.locator('.plugin-list')).toContainText('暂无插件')
    await page.getByRole('button', { name: 'Install plugin' }).click()

    const reviewPanel = page.locator('.plugin-review-panel', { hasText: 'Demo Manual Review' })
    await expect(reviewPanel).toContainText('安装 1.0.0')
    await expect(reviewPanel).toContainText('新增 pet:say, storage')
    await expect(reviewPanel).toContainText('Unsigned plugin')
    await expect(reviewPanel).toContainText('3 files')
    await expect(reviewPanel).toContainText('命令：hello')
    await expect(reviewPanel).toContainText('Entry declarations')
    await expect(reviewPanel).toContainText('Setup entries are not executed')
    await expect(reviewPanel).toContainText('Setup entries')
    await expect(reviewPanel).toContainText('install-deps')
    await expect(reviewPanel).toContainText('Command entries')
    await expect(reviewPanel).toContainText('hello')
    await expect(reviewPanel).toContainText('Service entries')
    await expect(reviewPanel).toContainText('manual-companion')
    await expect(reviewPanel).toContainText('Dashboard entries')
    await expect(reviewPanel).toContainText('manual-dashboard')
    await expect(reviewPanel).toContainText('Config')
    await expect(reviewPanel).toContainText('config.schema.json')
    await expect(reviewPanel).toContainText('Assets')
    await expect(reviewPanel).toContainText('assets/manual-card.html')
    await expect(reviewPanel).toContainText('Manifest')
    await expect(reviewPanel).toContainText('Demo local data disclosure.')

    await reviewPanel.getByRole('button', { name: '取消' }).click()
    await expect(reviewPanel).toBeHidden()
    await expect(page.locator('.plugin-list')).toContainText('暂无插件')

    await page.getByRole('button', { name: 'Install plugin' }).click()
    const nextReviewPanel = page.locator('.plugin-review-panel', { hasText: 'Demo Manual Review' })
    await nextReviewPanel.getByRole('button', { name: '安装插件' }).click()

    await expect(page.locator('.status-line')).toContainText('插件已安装，默认保持停用')
    await expect(nextReviewPanel).toBeHidden()

    const pluginRow = page.locator('.plugin-row', { hasText: 'Demo Manual Review' })
    await expect(pluginRow).toContainText('openpet.demo.manual-review')
    await expect(pluginRow).toContainText('local')
    await expect(pluginRow).toContainText('Unsigned plugin')
    await expect(pluginRow).toContainText('pet:say · storage')
    await expect(pluginRow).toContainText('Entry declarations')
    await expect(pluginRow).toContainText('Setup entries')
    await expect(pluginRow).toContainText('install-deps · npm install · not-run')
    await expect(pluginRow.getByRole('button', { name: 'Run Install Dependencies Setup' })).toBeDisabled()
    await expect(pluginRow).toContainText('Command entries')
    await expect(pluginRow).toContainText('hello')
    await expect(pluginRow.getByRole('button', { name: 'Say hello' })).toBeDisabled()
    await expect(pluginRow).toContainText('Service entries')
    await expect(pluginRow).toContainText('manual-companion')
    await expect(pluginRow).toContainText('Dashboard entries')
    await expect(pluginRow).toContainText('manual-dashboard')
    const pluginEnabledSwitch = pluginRow.getByRole('switch', { name: 'Enable Demo Manual Review' })
    await expect(pluginEnabledSwitch).toHaveAttribute('aria-checked', 'false')
    await expect(pluginRow).toContainText('Service status: stopped')
    await expect(pluginRow).toContainText('Health: unknown')
    await expect(pluginRow.getByRole('button', { name: 'Start Manual Companion' })).toBeDisabled()
    await expect(pluginRow.getByRole('button', { name: 'Check Manual Companion Health' })).toBeDisabled()
    await expect(pluginRow.locator('.plugin-health-policy')).toContainText('Periodic health')
    await expect(pluginRow.locator('.plugin-health-policy').getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    await expect(pluginRow.getByRole('button', { name: 'Manual Dashboard' })).toBeDisabled()
    await expect(page.locator('.plugin-log-row', { hasText: 'Plugin installed' })).toContainText('openpet.demo.manual-review')

    await pluginEnabledSwitch.click()
    await expect(page.locator('.status-line')).toContainText('插件已启用')
    await pluginRow.getByRole('button', { name: 'Say hello' }).click()
    await expect(page.locator('.status-line')).toContainText('Demo command completed')
    await expect(pluginRow).toContainText('最近命令结果')
    await expect(pluginRow).toContainText('hello · exit 0')
    await expect(pluginRow).toContainText('{"ok":true,"message":"Demo command completed","petSay":"hello"}')
    await expect(page.locator('.plugin-log-row', { hasText: 'Command completed' })).toContainText('hello')
    await pluginRow.getByRole('button', { name: 'Run Install Dependencies Setup' }).click()
    await expect(page.locator('.status-line')).toContainText('Setup completed')
    await expect(pluginRow).toContainText('install-deps · npm install · succeeded')
    await expect(page.locator('.plugin-log-row', { hasText: 'Setup completed' })).toContainText('setup:install-deps')
    await pluginRow.getByRole('button', { name: 'Check Manual Companion Health' }).click()
    await expect(page.locator('.status-line')).toContainText('Service health healthy')
    await expect(pluginRow).toContainText('Health: healthy')
    await expect(page.locator('.plugin-log-row', { hasText: 'Service health healthy' })).toContainText('service:manual-companion')
    const policyControls = pluginRow.locator('.plugin-health-policy')
    await policyControls.getByRole('switch').click()
    await expect(page.locator('.status-line')).toContainText('Periodic health 已启用')
    await expect(policyControls.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    await policyControls.getByRole('combobox').selectOption('60000')
    await expect(page.locator('.status-line')).toContainText('Periodic health 已启用')
    await expect(policyControls.getByRole('combobox')).toHaveValue('60000')
    await expect(page.locator('.plugin-log-row', { hasText: 'Service health policy saved' }).first()).toContainText('service:manual-companion')
    await pluginRow.getByRole('button', { name: 'Start Manual Companion' }).click()
    await expect(page.locator('.status-line')).toContainText('Service 已启动')
    await expect(pluginRow).toContainText('Service status: running')
    await expect(page.locator('.plugin-log-row', { hasText: 'Service started' })).toContainText('service:manual-companion')
    await pluginRow.getByRole('button', { name: 'Stop Manual Companion' }).click()
    await expect(page.locator('.status-line')).toContainText('Service 已停止')
    await expect(pluginRow).toContainText('Service status: stopped')
    await expect(page.locator('.plugin-log-row', { hasText: 'Service stopped' })).toContainText('service:manual-companion')
    await pluginRow.getByRole('button', { name: 'Manual Dashboard' }).click()
    await expect(page.locator('.status-line')).toContainText('Dashboard 已打开')
    await expect(page.locator('.plugin-log-row', { hasText: 'Dashboard opened' })).toContainText('dashboard:manual-dashboard')

    await page.reload()
    await page.getByRole('button', { name: 'Plugins' }).click()
    const reloadedPluginRow = page.locator('.plugin-row', { hasText: 'Demo Manual Review' })
    await expect(reloadedPluginRow).toContainText('openpet.demo.manual-review')
    await expect(reloadedPluginRow.locator('.plugin-health-policy').getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    await expect(reloadedPluginRow.locator('.plugin-health-policy').getByRole('combobox')).toHaveValue('60000')
    await expect(page.locator('.plugin-log-row', { hasText: 'Plugin installed' })).toContainText('openpet.demo.manual-review')
  })

  test('inspects GitHub repository plugins from the Plugins pane with the demo API', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Plugins' }).click()

    const repositoryInput = page.getByRole('textbox', { name: 'GitHub repository URL' })
    await repositoryInput.fill('https://github.com/openpet/demo-plugin')
    await page.getByRole('button', { name: 'Import from GitHub' }).click()

    const reviewPanel = page.locator('.plugin-review-panel', { hasText: 'Demo Manual Review' })
    await expect(reviewPanel).toContainText('安装 1.0.0')
    await expect(reviewPanel).toContainText('Unsigned plugin')
    await expect(reviewPanel).toContainText('命令：hello')

    await reviewPanel.getByRole('button', { name: '安装插件' }).click()

    await expect(page.locator('.status-line')).toContainText('插件已安装，默认保持停用')
    await expect(reviewPanel).toBeHidden()
    await expect(page.locator('.plugin-row', { hasText: 'Demo Manual Review' })).toContainText('openpet.demo.manual-review')
  })
})
