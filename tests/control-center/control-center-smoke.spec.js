const { test, expect } = require('@playwright/test')

const tabs = ['Pet', 'Actions', 'AI', 'Plugins', 'Catalog', 'Service', 'About']
const pageErrorsByPage = new WeakMap()

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const aiSection = (page, name) => (
  page.locator('details.ai-section').filter({
    has: page.locator('summary h2').filter({ hasText: new RegExp(`^${escapeRegExp(name)}$`) })
  })
)

const providerCard = (page, name) => (
  page.getByTestId(name === '图片 Provider' ? 'image-provider-card' : 'chat-provider-card')
)

const providerCardSummary = (section) => section.locator('.provider-capability-summary')
const providerHub = (page) => page.getByTestId('ai-provider-hub')
const providerDiagnosticsGroup = (page, name) => (
  providerHub(page).locator('.provider-diagnostics-group').filter({ hasText: new RegExp(`^${escapeRegExp(name)}`) })
)

const providerStatusItem = (section, label) => (
  section.locator('.provider-status-item').filter({ hasText: new RegExp(`^${escapeRegExp(label)}\\s*`) })
)

const providerHubStatusItem = (page, label) => (
  page.locator('.provider-hub-badges .provider-status-item').filter({ hasText: new RegExp(`^${escapeRegExp(label)}\\s*`) })
)

const providerDisclosure = (section, title) => (
  section.locator('details.provider-disclosure').filter({ hasText: new RegExp(`^${escapeRegExp(title)}`) })
)

const chatBaseUrlInput = (page) => page.getByLabel('聊天 Base URL')
const chatModelInput = (page) => page.getByLabel('聊天 Model')
const fieldRowForControl = (control) => (
  control.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " field-row ")][1]')
)
const chatApiKeyInput = (section) => section.getByLabel('聊天 API Key')
const getChatApiKeyRow = (section) => fieldRowForControl(chatApiKeyInput(section))
const imageApiKeyInput = (section) => section.getByLabel('图片 API Key')
const getImageApiKeyRow = (section) => fieldRowForControl(imageApiKeyInput(section))

const expandAiSection = async (page, name) => {
  if (name === '聊天 Provider' || name === '图片 Provider') {
    const providerSection = aiSection(page, '模型 Provider')
    await expect(providerSection).toHaveCount(1)
    if (await providerSection.getAttribute('open') === null) {
      await providerSection.locator('summary').click()
    }
    await expect(providerSection).toHaveAttribute('open', '')
    const card = providerCard(page, name)
    await expect(card).toHaveCount(1)
    if (await card.getAttribute('open') === null) {
      await providerCardSummary(card).click()
    }
    await expect(card).toHaveAttribute('open', '')
    return card
  }

  const section = aiSection(page, name)
  await expect(section).toHaveCount(1)
  if (await section.getAttribute('open') === null) {
    await section.locator('summary').click()
  }
  await expect(section).toHaveAttribute('open', '')
  return section
}

const openProviderDisclosure = async (section, title) => {
  if (title !== '高级 / 诊断') {
    const advancedDisclosure = providerDisclosure(section, '高级 / 诊断')
    if (await advancedDisclosure.count() && await advancedDisclosure.getAttribute('open') === null) {
      await advancedDisclosure.locator('summary').first().click()
    }
  }
  const disclosure = providerDisclosure(section, title)
  await expect(disclosure).toHaveCount(1)
  if (await disclosure.getAttribute('open') === null) {
    await disclosure.locator('summary').first().click()
  }
  await expect(disclosure).toHaveAttribute('open', '')
  return disclosure
}

const openPluginManagement = async (pluginRow) => {
  const disclosure = pluginRow.locator('details.plugin-management-disclosure')
  await expect(disclosure).toHaveCount(1)
  if (await disclosure.getAttribute('open') === null) {
    await disclosure.locator('summary').click()
  }
  await expect(disclosure).toHaveAttribute('open', '')
  return disclosure
}

const openPluginInstallDisclosure = async (page) => {
  const disclosure = page.locator('details.plugin-install-disclosure')
  await expect(disclosure).toHaveCount(1)
  if (await disclosure.getAttribute('open') === null) {
    await disclosure.locator('summary').click()
  }
  await expect(disclosure).toHaveAttribute('open', '')
  return disclosure
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
    await expect(page.getByText('OpenPet', { exact: true })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Control Center' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Pet' })).toBeVisible()

    const navigation = page.getByRole('navigation', { name: 'Control Center' })
    for (const tab of tabs) {
      await navigation.getByRole('button', { name: tab, exact: true }).click()
      await expect(page.getByRole('heading', { name: tab })).toBeVisible()
    }
  })

  test('keeps the AI settings page inside a narrow viewport without page-level right swipe', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 720 })
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()
    await expect(page.getByRole('heading', { name: 'AI' })).toBeVisible()

    const metrics = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      shellWidth: Math.ceil(document.querySelector('.shell')?.getBoundingClientRect().width || 0)
    }))

    expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth)
    expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth)
    expect(metrics.shellWidth).toBeLessThanOrEqual(metrics.viewportWidth)
  })

  test('keeps secondary AI settings collapsed until opened', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    const sectionHeadings = await page.locator('details.ai-section summary h2').allTextContents()
    expect(sectionHeadings).toEqual([
      '模型 Provider',
      'Hatch Pet Agent',
      '长期记忆',
      'Pet Persona Override',
      'Behavior',
      '聊天'
    ])

    const coreSections = ['模型 Provider', 'Hatch Pet Agent']
    const secondarySections = ['长期记忆', 'Pet Persona Override', 'Behavior', '聊天']

    for (const sectionName of coreSections) {
      const section = aiSection(page, sectionName)
      await expect(section).toHaveCount(1)
      await expect(section).toHaveAttribute('open', '')
    }

    for (const sectionName of secondarySections) {
      const section = aiSection(page, sectionName)
      await expect(section).toHaveCount(1)
      await expect(section).not.toHaveAttribute('open', '')
    }

    const memorySection = aiSection(page, '长期记忆')
    await expect(memorySection.locator('.field-label', { hasText: '当前宠物包' })).toBeHidden()
    await memorySection.locator('summary').click()
    await expect(memorySection).toHaveAttribute('open', '')
    await expect(memorySection.locator('.field-label', { hasText: '当前宠物包' })).toBeVisible()

    const personaSection = aiSection(page, 'Pet Persona Override')
    await expect(personaSection.getByLabel('Tone')).toBeHidden()
    await personaSection.locator('summary').click()
    await expect(personaSection.getByLabel('Tone')).toBeVisible()
  })

  test('shows host-owned trust copy for chat and image providers', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    await expandAiSection(page, '聊天 Provider')
    await openProviderDisclosure(providerHub(page), '查看聊天 Provider 边界')
    const chatBoundary = page.getByTestId('chat-provider-boundary')
    await expect(chatBoundary).toContainText('本地网关、代理服务和云端接口共用同一套 OpenAI-compatible 聊天 Provider 契约')
    await expect(chatBoundary).toContainText('“保存聊天 Provider”只写入当前配置')
    await expect(chatBoundary).toContainText('“测试已保存配置”只测试已保存的生效配置')
    await expect(chatBoundary).toContainText('API Key 只保存在 OpenPet host')

    await expandAiSection(page, '图片 Provider')
    await openProviderDisclosure(providerHub(page), '查看图片 Provider 边界')
    const imageBoundary = page.getByTestId('image-provider-boundary')
    await expect(imageBoundary).toContainText('本地网关、代理服务和云端接口共用同一套 OpenAI-compatible 图片 Provider 契约')
    await expect(imageBoundary).toContainText('“保存图片 Provider”只更新 host 配置')
    await expect(imageBoundary).toContainText('“检查图片健康”只检查当前已保存的图片 Provider')
    await expect(imageBoundary).toContainText('Creator Studio 只提交提示词和输出目录')
  })

  test('keeps one provider hub diagnostics section collapsed until opened', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    const hub = providerHub(page)
    const chatSection = providerCard(page, '聊天 Provider')
    const imageSection = providerCard(page, '图片 Provider')
    const advancedDiagnostics = providerDisclosure(hub, '高级 / 诊断')
    const presetDisclosure = providerDisclosure(hub, '显示常用聊天 Provider 预设')
    const advancedDisclosure = providerDisclosure(hub, '显示高级聊天配置')

    await expect(advancedDiagnostics).toHaveCount(1)
    await expect(advancedDiagnostics).not.toHaveAttribute('open', '')
    await expect(providerDisclosure(chatSection, '高级 / 诊断')).toHaveCount(0)
    await expect(providerDisclosure(imageSection, '高级 / 诊断')).toHaveCount(0)
    const diagnosticsHeadings = hub.locator('.provider-diagnostics-heading')
    await expect(diagnosticsHeadings).toHaveCount(2)
    await expect(diagnosticsHeadings.first()).toBeHidden()
    await expect(diagnosticsHeadings.nth(1)).toBeHidden()
    await expect(presetDisclosure).not.toHaveAttribute('open', '')
    await expect(advancedDisclosure).not.toHaveAttribute('open', '')
    await expect(hub.getByRole('button', { name: 'OpenAI 官方' })).toHaveCount(0)
    await expect(hub.getByLabel('System Prompt')).toBeHidden()

    await openProviderDisclosure(hub, '显示常用聊天 Provider 预设')
    await expect(hub.getByRole('button', { name: 'OpenAI 官方' })).toHaveCount(1)

    await openProviderDisclosure(hub, '显示高级聊天配置')
    await expect(hub.getByLabel('System Prompt')).toBeVisible()
  })

  test('supports collapsing and reopening chat and image provider panels', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    const chatSection = providerCard(page, '聊天 Provider')
    const imageSection = providerCard(page, '图片 Provider')

    await expect(chatSection).toHaveAttribute('open', '')
    await expect(imageSection).toHaveAttribute('open', '')

    await providerCardSummary(chatSection).click()
    await expect(chatSection).not.toHaveAttribute('open', '')
    await expect(chatSection.getByRole('button', { name: '保存聊天 Provider' })).toBeHidden()

    await providerCardSummary(chatSection).click()
    await expect(chatSection).toHaveAttribute('open', '')
    await expect(chatSection.getByRole('button', { name: '保存聊天 Provider' })).toBeVisible()
    await expect(chatSection.getByRole('button', { name: '保存聊天 Provider' })).toHaveText('保存')
    await expect(chatSection.getByRole('button', { name: '测试已保存配置' })).toHaveText('测试')
    await expect(chatSection.getByRole('button', { name: '刷新聊天模型' })).toHaveCount(1)
    await expect(chatSection.getByRole('button', { name: '刷新聊天模型' })).toHaveText('刷新模型')

    await providerCardSummary(imageSection).click()
    await expect(imageSection).not.toHaveAttribute('open', '')
    await expect(imageSection.getByRole('button', { name: '保存图片 Provider' })).toBeHidden()

    await providerCardSummary(imageSection).click()
    await expect(imageSection).toHaveAttribute('open', '')
    await expect(imageSection.getByRole('button', { name: '保存图片 Provider' })).toBeVisible()
    await expect(imageSection.getByRole('button', { name: '保存图片 Provider' })).toHaveText('保存')
    await expect(imageSection.getByRole('button', { name: '检查图片健康' })).toHaveText('健康检查')
    await expect(imageSection.getByRole('button', { name: '刷新图片模型' })).toHaveCount(1)
    await expect(imageSection.getByRole('button', { name: '刷新图片模型' })).toHaveText('刷新模型')
  })

  test('supports vision follow-chat and override flows inside provider hub diagnostics', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    await expandAiSection(page, '聊天 Provider')
    const hub = providerHub(page)
    await openProviderDisclosure(hub, 'Vision / 多模态文本模型')
    await expect(hub.getByTestId('vision-provider-follow-chat')).toContainText('Vision / 多模态文本任务默认复用聊天 Provider')

    await hub.getByLabel('Vision Provider Mode').selectOption('override')
    await expect(hub.getByLabel('Vision Base URL')).toHaveValue(/https?:\/\//)

    await hub.getByLabel('Vision Base URL').fill('https://vision.example.test/v1')
    await hub.getByLabel('Vision Model').fill('gpt-4.1-mini')
    await hub.getByLabel('Vision API Key').fill('sk-demo-vision')
    await hub.getByRole('button', { name: '保存 Vision 密钥' }).click()
    await expect(hub.getByTestId('vision-provider-status')).toContainText('Vision API Key 已保存')

    await hub.getByRole('button', { name: '刷新 Vision 模型' }).click()
    await expect(hub.getByTestId('vision-provider-status')).toContainText('Vision Provider')

    await page.getByRole('button', { name: '保存聊天 Provider' }).click()
    await expect(page.getByTestId('ai-provider-feedback')).toContainText('AI 配置已保存')
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
    await expect(page.getByRole('group', { name: '一级菜单位置' }).getByRole('button', { name: '上方' })).toHaveClass(/active/)

    await page.getByRole('button', { name: 'About' }).click()
    await page.getByRole('button', { name: '检查更新' }).click()
    await expect(page.locator('.readonly-row', { hasText: '更新状态' })).toContainText('Update feed is not configured.')
  })

  test('explains internal anchor preparation in the Create pane', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Create' }).click()

    await expect(page.getByRole('heading', { name: 'Create' })).toBeVisible()
    await expect(page.locator('.creator-pane')).toContainText('OpenPet 会在内部准备角色锚定视图和动作锚定视图')
    await expect(page.locator('.creator-pane')).toContainText('上传的图片仍是身份最高优先级')
  })

  test('blocks multi-view reference material in the demo Create flow with explicit guidance', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('openpet.controlCenter.demoState', JSON.stringify({
        creatorReferencePickerPath: '/demo/creator/全面.png'
      }))
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Create' }).click()
    await page.getByLabel('Character name').fill('Front Gate Cat')
    await page.getByTestId('creator-new-reference-input').click()
    await page.getByTestId('creator-generate-new-character').click()

    await expect(page.getByTestId('creator-status-line')).toContainText('单张干净正面图')
    await expect(page.getByTestId('creator-status-line')).toContainText('不要使用拼图、三视图或多视图合成图')
  })

  test('refreshes AI persona and memory sections when the active pet pack changes', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    const memorySection = page.locator('[data-testid="ai-memory-profile"]')
    const personaSection = await expandAiSection(page, 'Pet Persona Override')
    await expect(memorySection).toContainText('Legacy Cat · legacy-cat')
    await expect(personaSection).toContainText('当前激活宠物包：Legacy Cat · legacy-cat')

    await page.getByRole('button', { name: 'Actions' }).click()
    const citrusPackRow = page.locator('.pet-pack-row', { hasText: 'Citrus Cat' })
    await citrusPackRow.getByRole('button', { name: '启用' }).click()
    await expect(page.locator('.status-line')).toContainText('已启用 Citrus Cat')
    await page.getByRole('button', { name: 'AI' }).click()

    await expect(memorySection).toContainText('Citrus Cat · citrus-cat')
    await expect(personaSection).toContainText('当前激活宠物包：Citrus Cat · citrus-cat')
  })

  test('exports ai talk trace from the AI pane', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()
    const memorySection = await expandAiSection(page, '长期记忆')
    await memorySection.getByRole('button', { name: '导出 AI Talk Trace' }).click()
    await expect(page.locator('[data-testid="ai-status-line"]')).toContainText('AI Talk Trace 已导出')
  })

  test('shows ai talk trace summary in the AI pane', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    const summary = page.getByTestId('ai-trace-summary')
    await expect(summary).toContainText('Legacy Cat')
    await expect(summary).toContainText('openai-compatible')
    await expect(summary).toContainText('消息数')
    await expect(summary).toContainText('reply chars')
    await expect(summary).toContainText('流式摘要')
    await expect(summary).toContainText('mode standard')
    await expect(summary).toContainText('status unknown')
    await expect(summary).toContainText('latency n/a')
  })

  test('supports provider presets, model discovery, and image compatibility hints in the AI pane', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    const chatSection = await expandAiSection(page, '聊天 Provider')
    const hub = providerHub(page)
    await openProviderDisclosure(hub, '显示常用聊天 Provider 预设')
    await chatSection.getByLabel('聊天 API Key').fill('sk-demo-chat')
    await chatSection.getByRole('button', { name: '保存聊天密钥' }).click()
    await hub.getByRole('button', { name: '本地/代理 OpenAI-compatible' }).click()
    await expect(chatSection.getByLabel('聊天 Base URL')).toHaveValue('http://127.0.0.1:8317/v1')
    await expect(chatSection.getByLabel('聊天 Model')).toHaveValue('gpt-4o-mini')
    await chatSection.getByRole('button', { name: '保存聊天 Provider' }).click()
    await chatSection.getByRole('button', { name: '刷新聊天模型' }).click()
    await expect(chatSection.getByTestId('聊天 Model-status')).toBeVisible()
    await expect(chatSection.getByTestId('聊天 Model-status')).toContainText('已发现')
    await expect(hub.getByTestId('ai-chat-model-discovery')).toContainText('gpt-4o-mini')
    await expect(chatSection.getByText('当前来源：推荐模型')).toBeVisible()
    await expect(chatSection.getByTestId('聊天 Model-sources')).toBeHidden()
    await chatSection.getByRole('button', { name: /查看模型列表/ }).click()
    await expect(chatSection.getByTestId('聊天 Model-sources')).toBeVisible()
    await chatSection.getByTestId('聊天 Model-sources').getByRole('button', { name: 'gpt-4o-mini' }).click()
    await expect(chatSection.getByLabel('聊天 Model')).toHaveValue('gpt-4o-mini')
    await chatSection.getByLabel('聊天 Model').fill('custom-chat-model')
    await expect(chatSection.getByText('当前来源：手动输入')).toBeVisible()

    const imageSection = await expandAiSection(page, '图片 Provider')
    await openProviderDisclosure(hub, '显示常用图片 Provider 预设')
    await imageSection.getByLabel('图片 API Key').fill('sk-demo-image')
    await imageSection.getByRole('button', { name: '保存图片密钥' }).click()
    await imageSection.getByRole('button', { name: '刷新图片模型' }).click()
    await expect(imageSection.getByTestId('图片 Model-status')).toBeVisible()
    await expect(imageSection.getByTestId('图片 Model-status')).toContainText('已发现')
    await expect(hub.getByTestId('ai-image-model-discovery')).toContainText('gpt-image-2')
    await expect(imageSection.getByText('当前来源：推荐模型')).toBeVisible()
    await expect(imageSection.getByTestId('图片 Model-sources')).toBeHidden()
    await imageSection.getByRole('button', { name: /查看模型列表/ }).click()
    await expect(imageSection.getByTestId('图片 Model-sources')).toBeVisible()
    await imageSection.getByTestId('图片 Model-sources').getByRole('button', { name: 'gpt-image-2' }).click()
    await expect(imageSection.getByLabel('图片 Model')).toHaveValue('gpt-image-2')
    await expect(hub.getByTestId('ai-image-compatibility-hint')).toContainText('gpt-image-2')
    await expect(hub.getByTestId('ai-image-compatibility-hint')).toContainText('transparent')
    await imageSection.getByLabel('图片 Model').fill('custom-image-model')
    await expect(imageSection.getByText('当前来源：手动输入')).toBeVisible()
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

  test('creates host-owned trigger rules from the Actions review UI', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Actions' }).click()

    await page.getByRole('button', { name: /Sleep/ }).click()
    const clickAction = page.locator('.readonly-row', { hasText: '点击动作' }).locator('select')
    const beforeClickAction = await clickAction.inputValue()
    const reviewCard = page.locator('[aria-label="触发建议审阅"]')

    await reviewCard.locator('select').selectOption('state')
    await expect(reviewCard).toContainText('本轮保存最小规则')
    await expect(reviewCard).toContainText('应用前预览')
    await expect(reviewCard).toContainText('will_create_rule')
    await page.getByRole('button', { name: '创建状态规则' }).click()

    await expect(page.locator('.status-line')).toContainText('已确认 触发建议')
    await expect(reviewCard).toContainText('最近结果：已确认')
    await expect(reviewCard).toContainText('结果码：rule_created')
    const rulesPanel = page.locator('[aria-label="触发规则"]')
    await expect(rulesPanel).toContainText('Sleep')
    await expect(rulesPanel).toContainText('state')
    await expect(rulesPanel).toContainText('意图')
    await expect(rulesPanel).toContainText('状态条件')
    await expect(rulesPanel).toContainText('host.state.available')
    await expect(clickAction).toHaveValue(beforeClickAction)
  })

  test('manages host-owned trigger rules from the Actions UI', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('openpet.controlCenter.demoState', JSON.stringify({
        actionsConfig: {
          defaultAction: 'idle',
          clickAction: 'wave',
          actions: [
            { id: 'idle', label: 'Idle', kind: 'idle', loop: true, frameCount: 1, frameMs: 120, frameWidth: 8, frameHeight: 8 },
            { id: 'wave', label: 'Wave', kind: 'click', loop: false, frameCount: 1, frameMs: 100, frameWidth: 8, frameHeight: 8 },
            { id: 'sleep', label: 'Sleep', kind: 'idle', loop: true, frameCount: 1, frameMs: 140, frameWidth: 8, frameHeight: 8 }
          ],
          triggerProposalInbox: [],
          triggerRules: [
            {
              id: 'rule:state:sleep:test',
              actionId: 'sleep',
              type: 'state',
              status: 'active',
              sourceProposalId: 'proposal:state:sleep:test',
              sourcePluginId: 'openpet.creator-studio',
              sourceRunId: 'run-demo-state',
              sourceCommandId: 'import-approved-action',
              message: 'Use Sleep when the pet enters idle focus mode.',
              preview: 'State trigger rule can play sleep when a host state condition matches.',
              ruleSpec: {
                schemaVersion: 1,
                type: 'state',
                summary: 'Use Sleep when idle focus mode is detected.',
                state: { predicate: 'pet.idle && focus.mode', source: 'creator-studio' }
              },
              createdAt: '2026-06-24T08:00:00.000Z',
              updatedAt: '2026-06-24T08:00:00.000Z'
            }
          ]
        }
      }))
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Actions' }).click()

    const rulesPanel = page.locator('[aria-label="触发规则"]')
    const sleepRule = rulesPanel.locator('.trigger-inbox-item', { hasText: 'Sleep' })
    await expect(sleepRule).toContainText('active')
    await expect(sleepRule).toContainText('Use Sleep when idle focus mode is detected.')
    await expect(sleepRule).toContainText('状态条件')
    await expect(sleepRule).toContainText('pet.idle && focus.mode')
    await expect(sleepRule).toContainText('状态来源')
    await expect(sleepRule).toContainText('creator-studio')

    await sleepRule.getByRole('button', { name: '停用规则' }).click()
    await expect(page.locator('.status-line')).toContainText('已停用触发规则：rule:state:sleep:test')
    await expect(sleepRule).toContainText('disabled')

    await sleepRule.getByRole('button', { name: '启用规则' }).click()
    await expect(page.locator('.status-line')).toContainText('已启用触发规则：rule:state:sleep:test')
    await expect(sleepRule).toContainText('active')

    page.once('dialog', (dialog) => dialog.accept())
    await sleepRule.getByRole('button', { name: '删除规则' }).click()
    await expect(page.locator('.status-line')).toContainText('已删除触发规则：rule:state:sleep:test')
    await expect(rulesPanel).toContainText('暂无非点击触发规则')
  })

  test('edits host-owned state trigger rules from the Actions UI', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('openpet.controlCenter.demoState', JSON.stringify({
        actionsConfig: {
          defaultAction: 'idle',
          clickAction: 'wave',
          actions: [
            { id: 'idle', label: 'Idle', kind: 'idle', loop: true, frameCount: 1, frameMs: 120, frameWidth: 8, frameHeight: 8 },
            { id: 'wave', label: 'Wave', kind: 'click', loop: false, frameCount: 1, frameMs: 100, frameWidth: 8, frameHeight: 8 },
            { id: 'sleep', label: 'Sleep', kind: 'idle', loop: true, frameCount: 1, frameMs: 140, frameWidth: 8, frameHeight: 8 }
          ],
          triggerProposalInbox: [],
          triggerRules: [
            {
              id: 'rule:state:sleep:test',
              actionId: 'sleep',
              type: 'state',
              status: 'active',
              sourceProposalId: 'proposal:state:sleep:test',
              sourcePluginId: 'openpet.creator-studio',
              sourceRunId: 'run-demo-state',
              sourceCommandId: 'import-approved-action',
              message: 'Use Sleep when the pet enters idle focus mode.',
              preview: 'State trigger rule can play sleep when a host state condition matches.',
              ruleSpec: {
                schemaVersion: 1,
                type: 'state',
                summary: 'Use Sleep when idle focus mode is detected.',
                state: { predicate: 'pet.idle && focus.mode', source: 'creator-studio' }
              },
              createdAt: '2026-06-24T08:00:00.000Z',
              updatedAt: '2026-06-24T08:00:00.000Z'
            }
          ]
        }
      }))
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Actions' }).click()

    const sleepRule = page.locator('[aria-label="触发规则"]').locator('.trigger-inbox-item', { hasText: 'Sleep' })
    await sleepRule.getByRole('button', { name: '编辑规则' }).click()

    await sleepRule.getByLabel('规则摘要').fill('Use Sleep while the pet is in focus idle mode.')
    await sleepRule.getByLabel('状态条件').fill('pet.idle && focus.mode === "idle"')
    await sleepRule.getByLabel('状态来源').fill('host')
    await sleepRule.getByRole('button', { name: '保存规则' }).click()

    await expect(page.locator('.status-line')).toContainText('已保存触发规则：rule:state:sleep:test')
    await expect(sleepRule).toContainText('Use Sleep while the pet is in focus idle mode.')
    await expect(sleepRule).toContainText('pet.idle && focus.mode === "idle"')
    await expect(sleepRule).toContainText('host')
  })

  test('reviews queued trigger proposals from the Actions inbox', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('openpet.controlCenter.demoState', JSON.stringify({
        actionsConfig: {
          defaultAction: 'idle',
          clickAction: 'wave',
          actions: [
            { id: 'idle', label: 'Idle', kind: 'idle', loop: true, frameCount: 1, frameMs: 120, frameWidth: 8, frameHeight: 8 },
            { id: 'wave', label: 'Wave', kind: 'click', loop: false, frameCount: 1, frameMs: 100, frameWidth: 8, frameHeight: 8 },
            { id: 'sleep', label: 'Sleep', kind: 'idle', loop: true, frameCount: 1, frameMs: 140, frameWidth: 8, frameHeight: 8 }
          ],
          triggerRules: [],
          triggerProposalInbox: [
            {
              id: 'proposal:state:sleep:test',
              actionId: 'sleep',
              type: 'state',
              binding: '',
              sourcePluginId: 'openpet.creator-studio',
              sourceRunId: 'run-demo-state',
              sourceCommandId: 'import-approved-action',
              message: 'Use Sleep when the pet enters idle focus mode.',
              status: 'pending',
              preview: 'State trigger rule can play sleep when a host state condition matches.',
              ruleSpec: {
                schemaVersion: 1,
                type: 'state',
                summary: 'Use Sleep when idle focus mode is detected.',
                state: { predicate: 'pet.idle && focus.mode', source: 'creator-studio' }
              },
              resultCode: '',
              resultMessage: '',
              rejectionReason: '',
              createdAt: '2026-06-24T08:00:00.000Z',
              updatedAt: '2026-06-24T08:00:00.000Z',
              acceptedAt: '',
              rejectedAt: ''
            },
            {
              id: 'proposal:click:wave:test',
              actionId: 'wave',
              type: 'click',
              binding: 'clickAction',
              sourcePluginId: 'openpet.creator-studio',
              sourceRunId: 'run-demo-click',
              sourceCommandId: 'import-approved-action',
              message: 'Keep Wave as a click action candidate.',
              status: 'pending',
              preview: '',
              resultCode: '',
              resultMessage: '',
              rejectionReason: '',
              createdAt: '2026-06-24T08:01:00.000Z',
              updatedAt: '2026-06-24T08:01:00.000Z',
              acceptedAt: '',
              rejectedAt: ''
            }
          ]
        }
      }))
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Actions' }).click()

    const inbox = page.locator('[aria-label="触发提案 Inbox"]')
    await expect(inbox).toContainText('2 条待审核')
    const sleepProposal = inbox.locator('.trigger-inbox-item', { hasText: 'Sleep' })
    await expect(sleepProposal).toContainText('待审核')
    await expect(sleepProposal).toContainText('State trigger rule can play sleep')
    await expect(sleepProposal).toContainText('Use Sleep when idle focus mode is detected.')
    await expect(sleepProposal).toContainText('pet.idle && focus.mode')
    await sleepProposal.getByRole('button', { name: '接受提案' }).click()
    await expect(page.locator('.status-line')).toContainText('已接受触发提案：sleep')
    await expect(sleepProposal).toContainText('已接受')
    await expect(sleepProposal).toContainText('rule_created')
    const rulesPanel = page.locator('[aria-label="触发规则"]')
    await expect(rulesPanel).toContainText('Sleep')
    await expect(rulesPanel).toContainText('state')
    await expect(rulesPanel).toContainText('Use Sleep when idle focus mode is detected.')
    await expect(rulesPanel).toContainText('pet.idle && focus.mode')

    const waveProposal = inbox.locator('.trigger-inbox-item', { hasText: 'Wave' })
    page.once('dialog', (dialog) => dialog.accept('Not for this pack'))
    await waveProposal.getByRole('button', { name: '拒绝' }).click()
    await expect(page.locator('.status-line')).toContainText('已拒绝触发提案：wave')
    await expect(waveProposal).toContainText('已拒绝')
    await expect(waveProposal).toContainText('Not for this pack')
    await expect(inbox).toContainText('0 条待审核')
  })

  test('shows trigger runtime diagnostics in the Actions pane', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('openpet.controlCenter.demoState', JSON.stringify({
        actionsConfig: {
          defaultAction: 'idle',
          clickAction: 'wave',
          triggerRules: [
            {
              id: 'rule:event:wave:1',
              type: 'event',
              actionId: 'wave',
              enabled: true,
              binding: 'plugin:event',
              intervalMs: 0,
              notes: 'Demo event rule',
              sourcePluginId: 'openpet.creator-studio',
              sourceRunId: '',
              sourceCommandId: '',
              createdAt: '2026-06-29T08:00:00.000Z',
              updatedAt: '2026-06-29T08:00:00.000Z'
            }
          ],
          actions: [
            { id: 'idle', label: 'Idle', kind: 'idle', loop: true, frameCount: 1, frameMs: 120, frameWidth: 8, frameHeight: 8 },
            { id: 'wave', label: 'Wave', kind: 'click', loop: false, frameCount: 1, frameMs: 100, frameWidth: 8, frameHeight: 8 },
            { id: 'sleep', label: 'Sleep', kind: 'idle', loop: true, frameCount: 1, frameMs: 140, frameWidth: 8, frameHeight: 8 }
          ],
          triggerProposalInbox: [],
          triggerRuntimeDiagnostics: {
            currentState: { actionId: 'idle' },
            decisions: [
              {
                ruleId: 'rule:event:wave:1',
                triggerType: 'event',
                outcome: 'matched',
                reason: 'rule matched',
                actionId: 'wave',
                binding: 'plugin:event',
                source: 'plugin:test'
              },
              {
                ruleId: 'rule:state:sleep:1',
                triggerType: 'state',
                outcome: 'skipped',
                reason: 'binding mismatch',
                actionId: 'sleep',
                binding: 'working',
                source: 'idle'
              },
              {
                ruleId: 'rule:event:missing:1',
                triggerType: 'event',
                outcome: 'blocked',
                reason: 'action is unavailable',
                actionId: 'missing',
                binding: 'plugin:event',
                source: 'plugin:test'
              }
            ]
          }
        }
      }))
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Actions' }).click()

    const diagnostics = page.locator('[aria-label="触发规则运行时诊断"]')
    await expect(diagnostics).toContainText('当前动作：idle')
    await expect(diagnostics).toContainText('最近 3 条')
    await expect(diagnostics).toContainText('matched 1')
    await expect(diagnostics).toContainText('skipped 1')
    await expect(diagnostics).toContainText('blocked 1')
    await expect(diagnostics).toContainText('rule:event:wave:1')
    await expect(diagnostics).toContainText('plugin:event')
    await expect(diagnostics).toContainText('action is unavailable')
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
    await page.getByRole('switch', { name: 'Enable pet bubble chat popup' }).click()
    await page.getByRole('button', { name: '保存', exact: true }).click()

    await expect(page.locator('.status-line')).toContainText('原始大小 135%')
    await page.getByRole('button', { name: '还原' }).click()
    await expect(scale).toHaveValue('135')
    await expect(page.getByRole('group', { name: '散步速度' }).getByRole('button', { name: '快' })).toHaveClass(/active/)
    await expect(page.getByRole('group', { name: '一级菜单位置' }).getByRole('button', { name: '左侧' })).toHaveClass(/active/)
    await expect(page.getByRole('switch', { name: 'Enable pet bubble chat popup' })).toHaveAttribute('aria-checked', 'false')
  })

  test('configures a custom pet hover cursor in the simplified cursor picker', async ({ page }) => {
    await page.goto('/')

    const cursorHeader = page.locator('.cursor-selection-header')
    const cursorOptionsRow = page.locator('.cursor-options-row')
    const cursorOptionCards = page.locator('.cursor-option-card')
    const cursorSizePanel = page.locator('.cursor-size-panel')

    await expect(cursorHeader).toContainText('指针选择')
    await expect(cursorHeader).toContainText('预览会模拟真实指针落点')
    await expect(cursorOptionsRow).toBeVisible()
    await expect(cursorOptionCards).toHaveCount(7)
    await expect(page.locator('.cursor-management-panel')).toHaveCount(0)
    await expect(page.locator('.cursor-library-row')).toHaveCount(0)
    await expect(page.getByText('指针库状态')).toHaveCount(0)
    await expect(cursorOptionCards.first()).toHaveCSS('width', '72px')
    await expect(cursorOptionCards.last()).toHaveCSS('width', '72px')
    await expect(cursorOptionCards.first().locator('.cursor-card-preview')).toHaveCSS('min-height', '43px')
    await expect(cursorOptionCards.first().locator('img')).toHaveCSS('width', '46px')
    await expect(page.getByRole('button', { name: '系统默认' })).toHaveCount(0)
    await expect(page.getByRole('switch', { name: 'Apply cursor to the whole computer' })).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByRole('switch', { name: 'Apply cursor to the whole computer' })).toBeDisabled()
    await expect(page.getByText('仅 OpenPet', { exact: true })).toBeVisible()
    await expect(page.getByText('开启后会在 macOS 全电脑范围显示当前指针；关闭后只影响宠物交互区域。')).toBeVisible()
    await expect(cursorSizePanel).toBeVisible()
    await expect(cursorSizePanel).toContainText('当前指针大小')
    await expect(cursorSizePanel).toContainText('先在上方选择一个指针')
    await expect(page.getByRole('button', { name: /^删除指针/ })).toHaveCount(0)

    await page.getByRole('button', { name: '添加自定义' }).click()
    await expect(cursorOptionCards).toHaveCount(8)
    await expect(page.locator('.cursor-option-card.selected')).toContainText('demo-cursor')
    await expect(cursorSizePanel).toContainText('demo-cursor')
    await expect(cursorSizePanel).toContainText('100%')
    await expect(cursorSizePanel).toContainText('32×32')
    await expect(cursorSizePanel.locator('.cursor-size-summary')).toHaveCount(1)
    await expect(cursorSizePanel.locator('.cursor-size-identity')).toContainText('demo-cursor')
    await expect(cursorSizePanel.locator('.cursor-size-identity')).toContainText('32×32')
    await expect(cursorSizePanel.locator('.cursor-size-actions')).toContainText('100%')
    await expect(cursorSizePanel.locator('.cursor-size-range-labels')).toContainText('50%')
    await expect(cursorSizePanel.locator('.cursor-size-range-labels')).toContainText('200%')
    await expect(cursorSizePanel.locator('.cursor-size-header')).toHaveCount(0)
    await expect(cursorSizePanel.locator('.cursor-size-meta')).toHaveCount(0)
    await expect(cursorSizePanel).toHaveCSS('padding', '12px')
    await expect(cursorSizePanel).toHaveCSS('gap', '10px')
    await expect(page.getByRole('button', { name: '删除指针 demo-cursor' })).toBeVisible()
    await expect(page.locator('.cursor-card-delete')).toHaveCount(1)
    await expect(page.getByRole('switch', { name: 'Apply cursor to the whole computer' })).toBeEnabled()

    await page.getByText('应用到整个电脑', { exact: true }).click()
    await expect(page.getByRole('switch', { name: 'Apply cursor to the whole computer' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('.cursor-scope-feedback')).toContainText('已将自定义指针应用到整个电脑')
    await expect(page.locator('.status-line')).toContainText('已将自定义指针应用到整个电脑')

    await page.reload()
    await expect(page.getByRole('switch', { name: 'Apply cursor to the whole computer' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('.cursor-option-card.selected')).toContainText('demo-cursor')
    await page.getByRole('switch', { name: 'Apply cursor to the whole computer' }).click()
    await expect(page.getByRole('switch', { name: 'Apply cursor to the whole computer' })).toHaveAttribute('aria-checked', 'false')
    await expect(page.locator('.status-line')).toContainText('已设置为仅 OpenPet 使用自定义指针')

    const sizeSlider = page.getByRole('slider', { name: '当前指针大小' })
    await sizeSlider.evaluate((input) => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      valueSetter.call(input, '150')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      input.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    })
    await expect(cursorSizePanel).toContainText('150%')
    await expect(cursorSizePanel).toContainText('48×48')
    await expect(page.locator('.status-line')).toContainText('已将 demo-cursor 调整为 150%')
  })

  test('deletes an uploaded custom cursor from the cursor picker and falls back to the system default state', async ({ page }) => {
    await page.addInitScript(() => {
      const messages = []
      window.__cursorConfirmMessages = messages
      window.confirm = (message) => {
        messages.push(String(message || ''))
        return true
      }
    })

    await page.goto('/')

    await page.getByRole('button', { name: '添加自定义' }).click()
    await expect(page.locator('.cursor-option-card.selected')).toContainText('demo-cursor')
    await expect(page.getByRole('button', { name: '删除指针 demo-cursor' })).toBeVisible()

    await page.getByRole('button', { name: '删除指针 demo-cursor' }).click()

    await expect(page.getByRole('button', { name: '删除指针 demo-cursor' })).toHaveCount(0)
    await expect(page.locator('.cursor-option-card.selected')).toHaveCount(0)
    await expect(page.locator('.status-line')).toContainText('已删除指针：demo-cursor，并切换为系统默认')
    await expect(page.locator('.cursor-size-panel')).toContainText('先在上方选择一个指针')
    await expect(page.locator('.cursor-option-card')).toHaveCount(7)
    await expect(page.locator('.cursor-card-delete')).toHaveCount(0)

    const seenConfirmMessages = await page.evaluate(() => window.__cursorConfirmMessages || [])
    expect(seenConfirmMessages[0]).toContain('确认删除指针“demo-cursor”？')
  })

  test('keeps built-in cursor cards visible and non-deletable without the management panel', async ({ page }) => {
    await page.addInitScript(() => {
      window.confirm = (message) => {
        window.__unexpectedBuiltinConfirmMessage = String(message || '')
        return true
      }
    })

    await page.goto('/')

    const builtinCard = page.locator('.cursor-option-card').filter({ hasText: '爪爪紫' }).first()
    await expect(builtinCard).toBeVisible()
    await expect(page.getByRole('button', { name: '删除指针 爪爪紫' })).toHaveCount(0)
    await expect(page.locator('.cursor-card-delete')).toHaveCount(0)
    await expect(page.locator('.cursor-management-panel')).toHaveCount(0)
    await builtinCard.click()
    await expect(page.locator('.cursor-option-card').filter({ hasText: '爪爪紫' })).toHaveCount(1)
    await expect(page.locator('.cursor-option-card.selected')).toContainText('爪爪紫')
    await expect(page.getByRole('button', { name: '恢复默认大小' })).toHaveCount(0)
    await page.getByText('应用到整个电脑', { exact: true }).click()
    await expect(page.getByRole('switch', { name: 'Apply cursor to the whole computer' })).toHaveAttribute('aria-checked', 'true')

    const sizeSlider = page.getByRole('slider', { name: '当前指针大小' })
    await sizeSlider.evaluate((input) => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      valueSetter.call(input, '150')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      input.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    })
    await expect(page.locator('.cursor-size-panel')).toContainText('150%')
    const resetSizeButton = page.getByRole('button', { name: '恢复默认大小' })
    await expect(resetSizeButton).toBeVisible()
    await expect(page.locator('.cursor-size-actions').getByRole('button', { name: '恢复默认大小' })).toBeVisible()
    await page.getByRole('button', { name: '恢复默认大小' }).click()
    await expect(page.locator('.cursor-size-panel')).toContainText('100%')
    await expect(page.locator('.cursor-size-panel')).toContainText('48×48')
    await expect(page.getByRole('button', { name: '恢复默认大小' })).toHaveCount(0)
    await expect(page.locator('.status-line')).toContainText('已恢复 爪爪紫 的默认大小')
    await expect(page.getByRole('switch', { name: 'Apply cursor to the whole computer' })).toHaveAttribute('aria-checked', 'true')

    const unexpectedConfirm = await page.evaluate(() => window.__unexpectedBuiltinConfirmMessage || '')
    expect(unexpectedConfirm).toBe('')
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

  test('Home and activity range controls enable their movement prerequisites from the default state', async ({ page }) => {
    await page.goto('/')

    const grounded = page.getByRole('switch', { name: 'Enable grounded mode' })
    const home = page.getByRole('switch', { name: 'Enable home anchor' })
    const largeRadius = page.getByRole('group', { name: '活动范围' }).getByRole('button', { name: '大' })

    await expect(grounded).toHaveAttribute('aria-checked', 'false')
    await expect(home).toHaveAttribute('aria-checked', 'false')
    await expect(home).toBeEnabled()
    await home.click()
    await expect(grounded).toHaveAttribute('aria-checked', 'true')
    await expect(home).toHaveAttribute('aria-checked', 'true')

    await page.getByRole('switch', { name: 'Enable grounded mode' }).click()
    await expect(grounded).toHaveAttribute('aria-checked', 'false')
    await expect(home).toHaveAttribute('aria-checked', 'false')
    await expect(largeRadius).toBeEnabled()
    await largeRadius.click()
    await expect(grounded).toHaveAttribute('aria-checked', 'true')
    await expect(home).toHaveAttribute('aria-checked', 'true')
    await expect(largeRadius).toHaveClass(/active/)

    await page.getByRole('button', { name: '保存', exact: true }).click()
    await page.reload()
    await expect(page.getByRole('switch', { name: 'Enable grounded mode' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('switch', { name: 'Enable home anchor' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('group', { name: '活动范围' }).getByRole('button', { name: '大' })).toHaveClass(/active/)
  })

  test('turning grounded off clears home in the demo API session', async ({ page }) => {
    await page.goto('/')

    const grounded = page.getByRole('switch', { name: 'Enable grounded mode' })
    const home = page.getByRole('switch', { name: 'Enable home anchor' })

    await grounded.click()
    await home.click()
    await grounded.click()

    await expect(home).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByRole('group', { name: '活动范围' }).getByRole('button', { name: '中' })).toHaveClass(/active/)
  })

  test('persists AI config and clears API key drafts with the demo API', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()
    const chatProviderSection = await expandAiSection(page, '聊天 Provider')
    const hub = providerHub(page)
    const chatDiagnostics = providerDiagnosticsGroup(page, '聊天 Provider')
    await openProviderDisclosure(hub, '显示高级聊天配置')

    const chatDraftStatusRow = providerStatusItem(chatDiagnostics, '草稿状态')
    await expect(page.getByTestId('ai-provider-active-summary')).toContainText('api.openai.com')
    await expect(chatDiagnostics).toContainText('当前生效配置')
    await expect(page.getByTestId('ai-provider-active-summary')).toContainText('gpt-4o-mini')
    await expect(chatDraftStatusRow).toContainText('当前没有未保存修改')
    await chatBaseUrlInput(page).fill('https://user:pass@ai.example.test/v1?token=secret')
    await expect(page.getByTestId('ai-provider-validation-error')).toContainText('Base URL 不能包含用户名或密码')
    await expect(chatProviderSection.getByRole('button', { name: '保存聊天 Provider' })).toBeDisabled()

    await chatBaseUrlInput(page).fill('https://ai.example.test/v1')
    await chatModelInput(page).fill('openpet-test-model')
    await page.getByLabel('System Prompt').fill('Stay tiny, helpful, and local-first.')
    await page.getByRole('switch', { name: 'Enable AI memory' }).click()
    await expect(page.getByTestId('ai-provider-dirty-warning')).toContainText('未保存修改')
    await expect(page.getByTestId('ai-provider-dirty-warning')).toContainText('Base URL / Model / System Prompt / 长期记忆')
    await expect(chatProviderSection.getByRole('button', { name: '保存并测试聊天 Provider' })).toHaveCount(0)

    const apiKeyRow = getChatApiKeyRow(chatProviderSection)
    const apiKeyInput = page.getByPlaceholder('输入 API Key')
    await apiKeyInput.fill('   ')
    await expect(apiKeyRow.getByRole('button', { name: '保存聊天密钥' })).toBeDisabled()

    await chatProviderSection.getByRole('button', { name: '测试已保存配置' }).click()
    await expect(page.getByTestId('ai-provider-feedback')).toContainText('当前存在未保存修改')
    await expect(page.getByTestId('ai-connection-result')).toContainText('gpt-4o-mini')
    await expect(page.getByTestId('ai-provider-active-summary')).not.toContainText('ai.example.test')

    await chatProviderSection.getByRole('button', { name: '保存聊天 Provider' }).click()
    await expect(page.getByTestId('ai-provider-feedback')).toContainText('AI 配置已保存：Base URL / Model / System Prompt / 长期记忆')
    await expect(page.getByTestId('ai-provider-active-summary')).toContainText('ai.example.test')
    await expect(page.getByTestId('ai-provider-active-summary')).toContainText('openpet-test-model')
    await expect(chatDraftStatusRow).toContainText('当前没有未保存修改')

    await apiKeyInput.fill('   ')
    await expect(apiKeyRow.getByRole('button', { name: '保存聊天密钥' })).toBeDisabled()

    await apiKeyInput.fill('sk-demo-secret')
    await apiKeyRow.getByRole('button', { name: '保存聊天密钥' }).click()
    await expect(page.getByTestId('ai-provider-feedback')).toContainText('API Key 已保存')
    await expect(apiKeyRow).toContainText('已保存')

    await chatProviderSection.getByRole('button', { name: '测试已保存配置' }).click()
    await expect(page.getByTestId('ai-provider-feedback')).toContainText('聊天 Provider 可达')
    await expect(page.getByTestId('ai-connection-result')).toContainText('连接测试通过')
    await expect(page.getByTestId('ai-connection-result')).toContainText('openpet-test-model')

    await page.reload()
    await page.getByRole('button', { name: 'AI' }).click()
    const reloadedChatProviderSection = await expandAiSection(page, '聊天 Provider')
    await openProviderDisclosure(providerHub(page), '显示高级聊天配置')
    await expect(chatBaseUrlInput(page)).toHaveValue('https://ai.example.test/v1')
    await expect(chatModelInput(page)).toHaveValue('openpet-test-model')
    await expect(page.getByLabel('System Prompt')).toHaveValue('Stay tiny, helpful, and local-first.')
    await expect(page.getByRole('switch', { name: 'Enable AI memory' })).toHaveAttribute('aria-checked', 'true')
    await expect(getChatApiKeyRow(reloadedChatProviderSection)).toContainText('已保存')
  })

  test('AI provider save and test stay separate in the demo API', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()
    const chatProviderSection = await expandAiSection(page, '聊天 Provider')
    const chatApiKeyFieldRow = getChatApiKeyRow(chatProviderSection)

    await chatBaseUrlInput(page).fill('https://combo.example.test/v1')
    await chatModelInput(page).fill('combo-test-model')
    await chatApiKeyFieldRow.getByPlaceholder('输入 API Key').fill('sk-combo-secret')

    await chatProviderSection.getByRole('button', { name: '测试已保存配置' }).click()
    await expect(page.getByTestId('ai-provider-feedback')).not.toContainText('combo-test-model')
    await expect(page.getByTestId('ai-provider-active-summary')).not.toContainText('combo.example.test')

    await chatProviderSection.getByRole('button', { name: '保存聊天 Provider' }).click()
    await chatApiKeyFieldRow.getByRole('button', { name: '保存聊天密钥' }).click()
    await chatProviderSection.getByRole('button', { name: '测试已保存配置' }).click()

    await expect(page.getByTestId('ai-provider-active-summary')).toContainText('combo.example.test')
    await expect(page.getByTestId('ai-provider-active-summary')).toContainText('combo-test-model')
    await expect(page.getByTestId('ai-connection-result')).toContainText('Provider: openai-compatible')
    await expect(page.getByTestId('ai-connection-result')).toContainText('Base URL: https://combo.example.test/v1')
    await expect(page.getByTestId('ai-connection-result')).toContainText('Model: combo-test-model')
    await expect(chatApiKeyFieldRow).toContainText('已保存')
  })

  test('applies chat provider presets without touching the API key draft', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()
    const chatProviderSection = await expandAiSection(page, '聊天 Provider')
    const hub = providerHub(page)
    const chatDiagnostics = providerDiagnosticsGroup(page, '聊天 Provider')
    const chatApiKeyFieldRow = getChatApiKeyRow(chatProviderSection)
    await openProviderDisclosure(hub, '显示常用聊天 Provider 预设')

    await expect(chatDiagnostics.getByRole('button', { name: 'OpenAI 官方' })).toHaveCount(1)
    await expect(chatDiagnostics.getByRole('button', { name: 'LM Studio' })).toHaveCount(1)
    await expect(chatDiagnostics.getByRole('button', { name: 'vLLM' })).toHaveCount(1)
    await expect(chatDiagnostics.getByRole('button', { name: 'OpenRouter' })).toHaveCount(1)
    await expect(chatDiagnostics.getByRole('button', { name: 'Together' })).toHaveCount(1)
    await expect(chatDiagnostics.getByText('除 OpenPet 8317 外，预设只是 endpoint 模板，需要保存后测试确认。')).toBeVisible()
    await expect(chatDiagnostics.getByRole('button', { name: 'OpenRouter' })).toContainText('endpoint 模板')
    await expect(chatDiagnostics.getByRole('button', { name: 'OpenRouter' })).toContainText('未包含当前 OpenPet smoke 证据')
    await chatBaseUrlInput(page).fill('https://dirty.example.test/v1')
    await chatModelInput(page).fill('dirty-model')
    await chatApiKeyFieldRow.getByPlaceholder('输入 API Key').fill('sk-dirty-secret')

    await chatDiagnostics.getByRole('button', { name: 'LM Studio' }).click()
    await expect(chatBaseUrlInput(page)).toHaveValue('http://127.0.0.1:1234/v1')
    await expect(chatModelInput(page)).toHaveValue('dirty-model')
    await expect(chatApiKeyFieldRow.getByPlaceholder('输入 API Key')).toHaveValue('sk-dirty-secret')

    await chatDiagnostics.getByRole('button', { name: 'OpenRouter' }).click()
    await expect(chatBaseUrlInput(page)).toHaveValue('https://openrouter.ai/api/v1')
    await expect(chatModelInput(page)).toHaveValue('dirty-model')
    await expect(chatApiKeyFieldRow.getByPlaceholder('输入 API Key')).toHaveValue('sk-dirty-secret')

    await chatDiagnostics.getByRole('button', { name: 'OpenAI 官方' }).click()

    await expect(chatBaseUrlInput(page)).toHaveValue('https://api.openai.com/v1')
    await expect(chatModelInput(page)).toHaveValue('gpt-4o-mini')
    await expect(chatApiKeyFieldRow.getByPlaceholder('输入 API Key')).toHaveValue('sk-dirty-secret')
    const chatDraftStatusRow = providerStatusItem(chatDiagnostics, '草稿状态')
    await expect(chatDraftStatusRow).toContainText('草稿未保存')
  })

  test('applies OpenPet gateway provider presets without touching API key drafts', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    const chatProviderSection = await expandAiSection(page, '聊天 Provider')
    const hub = providerHub(page)
    const chatDiagnostics = providerDiagnosticsGroup(page, '聊天 Provider')
    const imageDiagnostics = providerDiagnosticsGroup(page, '图片 Provider')
    const chatApiKeyFieldRow = getChatApiKeyRow(chatProviderSection)
    await openProviderDisclosure(hub, '显示常用聊天 Provider 预设')
    await chatBaseUrlInput(page).fill('https://dirty-chat.example.test/v1')
    await chatModelInput(page).fill('dirty-chat-model')
    await chatApiKeyFieldRow.getByPlaceholder('输入 API Key').fill('sk-chat-draft-secret')
    await expect(chatDiagnostics.getByRole('button', { name: /OpenPet 8317 网关/ })).toContainText('已有归档 AI smoke')
    await expect(chatDiagnostics.getByRole('button', { name: /OpenPet 8317 网关/ })).toContainText('/models 发现 gpt-5.5')
    await chatDiagnostics.getByRole('button', { name: /OpenPet 8317 网关/ }).click()

    await expect(chatBaseUrlInput(page)).toHaveValue('http://127.0.0.1:8317/v1')
    await expect(chatModelInput(page)).toHaveValue('gpt-5.5')
    await expect(chatApiKeyFieldRow.getByPlaceholder('输入 API Key')).toHaveValue('sk-chat-draft-secret')

    const imageProviderSection = await expandAiSection(page, '图片 Provider')
    await openProviderDisclosure(hub, '显示常用图片 Provider 预设')
    await expect(imageDiagnostics.getByRole('button', { name: 'Together' })).toHaveCount(1)
    await expect(imageDiagnostics.getByRole('button', { name: 'OpenRouter' })).toHaveCount(1)
    await expect(imageDiagnostics.getByText('除 OpenPet 8317 外，预设只是 endpoint 模板，需要保存后健康检查确认。')).toBeVisible()
    await expect(imageDiagnostics.getByRole('button', { name: 'Together' })).toContainText('endpoint 模板')
    await expect(imageDiagnostics.getByRole('button', { name: 'Together' })).toContainText('未包含当前 OpenPet smoke 证据')
    await page.getByLabel('图片 Base URL').fill('https://dirty-image.example.test/v1')
    await page.getByLabel('图片 Model').fill('dirty-image-model')
    const imageApiKeyFieldRow = getImageApiKeyRow(imageProviderSection)
    await imageApiKeyFieldRow.locator('input[type="password"]').fill('sk-image-draft-secret')

    await imageDiagnostics.getByRole('button', { name: 'Together' }).click()
    await expect(page.getByLabel('图片 Base URL')).toHaveValue('https://api.together.xyz/v1')
    await expect(page.getByLabel('图片 Model')).toHaveValue('dirty-image-model')
    await expect(page.getByLabel('图片 Timeout MS')).toHaveValue('120000')
    await expect(page.getByLabel('图片最大并发')).toHaveValue('1')
    await expect(imageApiKeyFieldRow.locator('input[type="password"]')).toHaveValue('sk-image-draft-secret')

    await expect(imageDiagnostics.getByRole('button', { name: /OpenPet 8317 网关/ })).toContainText('已有归档 Creator Studio smoke')
    await expect(imageDiagnostics.getByRole('button', { name: /OpenPet 8317 网关/ })).toContainText('不代表图片质量批准')
    await imageDiagnostics.getByRole('button', { name: /OpenPet 8317 网关/ }).click()

    await expect(page.getByLabel('图片 Base URL')).toHaveValue('http://127.0.0.1:8317/v1')
    await expect(page.getByLabel('图片 Model')).toHaveValue('gpt-image-2')
    await expect(page.getByLabel('图片 Timeout MS')).toHaveValue('120000')
    await expect(page.getByLabel('图片最大并发')).toHaveValue('1')
    await expect(imageApiKeyFieldRow.locator('input[type="password"]')).toHaveValue('sk-image-draft-secret')
  })

  test('persists image generation config and supports key health actions in the demo API', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    const imageProviderSection = await expandAiSection(page, '图片 Provider')
    const hub = providerHub(page)
    const imageDiagnostics = providerDiagnosticsGroup(page, '图片 Provider')
    await openProviderDisclosure(hub, '显示常用图片 Provider 预设')
    await openProviderDisclosure(hub, '显示高级图片配置')
    await expect(page.getByLabel('图片默认后端')).toHaveCount(0)
    await expect(page.getByLabel('本地 Endpoint')).toHaveCount(0)
    await expect(page.getByLabel('本地 Health URL')).toHaveCount(0)
    await expect(page.getByLabel('本地模型')).toHaveCount(0)

    await imageDiagnostics.getByRole('button', { name: /本地\/代理 OpenAI-compatible/ }).click()
    await expect(page.getByLabel('图片 Base URL')).toHaveValue('http://127.0.0.1:8317/v1')
    await expect(page.getByLabel('图片 Model')).toHaveValue('gpt-image-2')
    await expect(page.getByLabel('图片 Timeout MS')).toHaveValue('120000')
    await expect(page.getByLabel('图片最大并发')).toHaveValue('1')

    await page.getByLabel('图片 Base URL').fill('https://image.example.test/v1')
    await page.getByLabel('图片 Model').fill('openpet-image-test')
    await page.getByLabel('图片 Timeout MS').fill('90000')
    await page.getByLabel('图片最大并发').fill('2')
    await expect(providerStatusItem(imageDiagnostics, '草稿状态')).toContainText('图片配置草稿未保存')
    await page.getByRole('button', { name: '检查图片健康' }).click()
    await expect(page.locator('.readonly-row', { hasText: '图片健康状态' })).toContainText('请先保存图片配置')

    await imageProviderSection.getByRole('button', { name: '保存图片 Provider' }).click()
    await expect(page.getByTestId('ai-image-status')).toContainText('图片 Provider 配置已保存')
    await expect(page.getByTestId('ai-status-line')).toHaveCount(0)
    await expect(page.locator('.readonly-row', { hasText: '图片当前 Provider' })).toContainText('openpet-image-test')
    await expect(providerStatusItem(imageDiagnostics, '草稿状态')).toContainText('当前没有未保存')
    await expect(page.locator('.readonly-row', { hasText: '生成边界' })).toContainText('API Key')

    const imageApiKeyFieldRow = getImageApiKeyRow(imageProviderSection)
    const imageApiKeyInput = imageApiKeyFieldRow.locator('input[type="password"]')
    await imageApiKeyInput.fill('sk-image-demo-1234')
    await page.getByRole('button', { name: '保存图片密钥' }).click()
    await expect(page.getByTestId('ai-image-status')).toContainText('图片 API Key 已保存')
    await expect(page.getByTestId('ai-status-line')).toHaveCount(0)
    await expect(imageApiKeyInput).toHaveValue('')
    await expect(imageApiKeyFieldRow).toContainText('已保存')
    await expect(imageApiKeyFieldRow).toContainText('••••1234')

    await page.getByRole('button', { name: '检查图片健康' }).click()
    await expect(page.locator('.readonly-row', { hasText: '图片健康状态' })).toContainText('图片 Provider 可达，但模型列表探测不可用')

    await page.getByRole('button', { name: '清除图片密钥' }).click()
    await expect(page.getByTestId('ai-image-status')).toContainText('图片 API Key 已清除')
    await expect(page.getByTestId('ai-status-line')).toHaveCount(0)
    await expect(imageApiKeyFieldRow).toContainText('未保存')

    await page.getByRole('button', { name: '检查图片健康' }).click()
    await expect(page.locator('.readonly-row', { hasText: '图片健康状态' })).toContainText('图片 Provider 健康检查失败：图片 API Key 未配置')

    await page.reload()
    await page.getByRole('button', { name: 'AI' }).click()
    const reloadedImageProviderSection = await expandAiSection(page, '图片 Provider')
    await openProviderDisclosure(providerHub(page), '显示高级图片配置')
    await expect(page.getByLabel('图片 Base URL')).toHaveValue('https://image.example.test/v1')
    await expect(page.getByLabel('图片 Model')).toHaveValue('openpet-image-test')
    await expect(page.getByLabel('图片 Timeout MS')).toHaveValue('90000')
    await expect(page.getByLabel('图片最大并发')).toHaveValue('2')
    await expect(getImageApiKeyRow(reloadedImageProviderSection)).toContainText('未保存')
  })

  test('shows image provider discovery results and transparency compatibility hints in the demo API', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    const imageProviderSection = await expandAiSection(page, '图片 Provider')
    const hub = providerHub(page)
    const imageDiagnostics = providerDiagnosticsGroup(page, '图片 Provider')
    await openProviderDisclosure(hub, '显示常用图片 Provider 预设')
    await imageDiagnostics.getByRole('button', { name: /Together/ }).click()
    await page.getByLabel('图片 Model').fill('black-forest-labs/flux-schnell')
    await expect(page.getByTestId('image-model-compatibility')).toContainText('Together 图片兼容模式')
    await expect(page.getByTestId('image-model-compatibility')).toContainText('Together')

    await imageDiagnostics.getByRole('button', { name: /OpenRouter/ }).click()
    await expect(page.getByTestId('image-model-compatibility')).toContainText('OpenRouter 图片兼容模式')
    await expect(page.getByTestId('image-model-compatibility')).toContainText('OpenRouter 路由')

    await imageDiagnostics.getByRole('button', { name: /OpenAI 官方/ }).click()
    await page.getByLabel('图片 Base URL').fill('https://healthy-models.example.test/v1')
    await page.getByLabel('图片 Model').fill('openpet-image-test')
    await imageProviderSection.getByRole('button', { name: '保存图片 Provider' }).click()

    const imageApiKeyFieldRow = getImageApiKeyRow(imageProviderSection)
    await imageApiKeyFieldRow.locator('input[type="password"]').fill('sk-image-demo-5678')
    await page.getByRole('button', { name: '保存图片密钥' }).click()
    await page.getByRole('button', { name: '检查图片健康' }).click()

    await expect(page.getByTestId('image-model-discovery')).toContainText('模型列表探测成功')
    await expect(page.getByTestId('image-model-discovery')).toContainText('openpet-image-test')
    await expect(page.getByTestId('image-model-discovery')).toContainText('已包含当前模型')
    await expect(page.getByTestId('image-usage-summary')).toContainText('使用量摘要')
    await expect(page.getByTestId('image-usage-summary')).toContainText('usage.estimatedCostUsd')
    await expect(page.getByTestId('image-model-compatibility')).toContainText('transparent')
    await expect(page.getByTestId('image-model-compatibility')).toContainText('OpenAI-compatible')

    await page.getByLabel('图片 Model').fill('gpt-image-2')
    await expect(page.getByTestId('image-model-compatibility')).toContainText('gpt-image-2')
    await expect(page.getByTestId('image-model-compatibility')).toContainText('不会强制发送 background 参数')

    await page.getByLabel('图片 Model').fill('missing-image-model')
    await imageProviderSection.getByRole('button', { name: '保存图片 Provider' }).click()
    await page.getByRole('button', { name: '检查图片健康' }).click()
    await expect(page.locator('.readonly-row', { hasText: '图片健康状态' })).toContainText('当前保存的图片 Model 未出现在 /models 返回列表中')
    await expect(page.getByTestId('image-model-discovery')).toContainText('当前保存的图片 Model 未出现在探测列表中')

    await page.getByLabel('图片 Model').fill('draft-only-image-model')
    await expect(providerStatusItem(imageDiagnostics, '草稿状态')).toContainText('图片配置草稿未保存')
    await expect(page.getByTestId('image-model-discovery')).toContainText('当前有未保存的图片草稿')
    await expect(page.getByTestId('image-usage-summary')).toContainText('仍对应已保存配置')

    await page.getByLabel('图片 Model').fill('missing-image-model')
    await imageApiKeyFieldRow.locator('input[type="password"]').fill('sk-image-draft-only-9999')
    await expect(providerStatusItem(imageDiagnostics, '草稿状态')).toContainText('图片密钥草稿未保存')
    await expect(page.getByTestId('image-model-discovery')).toContainText('当前有未保存的图片草稿')
    await expect(page.getByTestId('image-usage-summary')).toContainText('仍对应已保存配置')
  })

  test('shows image model discovery timeout feedback in the demo API', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    const imageProviderSection = await expandAiSection(page, '图片 Provider')
    await page.getByLabel('图片 Base URL').fill('https://models-timeout.example.test/v1')
    await page.getByLabel('图片 Model').fill('gpt-image-2')
    await imageProviderSection.getByRole('button', { name: '保存图片 Provider' }).click()

    const imageApiKeyFieldRow = getImageApiKeyRow(imageProviderSection)
    await imageApiKeyFieldRow.locator('input[type="password"]').fill('sk-image-timeout-1234')
    await page.getByRole('button', { name: '保存图片密钥' }).click()
    await imageProviderSection.getByRole('button', { name: '刷新图片模型' }).click()

    await expect(page.getByTestId('ai-image-model-discovery')).toContainText('图片 Provider 模型探测超时')
    await expect(page.getByTestId('ai-image-model-discovery')).toContainText('timed out')
  })

  test('shows chat model discovery timeout feedback in the demo API', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    const chatProviderSection = await expandAiSection(page, '聊天 Provider')
    await chatBaseUrlInput(page).fill('https://models-timeout.example.test/v1')
    await chatModelInput(page).fill('gpt-4o-mini')
    await chatProviderSection.getByRole('button', { name: '保存聊天 Provider' }).click()

    const apiKeyRow = getChatApiKeyRow(chatProviderSection)
    await apiKeyRow.getByPlaceholder('输入 API Key').fill('sk-chat-timeout-1234')
    await apiKeyRow.getByRole('button', { name: '保存聊天密钥' }).click()
    await chatProviderSection.getByRole('button', { name: '刷新聊天模型' }).click()

    await expect(page.getByTestId('ai-chat-model-discovery')).toContainText('聊天 Provider 模型探测超时')
    await expect(page.getByTestId('ai-chat-model-discovery')).toContainText('timed out')
  })

  test('surfaces chat connection-test model probe timeout honestly in the demo API', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    const chatProviderSection = await expandAiSection(page, '聊天 Provider')
    await chatBaseUrlInput(page).fill('https://models-timeout.example.test/v1')
    await chatModelInput(page).fill('gpt-4o-mini')
    await chatProviderSection.getByRole('button', { name: '保存聊天 Provider' }).click()

    const apiKeyRow = getChatApiKeyRow(chatProviderSection)
    await apiKeyRow.getByPlaceholder('输入 API Key').fill('sk-chat-timeout-5678')
    await apiKeyRow.getByRole('button', { name: '保存聊天密钥' }).click()
    await chatProviderSection.getByRole('button', { name: '测试已保存配置' }).click()

    await expect(page.getByTestId('ai-provider-feedback')).toContainText('聊天 Provider 可达，但模型列表探测超时')
    await expect(page.getByTestId('ai-provider-feedback')).toHaveClass(/error/)
    await expect(page.getByTestId('ai-connection-result')).toContainText('连接测试部分通过')
    await expect(providerHubStatusItem(page, '聊天连接')).toContainText('最近测试失败')
    await expect(page.getByTestId('chat-model-discovery')).toContainText('模型列表探测超时')
  })

  test('surfaces chat connection-test model probe failure honestly in the demo API', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    const chatProviderSection = await expandAiSection(page, '聊天 Provider')
    await chatBaseUrlInput(page).fill('https://models-failed.example.test/v1')
    await chatModelInput(page).fill('gpt-4o-mini')
    await chatProviderSection.getByRole('button', { name: '保存聊天 Provider' }).click()

    const apiKeyRow = getChatApiKeyRow(chatProviderSection)
    await apiKeyRow.getByPlaceholder('输入 API Key').fill('sk-chat-failed-5678')
    await apiKeyRow.getByRole('button', { name: '保存聊天密钥' }).click()
    await chatProviderSection.getByRole('button', { name: '测试已保存配置' }).click()

    await expect(page.getByTestId('ai-provider-feedback')).toContainText('聊天 Provider 可达，但模型列表探测失败')
    await expect(page.getByTestId('ai-provider-feedback')).toHaveClass(/error/)
    await expect(page.getByTestId('ai-connection-result')).toContainText('连接测试部分通过')
    await expect(providerHubStatusItem(page, '聊天连接')).toContainText('最近测试失败')
    await expect(page.getByTestId('chat-model-discovery')).toContainText('模型列表探测失败')
  })

  test('clears stale image model refresh results after saving a new image provider config', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    const imageProviderSection = await expandAiSection(page, '图片 Provider')
    await page.getByLabel('图片 Base URL').fill('https://healthy-models.example.test/v1')
    await page.getByLabel('图片 Model').fill('openpet-image-test')
    await imageProviderSection.getByRole('button', { name: '保存图片 Provider' }).click()

    const imageApiKeyFieldRow = getImageApiKeyRow(imageProviderSection)
    await imageApiKeyFieldRow.locator('input[type="password"]').fill('sk-image-demo-1111')
    await page.getByRole('button', { name: '保存图片密钥' }).click()
    await imageProviderSection.getByRole('button', { name: '刷新图片模型' }).click()

    await expect(page.getByTestId('ai-image-model-discovery')).toContainText('图片模型探测')
    await expect(page.getByTestId('ai-image-model-discovery')).toContainText('models:')

    await page.getByLabel('图片 Model').fill('draft-image-model')
    await expect(page.getByTestId('ai-image-model-discovery')).toContainText('仍对应已保存配置')

    await page.getByLabel('图片 Model').fill('gpt-image-2')
    await imageProviderSection.getByRole('button', { name: '保存图片 Provider' }).click()

    await expect(page.getByTestId('ai-image-status')).toContainText('图片 Provider 配置已保存')
    await expect(page.getByTestId('ai-image-model-discovery')).toHaveCount(0)
  })

  test('shows chat provider model discovery results in the demo API', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    const chatProviderSection = await expandAiSection(page, '聊天 Provider')
    const chatDiagnostics = providerDiagnosticsGroup(page, '聊天 Provider')
    await chatBaseUrlInput(page).fill('https://healthy-models.example.test/v1')
    await chatModelInput(page).fill('deepseek-chat')
    await chatProviderSection.getByRole('button', { name: '保存聊天 Provider' }).click()

    const apiKeyRow = getChatApiKeyRow(chatProviderSection)
    await apiKeyRow.getByPlaceholder('输入 API Key').fill('sk-chat-demo-5678')
    await apiKeyRow.getByRole('button', { name: '保存聊天密钥' }).click()
    await chatProviderSection.getByRole('button', { name: '测试已保存配置' }).click()

    await expect(page.getByTestId('chat-model-discovery')).toContainText('模型列表探测成功')
    await expect(page.getByTestId('chat-model-discovery')).toContainText('deepseek-chat')
    await expect(page.getByTestId('chat-model-discovery')).toContainText('已包含当前模型')

    await chatProviderSection.getByRole('button', { name: '刷新聊天模型' }).click()
    await expect(page.getByTestId('chat-model-discovery')).toContainText('gpt-4.1-mini')
    await expect(page.getByTestId('chat-model-discovery')).not.toContainText('deepseek-chat')

    await chatModelInput(page).fill('missing-chat-model')
    await chatProviderSection.getByRole('button', { name: '保存聊天 Provider' }).click()
    await expect(page.getByTestId('chat-model-discovery')).toContainText('运行“测试已保存配置”后')
    await chatProviderSection.getByRole('button', { name: '测试已保存配置' }).click()

    await expect(page.getByTestId('ai-provider-feedback')).toContainText('当前保存的聊天 Model 未出现在 /models 返回列表中')
    await expect(page.getByTestId('chat-model-discovery')).toContainText('当前保存的聊天 Model 未出现在探测列表中')

    await chatModelInput(page).fill('draft-only-chat-model')
    await expect(providerStatusItem(chatDiagnostics, '草稿状态')).toContainText('配置草稿未保存')
    await expect(page.getByTestId('chat-model-discovery')).toContainText('当前有未保存的聊天草稿')

    await chatModelInput(page).fill('missing-chat-model')
    await apiKeyRow.getByPlaceholder('输入新密钥覆盖').fill('sk-chat-draft-only-9999')
    await expect(providerStatusItem(chatDiagnostics, '草稿状态')).toContainText('密钥草稿未保存')
    await expect(page.getByTestId('chat-model-discovery')).toContainText('当前有未保存的聊天草稿')
  })

  test('refreshes image model discovery from the explicit refresh action and clears stale results after save', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    const imageProviderSection = await expandAiSection(page, '图片 Provider')
    const hub = providerHub(page)
    const imageDiagnostics = providerDiagnosticsGroup(page, '图片 Provider')
    await openProviderDisclosure(hub, '显示常用图片 Provider 预设')
    await imageDiagnostics.getByRole('button', { name: /本地\/代理 OpenAI-compatible/ }).click()
    await imageProviderSection.getByRole('button', { name: '保存图片 Provider' }).click()

    const imageApiKeyFieldRow = getImageApiKeyRow(imageProviderSection)
    await imageApiKeyFieldRow.locator('input[type="password"]').fill('sk-image-demo-5678')
    await page.getByRole('button', { name: '保存图片密钥' }).click()
    await page.getByRole('button', { name: '刷新图片模型' }).click()

    await expect(page.getByTestId('image-model-discovery')).toContainText('模型列表探测成功')
    await expect(page.getByTestId('image-model-discovery')).toContainText('flux-schnell')
    await expect(page.getByTestId('image-model-discovery')).toContainText('gpt-image-2')

    await page.getByLabel('图片 Base URL').fill('https://image.example.test/v1')
    await imageProviderSection.getByRole('button', { name: '保存图片 Provider' }).click()

    await expect(page.getByTestId('image-model-discovery')).toContainText('运行“检查图片健康”后')
    await expect(page.getByTestId('image-model-discovery')).not.toContainText('flux-schnell')
  })

  test('clears stale chat model refresh results after saving a new chat API key', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    const chatProviderSection = await expandAiSection(page, '聊天 Provider')
    const chatDiagnostics = providerDiagnosticsGroup(page, '聊天 Provider')
    await chatBaseUrlInput(page).fill('https://healthy-models.example.test/v1')
    await chatModelInput(page).fill('deepseek-chat')
    await chatProviderSection.getByRole('button', { name: '保存聊天 Provider' }).click()

    const apiKeyRow = getChatApiKeyRow(chatProviderSection)
    await apiKeyRow.getByPlaceholder('输入 API Key').fill('sk-chat-demo-1111')
    await apiKeyRow.getByRole('button', { name: '保存聊天密钥' }).click()
    await chatProviderSection.getByRole('button', { name: '刷新聊天模型' }).click()

    await expect(page.getByTestId('ai-chat-model-discovery')).toContainText('聊天模型探测')
    await expect(page.getByTestId('ai-chat-model-discovery')).toContainText('models:')

    await chatModelInput(page).fill('draft-chat-model')
    await expect(page.getByTestId('ai-chat-model-discovery')).toContainText('仍对应已保存配置')

    await apiKeyRow.getByPlaceholder('输入新密钥覆盖').fill('sk-chat-demo-2222')
    await apiKeyRow.getByRole('button', { name: '保存聊天密钥' }).click()

    await expect(page.getByTestId('ai-provider-feedback')).toContainText('API Key 已保存')
    await expect(page.getByTestId('ai-chat-model-discovery')).toHaveCount(0)
  })

  test('shows chat model compatibility hints for default and custom models in the demo API', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    const chatProviderSection = await expandAiSection(page, '聊天 Provider')
    await expect(page.getByTestId('chat-model-compatibility')).toContainText('gpt-4o-mini')
    await expect(page.getByTestId('chat-model-compatibility')).toContainText('OpenAI 官方兼容模式')

    const hub = providerHub(page)
    const chatDiagnostics = providerDiagnosticsGroup(page, '聊天 Provider')
    await openProviderDisclosure(hub, '显示常用聊天 Provider 预设')
    await chatDiagnostics.getByRole('button', { name: 'LM Studio' }).click()
    await chatModelInput(page).fill('qwen2.5-7b-instruct')
    await expect(page.getByTestId('chat-model-compatibility')).toContainText('LM Studio 聊天兼容模式')
    await expect(page.getByTestId('chat-model-compatibility')).toContainText('打开本地服务')

    await chatDiagnostics.getByRole('button', { name: 'OpenRouter' }).click()
    await expect(page.getByTestId('chat-model-compatibility')).toContainText('OpenRouter 聊天兼容模式')
    await expect(page.getByTestId('chat-model-compatibility')).toContainText('OpenRouter 路由')

    await chatModelInput(page).fill('deepseek-chat')
    await chatDiagnostics.getByRole('button', { name: 'Together' }).click()
    await expect(page.getByTestId('chat-model-compatibility')).toContainText('deepseek-chat')
    await expect(page.getByTestId('chat-model-compatibility')).toContainText('Together 聊天兼容模式')
    await expect(chatProviderSection).toContainText('聊天模型')
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

  test('manages AI long-term memories in the demo API', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    const memorySection = await expandAiSection(page, '长期记忆')
    await expect(memorySection).toContainText('Legacy Cat · legacy-cat')
    await expect(memorySection).toContainText('User prefers concise Chinese replies during focused work.')
    await expect(memorySection).toContainText('Legacy Cat should greet the user softly before focus sessions.')

    await memorySection.getByRole('button', { name: '删除记忆 demo-memory-global-style' }).click()
    await expect(page.locator('.status-line')).toContainText('长期记忆已删除')
    await expect(memorySection).not.toContainText('User prefers concise Chinese replies during focused work.')
    await expect(memorySection).toContainText('Legacy Cat should greet the user softly before focus sessions.')

    page.once('dialog', (dialog) => dialog.accept())
    await memorySection.getByRole('button', { name: '清空当前宠物记忆' }).click()
    await expect(page.locator('.status-line')).toContainText('当前宠物关系记忆已清空')
    await expect(memorySection).not.toContainText('Legacy Cat should greet the user softly before focus sessions.')
    await expect(memorySection).toContainText('暂无当前宠物关系记忆')

    await page.getByRole('button', { name: 'Actions' }).click()
    await page.getByRole('button', { name: '启用' }).filter({ hasText: /^启用$/ }).nth(0).click()
    await expect(page.locator('.status-line')).toContainText('已启用 Citrus Cat')

    await page.getByRole('button', { name: 'AI' }).click()
    const citrusMemorySection = await expandAiSection(page, '长期记忆')
    await expect(citrusMemorySection).toContainText('Citrus Cat · citrus-cat')
    await expect(citrusMemorySection).toContainText('Citrus likes cheerful check-ins after the user finishes a task.')
    await expect(citrusMemorySection).not.toContainText('Legacy Cat should greet the user softly before focus sessions.')
  })

  test('AI page labels the full window as an extended chat panel', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    const chatSection = await expandAiSection(page, '聊天')
    const chatStatus = page.getByTestId('ai-chat-status')
    await expect(chatSection).toContainText('默认在这里和宠物对话；需要长历史时可打开扩展聊天面板')
    await expect(page.getByTestId('ai-bubble-chat-state')).toContainText('当前未显示')
    await chatSection.getByRole('button', { name: '打开默认气泡聊天' }).click()
    await expect(chatStatus).toContainText('已打开默认气泡聊天')
    await expect(page.getByTestId('ai-bubble-chat-state')).toContainText('当前已显示')
    await chatSection.getByRole('button', { name: '打开扩展聊天面板' }).click()
    await expect(chatStatus).toContainText('已打开扩展聊天面板')
  })

  test('AI page refreshes BubbleChat visibility after the window is externally closed', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    const chatSection = await expandAiSection(page, '聊天')
    const bubbleState = page.getByTestId('ai-bubble-chat-state')
    await expect(bubbleState).toContainText('当前未显示')

    await chatSection.getByRole('button', { name: '打开默认气泡聊天' }).click()
    await expect(bubbleState).toContainText('当前已显示')

    await page.evaluate(() => {
      const key = 'openpet.controlCenter.demoState'
      const state = JSON.parse(window.sessionStorage.getItem(key) || '{}')
      state.petBubbleChatState = { visible: false, hasWindow: false }
      window.sessionStorage.setItem(key, JSON.stringify(state))
      window.dispatchEvent(new Event('focus'))
    })

    await expect(bubbleState).toContainText('当前未显示')
  })

  test('switches AI trace export filters in the demo API', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    const memorySection = await expandAiSection(page, '长期记忆')
    const filterSelect = memorySection.getByTestId('ai-trace-filter-select')

    await expect(filterSelect).toHaveValue('all')
    await expect(memorySection.locator('.readonly-row', { hasText: '当前 Trace 过滤' })).toContainText('不过滤，导出全部')

    await filterSelect.selectOption('petPack')
    await expect(memorySection.locator('.readonly-row', { hasText: '当前 Trace 过滤' })).toContainText('宠物包 legacy-cat')

    await filterSelect.selectOption('conversation')
    await expect(memorySection.locator('.readonly-row', { hasText: '当前 Trace 过滤' })).toContainText('会话 control-center:legacy-cat:main')
  })

  test('rebinds AI trace conversation filter after switching the active pet pack', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    const memorySection = await expandAiSection(page, '长期记忆')
    const filterSelect = memorySection.getByTestId('ai-trace-filter-select')

    await filterSelect.selectOption('conversation')
    await expect(filterSelect).toHaveValue('conversation')
    await expect(memorySection.locator('.readonly-row', { hasText: '当前 Trace 过滤' })).toContainText('会话 control-center:legacy-cat:main')

    await page.getByRole('button', { name: 'Actions' }).click()
    await page.getByRole('button', { name: '启用' }).filter({ hasText: /^启用$/ }).nth(0).click()
    await expect(page.locator('.status-line')).toContainText('已启用 Citrus Cat')

    await page.getByRole('button', { name: 'AI' }).click()
    const refreshedMemorySection = await expandAiSection(page, '长期记忆')
    await expect(refreshedMemorySection.getByTestId('ai-trace-filter-select')).toHaveValue('conversation')
    await expect(refreshedMemorySection.locator('.readonly-row', { hasText: '当前 Trace 过滤' })).toContainText('会话 control-center:citrus-cat:main')
  })

  test('shows AI behavior decisions and supports replay and clearing diagnostics', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()

    const providerSection = await expandAiSection(page, '聊天 Provider')
    await openProviderDisclosure(providerHub(page), '高级 / 诊断')
    await page.getByRole('switch', { name: 'Enable AI chat' }).click()
    await providerSection.getByRole('button', { name: '保存聊天 Provider' }).click()
    await providerSection.getByPlaceholder('输入 API Key').fill('sk-demo-chat')
    await providerSection.getByRole('button', { name: '保存聊天密钥' }).click()

    await expandAiSection(page, 'Behavior')
    const decisionsPanel = page.locator('.field-row', { hasText: 'Decisions' })
    await expect(decisionsPanel).toContainText('1 条')
    await expect(decisionsPanel.locator('.behavior-decision-row')).toContainText('#1 matched')
    await expect(decisionsPanel.locator('.behavior-decision-row')).toContainText('matched rule demo-rule')

    await decisionsPanel.getByPlaceholder('Decision ID').fill('1')
    await decisionsPanel.getByRole('button', { name: 'Replay' }).click()
    await expect(page.getByTestId('ai-behavior-status')).toContainText('Replay 命中')
    await expect(page.getByTestId('ai-status-line')).toHaveCount(0)
    await expect(decisionsPanel.locator('.behavior-result')).toContainText('matched provider actionId')

    await decisionsPanel.getByRole('button', { name: '导出' }).click()
    await expect(page.getByTestId('ai-behavior-status')).toContainText('Behavior 诊断已导出')
    await expect(page.getByTestId('ai-status-line')).toHaveCount(0)

    page.once('dialog', (dialog) => dialog.accept())
    await decisionsPanel.getByRole('button', { name: '清空' }).click()
    await expect(page.getByTestId('ai-behavior-status')).toContainText('Behavior 决策已清空')
    await expect(page.getByTestId('ai-status-line')).toHaveCount(0)
    await expect(decisionsPanel).toContainText('0 条')
    await expect(decisionsPanel.locator('.empty-chat')).toContainText('暂无决策记录')

    await expandAiSection(page, '聊天')
    await page.getByPlaceholder('说点什么').fill('hello decision viewer')
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.getByTestId('ai-chat-status')).toContainText('已触发动作：Wave')
    await expect(page.getByTestId('ai-status-line')).toHaveCount(0)
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

  test('keeps plugin installation, management, and logs progressively disclosed', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('openpet.controlCenter.demoState', JSON.stringify({
        plugins: [
          {
            id: 'openpet.demo.focus',
            name: 'Focus Helper',
            version: '1.0.0',
            source: 'local',
            enabled: true,
            runnable: true,
            requiresNativeExecution: true,
            nativeExecutionApproved: false,
            permissions: ['pet:say'],
            commands: [{ id: 'focus', title: 'Start focus' }],
            entries: {
              commands: [{ id: 'focus', title: 'Start focus', command: 'node focus.js', cwd: '.' }],
              setup: [],
              services: [],
              dashboards: []
            },
            configSchema: { properties: [] },
            config: {},
            storage: { keyCount: 2, byteSize: 64, valid: true },
            signatureStatus: {
              status: 'unsigned',
              label: 'Unsigned plugin',
              signer: '',
              algorithm: '',
              verified: false,
              errors: []
            },
            blockStatus: { blocked: true, reasons: ['Demo policy blocked'] }
          },
          {
            id: 'openpet.demo.dormant',
            name: 'Dormant Helper',
            version: '1.0.0',
            source: 'local',
            enabled: false,
            runnable: true,
            requiresNativeExecution: true,
            nativeExecutionApproved: false,
            permissions: [],
            commands: [],
            entries: {
              commands: [{ id: 'idle', title: 'Idle', command: 'node idle.js', cwd: '.' }],
              setup: [],
              services: [
                {
                  id: 'dormant-service',
                  title: 'Dormant Service',
                  command: 'node dormant.js',
                  cwd: '.',
                  health: { type: 'http', url: 'http://127.0.0.1:8795/health' },
                  runtime: {
                    status: 'stopped',
                    health: {
                      status: 'unhealthy',
                      url: 'http://127.0.0.1:8795/health',
                      message: 'Previous health check failed'
                    }
                  }
                }
              ],
              dashboards: []
            },
            configSchema: { properties: [] },
            config: {},
            storage: { keyCount: 0, byteSize: 2, valid: true },
            signatureStatus: {
              status: 'unsigned',
              label: 'Unsigned plugin',
              signer: '',
              algorithm: '',
              verified: false,
              errors: []
            },
            blockStatus: { blocked: false, reasons: [] }
          },
          {
            id: 'openpet.demo.failed',
            name: 'Failed Helper',
            version: '1.0.0',
            source: 'local',
            enabled: true,
            runnable: true,
            requiresNativeExecution: true,
            nativeExecutionApproved: true,
            permissions: [],
            commands: [],
            entries: {
              commands: [],
              setup: [],
              services: [
                {
                  id: 'failed-service',
                  title: 'Failed Service',
                  command: 'node failed.js',
                  cwd: '.',
                  health: { type: 'http', url: 'http://127.0.0.1:8796/health' },
                  runtime: {
                    status: 'failed',
                    error: 'Service start failed',
                    health: { status: 'unknown', url: 'http://127.0.0.1:8796/health' }
                  }
                }
              ],
              dashboards: []
            },
            configSchema: { properties: [] },
            config: {},
            storage: { keyCount: 0, byteSize: 2, valid: true },
            signatureStatus: {
              status: 'unsigned',
              label: 'Unsigned plugin',
              signer: '',
              algorithm: '',
              verified: false,
              errors: []
            },
            blockStatus: { blocked: false, reasons: [] }
          }
        ],
        pluginLogs: [
          {
            id: 'log-warning-1',
            timestamp: '2026-07-16T08:00:00.000Z',
            level: 'warn',
            pluginId: 'openpet.demo.focus',
            commandId: 'focus',
            message: 'Runtime approval requires attention'
          }
        ]
      }))
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Plugins' }).click()

    const installDisclosure = page.locator('details.plugin-install-disclosure')
    const pluginRow = page.locator('.plugin-row', { hasText: 'Focus Helper' })
    const dormantPluginRow = page.locator('.plugin-row', { hasText: 'Dormant Helper' })
    const failedPluginRow = page.locator('.plugin-row', { hasText: 'Failed Helper' })
    const managementDisclosure = pluginRow.locator('details.plugin-management-disclosure')
    const logsDisclosure = page.locator('details.plugin-log-disclosure')
    const attentionOverview = page.locator('.plugins-overview > div', { hasText: '需要处理' })

    await expect(installDisclosure).not.toHaveAttribute('open', '')
    await expect(managementDisclosure).not.toHaveAttribute('open', '')
    await expect(logsDisclosure).not.toHaveAttribute('open', '')
    await expect(pluginRow.getByRole('switch', { name: 'Enable Focus Helper' })).toBeVisible()
    await expect(pluginRow).toContainText('插件已启用')
    await expect(pluginRow).not.toContainText('运行已允许')
    await expect(pluginRow).toContainText('已被策略阻止')
    await expect(pluginRow).not.toContainText('需要原生执行授权')
    await expect(attentionOverview.locator('strong')).toHaveText('2')
    await expect(dormantPluginRow).toContainText('当前停用')
    await expect(dormantPluginRow).not.toContainText('需要原生执行授权')
    await expect(dormantPluginRow).toContainText('1 个服务已停止')
    await expect(dormantPluginRow).not.toContainText('服务异常')
    await expect(failedPluginRow).toContainText('1 个服务运行失败')
    await expect(pluginRow).toContainText('1 项权限')
    await expect(pluginRow).toContainText('1 个命令')
    await expect(pluginRow.getByRole('button', { name: 'Start focus' })).toBeHidden()
    await expect(page.locator('.plugin-log-row', { hasText: 'Runtime approval requires attention' })).toBeHidden()

    await managementDisclosure.locator('summary').click()
    await expect(managementDisclosure).toHaveAttribute('open', '')
    await expect(pluginRow.getByRole('button', { name: 'Start focus' })).toBeVisible()

    await logsDisclosure.locator('summary').click()
    await expect(logsDisclosure).toHaveAttribute('open', '')
    const warningLog = page.locator('.plugin-log-row.warn', { hasText: 'Runtime approval requires attention' })
    await expect(warningLog).toBeVisible()
    await expect(warningLog).toContainText('Warning')
    await expect(page.locator('.plugin-log-filters')).toBeVisible()
    await expect(logsDisclosure.getByRole('button', { name: 'JSON' })).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    const widths = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth
    }))
    expect(widths.document).toBeLessThanOrEqual(widths.viewport)
    expect(widths.body).toBeLessThanOrEqual(widths.viewport)
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
    await openPluginManagement(pluginRow)
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
    const approvalToggle = pluginRow.getByRole('switch', { name: 'Allow native process execution for Demo Manual Review' })
    await expect(approvalToggle).toHaveAttribute('aria-checked', 'false')
    await expect(pluginRow.getByRole('button', { name: 'Say hello' })).toBeDisabled()
    await expect(pluginRow.getByRole('button', { name: 'Run Install Dependencies Setup' })).toBeDisabled()
    await expect(pluginRow.getByRole('button', { name: 'Start Manual Companion' })).toBeDisabled()
    await approvalToggle.click()
    await expect(page.locator('.status-line')).toContainText('已允许原生进程执行')
    await expect(approvalToggle).toHaveAttribute('aria-checked', 'true')
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
    await expect(pluginRow).toContainText('Health note: OK')
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
    await openPluginManagement(reloadedPluginRow)
    await expect(reloadedPluginRow.locator('.plugin-health-policy').getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    await expect(reloadedPluginRow.locator('.plugin-health-policy').getByRole('combobox')).toHaveValue('60000')
    await expect(page.locator('.plugin-log-row', { hasText: 'Plugin installed' })).toContainText('openpet.demo.manual-review')
  })

  test('inspects GitHub repository plugins from the Plugins pane with the demo API', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Plugins' }).click()

    await openPluginInstallDisclosure(page)
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

  test('shows agent-awareness approval gating and health summary in the Plugins pane with the demo API', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('openpet.controlCenter.demoState', JSON.stringify({
        plugins: [
          {
            id: 'openpet.agent-awareness',
            name: 'Agent Awareness',
            version: '0.1.0',
            source: 'local',
            enabled: true,
            runnable: true,
            requiresNativeExecution: true,
            nativeExecutionApproved: false,
            permissions: ['pet:say', 'pet:event'],
            commands: [
              { id: 'doctor', title: 'Check Agent Awareness Setup' }
            ],
            entries: {
              commands: [
                { id: 'doctor', title: 'Check Agent Awareness Setup', command: 'node ./commands/doctor.js', cwd: '.' }
              ],
              setup: [],
              services: [
                {
                  id: 'agent-awareness',
                  title: 'Agent Awareness Service',
                  command: 'node ./service/agent-awareness-service.js',
                  cwd: '.',
                  health: { type: 'http', url: 'http://127.0.0.1:8795/health' },
                  runtime: {
                    status: 'stopped',
                    pid: 0,
                    health: {
                      status: 'healthy',
                      checkedAt: '2026-07-03T12:00:00.000Z',
                      url: 'http://127.0.0.1:8795/health',
                      statusCode: 200,
                      message: '3 active · 23 sessions · 1,250 events',
                      details: [
                        { label: 'Active Sessions', value: '3' },
                        { label: 'Tracked Sessions', value: '23' },
                        { label: 'Observed Events', value: '1,250' },
                        { label: 'Usage Tokens', value: '1,500' },
                        { label: 'Estimated Cost', value: '$0.030000 USD' },
                        { label: 'Peak Context', value: '0.8%' }
                      ]
                    }
                  },
                  healthPolicy: {
                    enabled: false,
                    intervalMs: 30000
                  }
                }
              ],
              dashboards: [
                { id: 'main', title: 'Agent Awareness', url: 'http://127.0.0.1:8795' }
              ]
            },
            configSchema: { properties: [] },
            config: {},
            storage: { keyCount: 0, byteSize: 2, valid: true },
            signatureStatus: {
              status: 'bundled',
              label: 'Bundled plugin',
              signer: 'openpet',
              algorithm: '',
              verified: true,
              errors: []
            },
            blockStatus: { blocked: false, reasons: [] }
          }
        ],
        pluginLogs: []
      }))
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Plugins' }).click()

    const pluginRow = page.locator('.plugin-row', { hasText: 'Agent Awareness' })
    await expect(pluginRow).toContainText('openpet.agent-awareness')
    await expect(pluginRow).toContainText('pet:say · pet:event')
    await expect(pluginRow).toContainText('Health note: 3 active · 23 sessions · 1,250 events')
    await expect(pluginRow).toContainText('Agent Awareness 原生详情')
    await expect(pluginRow).toContainText('Usage Tokens')
    await expect(pluginRow).toContainText('1,500')
    await expect(pluginRow).toContainText('Peak Context')
    await expect(pluginRow).toContainText('0.8%')

    await openPluginManagement(pluginRow)
    const approvalToggle = pluginRow.getByRole('switch', { name: 'Allow native process execution for Agent Awareness' })
    await expect(approvalToggle).toHaveAttribute('aria-checked', 'false')
    await expect(pluginRow.getByRole('button', { name: 'Check Agent Awareness Setup' })).toBeDisabled()
    await expect(pluginRow.getByRole('button', { name: 'Start Agent Awareness Service' })).toBeDisabled()

    await approvalToggle.click()

    await expect(approvalToggle).toHaveAttribute('aria-checked', 'true')
    await expect(pluginRow.getByRole('button', { name: 'Check Agent Awareness Setup' })).toBeEnabled()
    await expect(pluginRow.getByRole('button', { name: 'Start Agent Awareness Service' })).toBeEnabled()
  })

  test('manages IM Gateway Telegram token and service gate in the Plugins pane with the demo API', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('openpet.controlCenter.demoState', JSON.stringify({
        plugins: [
          {
            id: 'openpet.im-gateway',
            name: 'IM Gateway',
            version: '0.1.0',
            source: 'bundled',
            enabled: true,
            runnable: true,
            requiresNativeExecution: true,
            nativeExecutionApproved: false,
            permissions: ['pet:say', 'pet:action', 'pet:event'],
            commands: [],
            entries: {
              commands: [],
              setup: [],
              services: [
                {
                  id: 'im-gateway',
                  title: 'IM Gateway Service',
                  command: 'node ./service/im-gateway-service.js',
                  cwd: '.',
                  health: { type: 'http', url: 'http://127.0.0.1:8796/health' },
                  runtime: {
                    status: 'stopped',
                    pid: 0,
                    health: {
                      status: 'unknown',
                      checkedAt: '',
                      url: 'http://127.0.0.1:8796/health',
                      statusCode: 0,
                      message: ''
                    }
                  },
                  healthPolicy: {
                    enabled: false,
                    intervalMs: 30000
                  }
                }
              ],
              dashboards: []
            },
            configSchema: {
              title: 'IM Gateway Settings',
              description: 'Public IM trigger policy. Tokens are stored by the host.',
              properties: [
                { key: 'telegramEnabled', title: 'Telegram enabled', type: 'boolean' },
                { key: 'telegramMode', title: 'Telegram mode', type: 'string', enum: ['polling'] },
                { key: 'privateChatPolicy', title: 'Private chats', type: 'string', enum: ['command-only', 'any-text'] },
                { key: 'groupChatPolicy', title: 'Group chats', type: 'string', enum: ['mention-or-command', 'command-only'] },
                { key: 'allowedUsers', title: 'Allowed users', type: 'string' },
                { key: 'allowedChats', title: 'Allowed chats', type: 'string' },
                { key: 'allowAllPrivateChats', title: 'Allow all private chats', type: 'boolean' },
                { key: 'allowAllGroupChats', title: 'Allow all group chats', type: 'boolean' },
                { key: 'commandAliases', title: 'Command aliases', type: 'string' },
                { key: 'petSayTtlMs', title: 'Pet say TTL', type: 'number' },
                { key: 'receiptMode', title: 'Receipt mode', type: 'string', enum: ['commands-only', 'none'] }
              ]
            },
            config: {
              telegramEnabled: false,
              telegramMode: 'polling',
              privateChatPolicy: 'command-only',
              groupChatPolicy: 'mention-or-command',
              allowedUsers: '10001',
              allowedChats: '',
              allowAllPrivateChats: false,
              allowAllGroupChats: false,
              commandAliases: '/openpet,/op',
              petSayTtlMs: 6000,
              receiptMode: 'commands-only'
            },
            storage: { keyCount: 0, byteSize: 2, valid: true },
            signatureStatus: {
              status: 'bundled',
              label: 'Bundled plugin',
              signer: 'openpet',
              algorithm: '',
              verified: true,
              errors: []
            },
            blockStatus: { blocked: false, reasons: [] }
          }
        ],
        secrets: {
          imGatewayTelegramBotToken: false
        },
        pluginLogs: []
      }))
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Plugins' }).click()

    const pluginRow = page.locator('.plugin-row', { hasText: 'IM Gateway' })
    await expect(pluginRow).toContainText('openpet.im-gateway')
    await expect(pluginRow).toContainText('pet:say · pet:action · pet:event')

    const imCard = pluginRow.locator('[aria-label="IM Gateway 设置"]')
    await expect(imCard).toContainText('Telegram token: not saved')
    await expect(imCard).toContainText('Telegram: polling')
    await expect(imCard).toContainText('QQ: disabled')
    await expect(imCard).toContainText('WeChat: disabled')
    await expect(pluginRow.getByRole('button', { name: 'Start IM Gateway Service' })).toBeDisabled()

    await pluginRow.getByRole('switch', { name: 'Allow native process execution for IM Gateway' }).click()
    await expect(pluginRow.getByRole('button', { name: 'Start IM Gateway Service' })).toBeEnabled()

    const tokenInput = imCard.getByLabel('Telegram Bot Token')
    await tokenInput.fill('123456:stage3-secret-token')
    await imCard.getByRole('button', { name: 'Save Telegram Token' }).click()

    await expect(page.locator('.status-line')).toContainText('Telegram token saved')
    await expect(imCard).toContainText('Telegram token: saved')
    await expect(tokenInput).toHaveValue('')
    await expect(page.getByText('123456:stage3-secret-token')).toHaveCount(0)

    await imCard.getByRole('button', { name: 'Clear Telegram Token' }).click()

    await expect(page.locator('.status-line')).toContainText('Telegram token cleared')
    await expect(imCard).toContainText('Telegram token: not saved')
    await expect(imCard.getByRole('button', { name: 'Clear Telegram Token' })).toBeDisabled()
  })

  test('opens agent-awareness Codex details from the Plugins pane with the demo API', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('openpet.controlCenter.demoState', JSON.stringify({
        plugins: [
          {
            id: 'openpet.agent-awareness',
            name: 'Agent Awareness',
            version: '0.1.0',
            source: 'local',
            enabled: true,
            runnable: true,
            requiresNativeExecution: true,
            nativeExecutionApproved: true,
            permissions: ['pet:say', 'pet:event'],
            commands: [
              { id: 'doctor', title: 'Check Agent Awareness Setup' }
            ],
            entries: {
              commands: [
                { id: 'doctor', title: 'Check Agent Awareness Setup', command: 'node ./commands/doctor.js', cwd: '.' }
              ],
              setup: [],
              services: [
                {
                  id: 'agent-awareness',
                  title: 'Agent Awareness Service',
                  command: 'node ./service/agent-awareness-service.js',
                  cwd: '.',
                  health: { type: 'http', url: 'http://127.0.0.1:8795/health' },
                  runtime: {
                    status: 'running',
                    pid: 4321,
                    startedAt: '2026-07-05T10:00:00.000Z',
                    health: {
                      status: 'healthy',
                      checkedAt: '2026-07-05T10:00:00.000Z',
                      url: 'http://127.0.0.1:8795/health',
                      statusCode: 200,
                      message: '1 active · 8 sessions · 320 events'
                    }
                  },
                  healthPolicy: {
                    enabled: false,
                    intervalMs: 30000
                  }
                }
              ],
              dashboards: [
                { id: 'main', title: 'Agent Awareness', url: 'http://127.0.0.1:8795' }
              ]
            },
            configSchema: {
              title: 'Agent Awareness',
              properties: [
                {
                  key: 'autoStartOnCodexSignal',
                  title: 'Auto-start on Codex signal',
                  type: 'boolean',
                  required: false
                }
              ]
            },
            config: {
              autoStartOnCodexSignal: true
            },
            storage: { keyCount: 1, byteSize: 256, valid: true },
            signatureStatus: {
              status: 'bundled',
              label: 'Bundled plugin',
              signer: 'openpet',
              algorithm: '',
              verified: true,
              errors: []
            },
            blockStatus: { blocked: false, reasons: [] }
          }
        ],
        pluginLogs: []
      }))
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Plugins' }).click()

    const pluginRow = page.locator('.plugin-row', { hasText: 'Agent Awareness' })
    await expect(pluginRow.getByRole('button', { name: '查看 Codex 详情' })).toBeEnabled()

    await pluginRow.getByRole('button', { name: '查看 Codex 详情' }).click()

    await expect(page.locator('.status-line')).toContainText('Codex 详情已打开')
    await expect(page.locator('.plugin-log-row', { hasText: 'Dashboard opened' })).toContainText('dashboard:main')
    await expect(page.locator('.plugin-log-row', { hasText: 'Dashboard opened' })).toContainText('openpet.agent-awareness')
  })

  test('opens the Creator Studio dashboard entry from the Plugins pane with the demo API', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('openpet.controlCenter.demoState', JSON.stringify({
        plugins: [
          {
            id: 'openpet.creator-studio',
            name: 'Creator Studio',
            version: '1.0.0',
            source: 'local',
            enabled: true,
            runnable: true,
            nativeExecutionApproved: true,
            permissions: ['pet:say', 'storage'],
            commands: [
              { id: 'draft-task', title: 'Draft Creator Task' },
              { id: 'import-approved-pet', title: 'Import Approved Pet' }
            ],
            entries: {
              setup: [],
              commands: [
                { id: 'draft-task', title: 'Draft Creator Task', command: 'node ./commands/draft-task.js', cwd: '.' },
                { id: 'import-approved-pet', title: 'Import Approved Pet', command: 'node ./commands/import-approved-pet.js', cwd: '.' }
              ],
              services: [
                {
                  id: 'studio',
                  title: 'Creator Studio Service',
                  command: 'node ./service/studio-service.js',
                  cwd: '.',
                  health: { type: 'http', url: 'http://127.0.0.1:8794/health' },
                  runtime: {
                    status: 'running',
                    pid: 4321,
                    startedAt: '2026-06-28T10:00:00.000Z',
                    health: { status: 'healthy', url: 'http://127.0.0.1:8794/health' }
                  }
                }
              ],
              dashboards: [
                { id: 'main', title: 'Creator Studio', url: 'http://127.0.0.1:8794' }
              ]
            },
            configSchema: { properties: [] },
            config: {},
            storage: { keyCount: 0, byteSize: 2, valid: true },
            signatureStatus: { label: 'Unsigned local demo' }
          }
        ]
      }))
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Plugins' }).click()

    const pluginRow = page.locator('.plugin-row', { hasText: 'Creator Studio' })
    await expect(pluginRow).toContainText('openpet.creator-studio')
    await expect(pluginRow).toContainText('Dashboard entries')
    await expect(pluginRow).toContainText('main')

    await pluginRow.getByRole('button', { name: '查看任务详情' }).click()

    await expect(page.locator('.status-line')).toContainText('Dashboard 已打开')
    await expect(page.locator('.plugin-log-row', { hasText: 'Dashboard opened' })).toContainText('dashboard:main')
    await expect(page.locator('.plugin-log-row', { hasText: 'Dashboard opened' })).toContainText('openpet.creator-studio')
  })

  test('guides users to start the Creator Studio service before opening its dashboard in the demo API', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('openpet.controlCenter.demoState', JSON.stringify({
        plugins: [
          {
            id: 'openpet.creator-studio',
            name: 'Creator Studio',
            version: '1.0.0',
            source: 'local',
            enabled: true,
            runnable: true,
            nativeExecutionApproved: true,
            permissions: ['pet-pack:import', 'model:image-generate', 'assets:generate', 'trigger-proposals:write'],
            commands: [
              { id: 'draft-task', title: 'Draft Creator Task' }
            ],
            entries: {
              setup: [],
              commands: [
                { id: 'draft-task', title: 'Draft Creator Task', command: 'node ./commands/draft-task.js', cwd: '.' }
              ],
              services: [
                {
                  id: 'studio',
                  title: 'Creator Studio Service',
                  command: 'node ./service/studio-service.js',
                  cwd: '.',
                  health: { type: 'http', url: 'http://127.0.0.1:8794/health' },
                  runtime: {
                    status: 'stopped',
                    health: { status: 'unknown', url: 'http://127.0.0.1:8794/health' }
                  }
                }
              ],
              dashboards: [
                { id: 'main', title: 'Creator Studio', url: 'http://127.0.0.1:8794' }
              ]
            },
            configSchema: { properties: [] },
            config: {},
            storage: { keyCount: 0, byteSize: 2, valid: true },
            signatureStatus: { label: 'Unsigned local demo' }
          }
        ]
      }))
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Plugins' }).click()

    const pluginRow = page.locator('.plugin-row', { hasText: 'Creator Studio' })
    await openPluginManagement(pluginRow)
    const serviceControl = pluginRow.locator('.plugin-service-control', { hasText: 'Creator Studio Service' })

    await expect(serviceControl).toContainText('Service status: stopped')
    await pluginRow.getByRole('button', { name: '查看任务详情' }).click()
    await expect(page.locator('.status-line')).toContainText('请先启动 Creator Studio Service，再打开 Creator Studio Dashboard')
    await expect(page.locator('.plugin-log-row', { hasText: 'Dashboard opened' })).toHaveCount(0)

    await serviceControl.getByRole('button', { name: 'Start Creator Studio Service' }).click()
    await expect(page.locator('.status-line')).toContainText('Service 已启动')
    await expect(serviceControl).toContainText('Service status: running')

    await pluginRow.getByRole('button', { name: '查看任务详情' }).click()
    await expect(page.locator('.status-line')).toContainText('Dashboard 已打开')
    await expect(page.locator('.plugin-log-row', { hasText: 'Dashboard opened' })).toContainText('dashboard:main')
  })

  test('surfaces plugin service health loopback validation errors in the demo API', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('openpet.controlCenter.demoState', JSON.stringify({
        plugins: [
          {
            id: 'openpet.demo.remote-health',
            name: 'Remote Health Demo',
            version: '1.0.0',
            source: 'local',
            enabled: true,
            runnable: true,
            permissions: [],
            commands: [],
            entries: {
              setup: [],
              commands: [],
              services: [
                {
                  id: 'remote-health',
                  title: 'Remote Health Service',
                  command: 'node ./service/remote-health.js',
                  cwd: '.',
                  health: { type: 'http', url: 'https://api.example.com/health' },
                  runtime: {
                    status: 'stopped',
                    health: { status: 'unknown', url: 'https://api.example.com/health', message: '' }
                  },
                  healthPolicy: {
                    enabled: false,
                    intervalMs: 30000
                  }
                }
              ],
              dashboards: []
            },
            configSchema: { properties: [] },
            config: {},
            storage: { keyCount: 0, byteSize: 2, valid: true },
            signatureStatus: { label: 'Unsigned local demo' }
          }
        ],
        pluginLogs: []
      }))
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Plugins' }).click()

    const pluginRow = page.locator('.plugin-row', { hasText: 'Remote Health Demo' })
    await openPluginManagement(pluginRow)
    const serviceControl = pluginRow.locator('.plugin-service-control', { hasText: 'Remote Health Service' })

    await expect(serviceControl).toContainText('Health: unknown')
    await serviceControl.getByRole('button', { name: 'Check Remote Health Service Health' }).click()

    await expect(page.locator('.status-line')).toContainText('Plugin service health URL must use a loopback host')
    await expect(serviceControl).toContainText('Health: unknown')
    await expect(page.locator('.plugin-log-row', { hasText: 'Plugin service health URL must use a loopback host' })).toContainText('service:remote-health')
  })

  test('shows structured Creator Studio command results in the Plugins pane with the demo API', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('openpet.controlCenter.demoState', JSON.stringify({
        plugins: [
          {
            id: 'openpet.creator-studio',
            name: 'Creator Studio',
            version: '1.0.0',
            source: 'local',
            enabled: true,
            runnable: true,
            nativeExecutionApproved: true,
            permissions: ['pet:say', 'storage'],
            commands: [
              { id: 'import-approved-pet', title: 'Import Approved Pet' }
            ],
            entries: {
              setup: [],
              commands: [
                { id: 'import-approved-pet', title: 'Import Approved Pet', command: 'node ./commands/import-approved-pet.js', cwd: '.' }
              ],
              services: [],
              dashboards: []
            },
            configSchema: { properties: [] },
            config: {},
            storage: { keyCount: 0, byteSize: 2, valid: true },
            signatureStatus: { label: 'Unsigned local demo' }
          }
        ]
      }))
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Plugins' }).click()

    const pluginRow = page.locator('.plugin-row', { hasText: 'Creator Studio' })
    await openPluginManagement(pluginRow)
    await pluginRow.getByLabel('可选命令 Payload JSON').fill('{"runId":"run-demo-creator-123"}')
    await pluginRow.getByRole('button', { name: 'Import Approved Pet' }).click()

    await expect(page.locator('.status-line')).toContainText('Imported run run-demo-creator-123')
    await expect(pluginRow).toContainText('最近命令结果')
    await expect(pluginRow).toContainText('import-approved-pet · exit 0')
    await expect(pluginRow).toContainText('Run')
    await expect(pluginRow).toContainText('run-demo-creator-123')
    await expect(pluginRow).toContainText('状态')
    await expect(pluginRow).toContainText('imported')
    await expect(pluginRow).toContainText('步骤')
    await expect(pluginRow).toContainText('已导入 Pack')
    await expect(pluginRow).toContainText('creator-studio-pet')
    await expect(pluginRow).toContainText('输出目录')
    await expect(pluginRow).toContainText('/tmp/openpet/runs/run-demo-creator-123/outputs')
    await expect(pluginRow).toContainText('导出包')
    await expect(pluginRow).toContainText('creator-studio-pet.codex-pet.zip')
  })

  test('shows structured Creator Studio action import results in the Plugins pane with the demo API', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('openpet.controlCenter.demoState', JSON.stringify({
        plugins: [
          {
            id: 'openpet.creator-studio',
            name: 'Creator Studio',
            version: '1.0.0',
            source: 'local',
            enabled: true,
            runnable: true,
            nativeExecutionApproved: true,
            permissions: ['pet:say', 'storage'],
            commands: [
              { id: 'import-approved-action', title: 'Import Approved Action' }
            ],
            entries: {
              setup: [],
              commands: [
                { id: 'import-approved-action', title: 'Import Approved Action', command: 'node ./commands/import-approved-action.js', cwd: '.' }
              ],
              services: [],
              dashboards: []
            },
            configSchema: { properties: [] },
            config: {},
            storage: { keyCount: 0, byteSize: 2, valid: true },
            signatureStatus: { label: 'Unsigned local demo' }
          }
        ]
      }))
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Plugins' }).click()

    const pluginRow = page.locator('.plugin-row', { hasText: 'Creator Studio' })
    await openPluginManagement(pluginRow)
    await pluginRow.getByLabel('可选命令 Payload JSON').fill('{"runId":"run-demo-action-123"}')
    await pluginRow.getByRole('button', { name: 'Import Approved Action' }).click()

    await expect(page.locator('.status-line')).toContainText('Imported action shy-spin from run run-demo-action-123')
    await expect(pluginRow).toContainText('最近命令结果')
    await expect(pluginRow).toContainText('import-approved-action · exit 0')
    await expect(pluginRow).toContainText('Run')
    await expect(pluginRow).toContainText('run-demo-action-123')
    await expect(pluginRow).toContainText('已导入动作')
    await expect(pluginRow).toContainText('shy-spin')
    await expect(pluginRow).toContainText('动作目录')
    await expect(pluginRow).toContainText('/tmp/openpet/runs/run-demo-action-123/frames/actions/shy-spin')
    await expect(pluginRow).toContainText('入队状态')
    await expect(pluginRow).toContainText('已提交')
    await expect(pluginRow).toContainText('proposal:click:shy-spin:test')
  })

  test('shows a host-owned Creator Studio generation and review entry in the Plugins pane', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('openpet.controlCenter.demoState', JSON.stringify({
        imageGenerationConfig: {
          provider: 'openai-compatible',
          baseUrl: 'https://healthy-models.example.test/v1',
          model: 'gpt-image-2',
          timeoutMs: 45000,
          maxConcurrentJobs: 2,
          apiKeyRef: 'image-provider-key',
          hasApiKey: true,
          apiKeyPreview: 'sk-demo'
        },
        plugins: [
          {
            id: 'openpet.creator-studio',
            name: 'Creator Studio',
            version: '1.0.0',
            source: 'local',
            enabled: true,
            runnable: true,
            nativeExecutionApproved: true,
            permissions: ['model:image-generate', 'pet-pack:import', 'assets:generate', 'trigger-proposals:write'],
            commands: [
              { id: 'draft-task', title: 'Draft Creator Task' },
              { id: 'import-approved-action', title: 'Import Approved Action' }
            ],
            entries: {
              setup: [],
              commands: [
                { id: 'draft-task', title: 'Draft Creator Task', command: 'node ./commands/draft-task.js', cwd: '.' },
                { id: 'import-approved-action', title: 'Import Approved Action', command: 'node ./commands/import-approved-action.js', cwd: '.' }
              ],
              services: [
                {
                  id: 'studio',
                  title: 'Creator Studio Service',
                  command: 'node ./service/studio-service.js',
                  cwd: '.',
                  health: { type: 'http', url: 'http://127.0.0.1:8794/health' },
                  runtime: {
                    status: 'running',
                    pid: 4321,
                    startedAt: '2026-06-29T10:00:00.000Z',
                    health: { status: 'healthy', url: 'http://127.0.0.1:8794/health' }
                  }
                }
              ],
              dashboards: [
                { id: 'main', title: 'Creator Studio', url: 'http://127.0.0.1:8794' }
              ]
            },
            configSchema: { properties: [] },
            config: {},
            storage: { keyCount: 0, byteSize: 2, valid: true },
            signatureStatus: { label: 'Unsigned local demo' }
          }
        ]
      }))
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Plugins' }).click()

    const pluginRow = page.locator('.plugin-row', { hasText: 'Creator Studio' })
    await expect(pluginRow.getByLabel('Creator Studio 请求')).toBeVisible()
    await expect(pluginRow.getByRole('button', { name: '开始生成' })).toBeVisible()
    await expect(pluginRow).toContainText('管理与诊断')
    await expect(pluginRow).toContainText('查看任务详情')
  })

  test('blocks host-owned Creator Studio generation when the saved image provider is not configured', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('openpet.controlCenter.demoState', JSON.stringify({
        imageGenerationConfig: {
          provider: 'openai-compatible',
          baseUrl: 'https://image.example.test/v1',
          model: 'gpt-image-2',
          timeoutMs: 45000,
          maxConcurrentJobs: 2,
          apiKeyRef: '',
          hasApiKey: false,
          apiKeyPreview: ''
        },
        plugins: [
          {
            id: 'openpet.creator-studio',
            name: 'Creator Studio',
            version: '1.0.0',
            source: 'local',
            enabled: true,
            runnable: true,
            nativeExecutionApproved: true,
            permissions: ['model:image-generate', 'pet-pack:import', 'assets:generate', 'trigger-proposals:write'],
            commands: [
              { id: 'draft-task', title: 'Draft Creator Task' }
            ],
            entries: {
              setup: [],
              commands: [
                { id: 'draft-task', title: 'Draft Creator Task', command: 'node ./commands/draft-task.js', cwd: '.' }
              ],
              services: [
                {
                  id: 'studio',
                  title: 'Creator Studio Service',
                  command: 'node ./service/studio-service.js',
                  cwd: '.',
                  health: { type: 'http', url: 'http://127.0.0.1:8794/health' },
                  runtime: {
                    status: 'running',
                    pid: 4321,
                    startedAt: '2026-06-29T10:00:00.000Z',
                    health: { status: 'healthy', url: 'http://127.0.0.1:8794/health' }
                  }
                }
              ],
              dashboards: [
                { id: 'main', title: 'Creator Studio', url: 'http://127.0.0.1:8794' }
              ]
            },
            configSchema: { properties: [] },
            config: {},
            storage: { keyCount: 0, byteSize: 2, valid: true },
            signatureStatus: { label: 'Unsigned local demo' }
          }
        ]
      }))
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Plugins' }).click()

    const pluginRow = page.locator('.plugin-row', { hasText: 'Creator Studio' })
    await pluginRow.getByLabel('Creator Studio 请求').fill('给当前猫猫新增一个转圈动作')
    await pluginRow.getByRole('button', { name: '开始生成' }).click()

    await expect(page.locator('.status-line')).toContainText('请先到 AI -> 模型 Provider -> 图片模型配置并保存可用模型')
    await expect(pluginRow).not.toContainText('最近命令结果')
  })

  test('blocks host-owned Creator Studio generation when native execution is not approved', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('openpet.controlCenter.demoState', JSON.stringify({
        imageGenerationConfig: {
          provider: 'openai-compatible',
          baseUrl: 'https://healthy-models.example.test/v1',
          model: 'gpt-image-2',
          timeoutMs: 45000,
          maxConcurrentJobs: 2,
          apiKeyRef: 'image-provider-key',
          hasApiKey: true,
          apiKeyPreview: 'sk-demo'
        },
        plugins: [
          {
            id: 'openpet.creator-studio',
            name: 'Creator Studio',
            version: '1.0.0',
            source: 'local',
            enabled: true,
            runnable: true,
            requiresNativeExecution: true,
            nativeExecutionApproved: false,
            permissions: ['model:image-generate', 'pet-pack:import', 'assets:generate', 'trigger-proposals:write'],
            commands: [
              { id: 'draft-task', title: 'Draft Creator Task' }
            ],
            entries: {
              setup: [],
              commands: [
                { id: 'draft-task', title: 'Draft Creator Task', command: 'node ./commands/draft-task.js', cwd: '.' }
              ],
              services: [
                {
                  id: 'studio',
                  title: 'Creator Studio Service',
                  command: 'node ./service/studio-service.js',
                  cwd: '.',
                  health: { type: 'http', url: 'http://127.0.0.1:8794/health' },
                  runtime: {
                    status: 'running',
                    pid: 4321,
                    startedAt: '2026-06-29T10:00:00.000Z',
                    health: { status: 'healthy', url: 'http://127.0.0.1:8794/health' }
                  }
                }
              ],
              dashboards: [
                { id: 'main', title: 'Creator Studio', url: 'http://127.0.0.1:8794' }
              ]
            },
            configSchema: { properties: [] },
            config: {},
            storage: { keyCount: 0, byteSize: 2, valid: true },
            signatureStatus: { label: 'Unsigned local demo' }
          }
        ]
      }))
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Plugins' }).click()

    const pluginRow = page.locator('.plugin-row', { hasText: 'Creator Studio' })
    await pluginRow.getByLabel('Creator Studio 请求').fill('给当前猫猫新增一个动作')
    await pluginRow.getByRole('button', { name: '开始生成' }).click()

    await expect(page.locator('.status-line')).toContainText('Plugin native execution is not approved')
    await expect(pluginRow).not.toContainText('最近命令结果')
  })

  test('runs the host-owned Creator Studio generation flow to explicit human review in the demo API', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('openpet.controlCenter.demoState', JSON.stringify({
        imageGenerationConfig: {
          provider: 'openai-compatible',
          baseUrl: 'https://healthy-models.example.test/v1',
          model: 'gpt-image-2',
          timeoutMs: 45000,
          maxConcurrentJobs: 2,
          apiKeyRef: 'image-provider-key',
          hasApiKey: true,
          apiKeyPreview: 'sk-demo'
        },
        plugins: [
          {
            id: 'openpet.creator-studio',
            name: 'Creator Studio',
            version: '1.0.0',
            source: 'local',
            enabled: true,
            runnable: true,
            nativeExecutionApproved: true,
            permissions: ['model:image-generate', 'pet-pack:import', 'assets:generate', 'trigger-proposals:write'],
            commands: [
              { id: 'draft-task', title: 'Draft Creator Task' },
              { id: 'answer-question', title: 'Answer Question' },
              { id: 'confirm-task', title: 'Confirm Task' },
              { id: 'run-step', title: 'Run Step' },
              { id: 'approve-run', title: 'Approve Run' },
              { id: 'import-approved-action', title: 'Import Approved Action' }
            ],
            entries: {
              setup: [],
              commands: [
                { id: 'draft-task', title: 'Draft Creator Task', command: 'node ./commands/draft-task.js', cwd: '.' },
                { id: 'answer-question', title: 'Answer Question', command: 'node ./commands/answer-question.js', cwd: '.' },
                { id: 'confirm-task', title: 'Confirm Task', command: 'node ./commands/confirm-task.js', cwd: '.' },
                { id: 'run-step', title: 'Run Step', command: 'node ./commands/run-step.js', cwd: '.' },
                { id: 'approve-run', title: 'Approve Run', command: 'node ./commands/approve-run.js', cwd: '.' },
                { id: 'import-approved-action', title: 'Import Approved Action', command: 'node ./commands/import-approved-action.js', cwd: '.' }
              ],
              services: [
                {
                  id: 'studio',
                  title: 'Creator Studio Service',
                  command: 'node ./service/studio-service.js',
                  cwd: '.',
                  health: { type: 'http', url: 'http://127.0.0.1:8794/health' },
                  runtime: {
                    status: 'running',
                    pid: 4321,
                    startedAt: '2026-06-29T10:00:00.000Z',
                    health: { status: 'healthy', url: 'http://127.0.0.1:8794/health' }
                  }
                }
              ],
              dashboards: [
                { id: 'main', title: 'Creator Studio', url: 'http://127.0.0.1:8794' }
              ]
            },
            configSchema: { properties: [] },
            config: {},
            storage: { keyCount: 0, byteSize: 2, valid: true },
            signatureStatus: { label: 'Unsigned local demo' }
          }
        ]
      }))
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Plugins' }).click()

    const pluginRow = page.locator('.plugin-row', { hasText: 'Creator Studio' })
    await pluginRow.getByLabel('Creator Studio 请求').fill('给当前猫猫新增一个害羞转圈动作')
    await pluginRow.getByRole('button', { name: '开始生成' }).click()

    await expect(page.locator('.status-line')).toContainText('run run-demo-action-123 正在等待人工复查')
    await expect(pluginRow).toContainText('最近命令结果')
    await expect(pluginRow).toContainText('run-step · exit 0')
    await expect(pluginRow).toContainText('run-demo-action-123')
    await expect(pluginRow).toContainText('ready_for_review')
    await expect(pluginRow).not.toContainText('已导入动作')
    await expect(pluginRow).not.toContainText('入队状态')
  })

  test('routes failed host-owned Creator Studio generation runs to the advanced details path', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('openpet.controlCenter.demoState', JSON.stringify({
        imageGenerationConfig: {
          provider: 'openai-compatible',
          baseUrl: 'https://healthy-models.example.test/v1',
          model: 'gpt-image-2',
          timeoutMs: 45000,
          maxConcurrentJobs: 2,
          apiKeyRef: 'image-provider-key',
          hasApiKey: true,
          apiKeyPreview: 'sk-demo'
        },
        plugins: [
          {
            id: 'openpet.creator-studio',
            name: 'Creator Studio',
            version: '1.0.0',
            source: 'local',
            enabled: true,
            runnable: true,
            nativeExecutionApproved: true,
            permissions: ['model:image-generate', 'pet-pack:import', 'assets:generate', 'trigger-proposals:write'],
            commands: [
              { id: 'draft-task', title: 'Draft Creator Task' },
              { id: 'answer-question', title: 'Answer Question' },
              { id: 'confirm-task', title: 'Confirm Task' },
              { id: 'run-step', title: 'Run Step' },
              { id: 'approve-run', title: 'Approve Run' },
              { id: 'import-approved-action', title: 'Import Approved Action' }
            ],
            entries: {
              setup: [],
              commands: [
                { id: 'draft-task', title: 'Draft Creator Task', command: 'node ./commands/draft-task.js', cwd: '.' },
                { id: 'answer-question', title: 'Answer Question', command: 'node ./commands/answer-question.js', cwd: '.' },
                { id: 'confirm-task', title: 'Confirm Task', command: 'node ./commands/confirm-task.js', cwd: '.' },
                { id: 'run-step', title: 'Run Step', command: 'node ./commands/run-step.js', cwd: '.' },
                { id: 'approve-run', title: 'Approve Run', command: 'node ./commands/approve-run.js', cwd: '.' },
                { id: 'import-approved-action', title: 'Import Approved Action', command: 'node ./commands/import-approved-action.js', cwd: '.' }
              ],
              services: [
                {
                  id: 'studio',
                  title: 'Creator Studio Service',
                  command: 'node ./service/studio-service.js',
                  cwd: '.',
                  health: { type: 'http', url: 'http://127.0.0.1:8794/health' },
                  runtime: {
                    status: 'running',
                    pid: 4321,
                    startedAt: '2026-06-29T10:00:00.000Z',
                    health: { status: 'healthy', url: 'http://127.0.0.1:8794/health' }
                  }
                }
              ],
              dashboards: [
                { id: 'main', title: 'Creator Studio', url: 'http://127.0.0.1:8794' }
              ]
            },
            configSchema: { properties: [] },
            config: {},
            storage: { keyCount: 0, byteSize: 2, valid: true },
            signatureStatus: { label: 'Unsigned local demo' }
          }
        ]
      }))
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Plugins' }).click()

    const pluginRow = page.locator('.plugin-row', { hasText: 'Creator Studio' })
    await pluginRow.getByLabel('Creator Studio 请求').fill('让这个动作失败并进入高级详情')
    await pluginRow.getByRole('button', { name: '开始生成' }).click()

    await expect(page.locator('.status-line')).toContainText('run-demo-action-fail')
    await expect(page.locator('.status-line')).toContainText('查看任务详情')

    await pluginRow.getByRole('button', { name: '查看任务详情' }).click()
    await expect(page.locator('.status-line')).toContainText('Dashboard 已打开')
    await expect(page.locator('.status-line')).toContainText('run-demo-action-fail')
  })

  test('keeps Creator Studio trigger handoff out of the default flow until human review', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('openpet.controlCenter.demoState', JSON.stringify({
        imageGenerationConfig: {
          provider: 'openai-compatible',
          baseUrl: 'https://healthy-models.example.test/v1',
          model: 'gpt-image-2',
          timeoutMs: 45000,
          maxConcurrentJobs: 2,
          apiKeyRef: 'image-provider-key',
          hasApiKey: true,
          apiKeyPreview: 'sk-demo'
        },
        plugins: [
          {
            id: 'openpet.creator-studio',
            name: 'Creator Studio',
            version: '1.0.0',
            source: 'local',
            enabled: true,
            runnable: true,
            nativeExecutionApproved: true,
            permissions: ['model:image-generate', 'pet-pack:import', 'assets:generate', 'trigger-proposals:write'],
            commands: [
              { id: 'draft-task', title: 'Draft Creator Task' },
              { id: 'answer-question', title: 'Answer Question' },
              { id: 'confirm-task', title: 'Confirm Task' },
              { id: 'run-step', title: 'Run Step' },
              { id: 'approve-run', title: 'Approve Run' },
              { id: 'import-approved-action', title: 'Import Approved Action' }
            ],
            entries: {
              setup: [],
              commands: [
                { id: 'draft-task', title: 'Draft Creator Task', command: 'node ./commands/draft-task.js', cwd: '.' },
                { id: 'answer-question', title: 'Answer Question', command: 'node ./commands/answer-question.js', cwd: '.' },
                { id: 'confirm-task', title: 'Confirm Task', command: 'node ./commands/confirm-task.js', cwd: '.' },
                { id: 'run-step', title: 'Run Step', command: 'node ./commands/run-step.js', cwd: '.' },
                { id: 'approve-run', title: 'Approve Run', command: 'node ./commands/approve-run.js', cwd: '.' },
                { id: 'import-approved-action', title: 'Import Approved Action', command: 'node ./commands/import-approved-action.js', cwd: '.' }
              ],
              services: [
                {
                  id: 'studio',
                  title: 'Creator Studio Service',
                  command: 'node ./service/studio-service.js',
                  cwd: '.',
                  health: { type: 'http', url: 'http://127.0.0.1:8794/health' },
                  runtime: {
                    status: 'running',
                    pid: 4321,
                    startedAt: '2026-06-29T10:00:00.000Z',
                    health: { status: 'healthy', url: 'http://127.0.0.1:8794/health' }
                  }
                }
              ],
              dashboards: [
                { id: 'main', title: 'Creator Studio', url: 'http://127.0.0.1:8794' }
              ]
            },
            configSchema: { properties: [] },
            config: {},
            storage: { keyCount: 0, byteSize: 2, valid: true },
            signatureStatus: { label: 'Unsigned local demo' }
          }
        ]
      }))
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Plugins' }).click()

    const pluginRow = page.locator('.plugin-row', { hasText: 'Creator Studio' })
    await pluginRow.getByLabel('Creator Studio 请求').fill('让这个动作触发交接失败并进入高级详情')
    await pluginRow.getByRole('button', { name: '开始生成' }).click()

    await expect(page.locator('.status-line')).toContainText('run-demo-action-trigger-handoff-fail')
    await expect(page.locator('.status-line')).toContainText('等待人工复查')
    await expect(pluginRow).toContainText('run-step · exit 0')
    await expect(pluginRow).toContainText('ready_for_review')
    await expect(pluginRow).not.toContainText('触发建议交接')

    await pluginRow.getByRole('button', { name: '查看任务详情' }).click()
    await expect(page.locator('.status-line')).toContainText('Dashboard 已打开')
    await expect(page.locator('.status-line')).toContainText('run-demo-action-trigger-handoff-fail')
  })

  test('redacts sensitive Creator Studio action import handoff failures in the Plugins pane with the demo API', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('openpet.controlCenter.demoState', JSON.stringify({
        plugins: [
          {
            id: 'openpet.creator-studio',
            name: 'Creator Studio',
            version: '1.0.0',
            source: 'local',
            enabled: true,
            runnable: true,
            nativeExecutionApproved: true,
            permissions: ['pet:say', 'storage'],
            commands: [
              { id: 'import-approved-action', title: 'Import Approved Action' }
            ],
            entries: {
              setup: [],
              commands: [
                { id: 'import-approved-action', title: 'Import Approved Action', command: 'node ./commands/import-approved-action.js', cwd: '.' }
              ],
              services: [],
              dashboards: []
            },
            configSchema: { properties: [] },
            config: {},
            storage: { keyCount: 0, byteSize: 2, valid: true },
            signatureStatus: { label: 'Unsigned local demo' }
          }
        ]
      }))
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Plugins' }).click()

    const pluginRow = page.locator('.plugin-row', { hasText: 'Creator Studio' })
    await openPluginManagement(pluginRow)
    await pluginRow.getByLabel('可选命令 Payload JSON').fill('{"runId":"run-demo-action-456","triggerProposalFailure":true}')
    await pluginRow.getByRole('button', { name: 'Import Approved Action' }).click()

    await expect(page.locator('.status-line')).toContainText('Imported action shy-spin from run run-demo-action-456')
    await expect(pluginRow).toContainText('触发建议')
    await expect(pluginRow).toContainText('failed')
    await expect(pluginRow).toContainText('[redacted-token]')
    await expect(pluginRow).toContainText('[redacted-path]')
    await expect(pluginRow).toContainText('[redacted-local-url]')
    await expect(pluginRow).not.toContainText('bridge-secret')
    await expect(pluginRow).not.toContainText('/Users/mango/private/proposal.json')
    await expect(pluginRow).not.toContainText('127.0.0.1:8787')
  })

  test('shows missing Creator Studio trigger handoff records in the Plugins pane with the demo API', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('openpet.controlCenter.demoState', JSON.stringify({
        plugins: [
          {
            id: 'openpet.creator-studio',
            name: 'Creator Studio',
            version: '1.0.0',
            source: 'local',
            enabled: true,
            runnable: true,
            nativeExecutionApproved: true,
            permissions: ['pet:say', 'storage'],
            commands: [
              { id: 'import-approved-action', title: 'Import Approved Action' }
            ],
            entries: {
              setup: [],
              commands: [
                { id: 'import-approved-action', title: 'Import Approved Action', command: 'node ./commands/import-approved-action.js', cwd: '.' }
              ],
              services: [],
              dashboards: []
            },
            configSchema: { properties: [] },
            config: {},
            storage: { keyCount: 0, byteSize: 2, valid: true },
            signatureStatus: { label: 'Unsigned local demo' }
          }
        ]
      }))
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Plugins' }).click()

    const pluginRow = page.locator('.plugin-row', { hasText: 'Creator Studio' })
    await openPluginManagement(pluginRow)
    await pluginRow.getByLabel('可选命令 Payload JSON').fill('{"runId":"run-demo-action-789","triggerProposalMissingRecord":true}')
    await pluginRow.getByRole('button', { name: 'Import Approved Action' }).click()

    await expect(page.locator('.status-line')).toContainText('Imported action shy-spin from run run-demo-action-789')
    await expect(pluginRow).toContainText('最近命令结果')
    await expect(pluginRow).toContainText('import-approved-action · exit 0')
    await expect(pluginRow).toContainText('触发建议')
    await expect(pluginRow).toContainText('未保存交接记录')
    await expect(pluginRow).toContainText('no trigger proposal handoff record was saved')
  })
})
