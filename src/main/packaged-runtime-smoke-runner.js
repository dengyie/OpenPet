const fs = require('fs')
const path = require('path')
const { IPC } = require('../shared/ipc-channels')

const BUILT_IN_PACKS = ['legacy-cat', 'doro', 'duodong', 'chispa']
const DEFAULT_TIMEOUT_MS = 12000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const isSmokeEnabled = (env = process.env) => env.OPENPET_PACKAGED_RUNTIME_SMOKE === '1'

const ensureParentDir = (filePath) => {
  if (!filePath) return
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true })
}

const writeJson = (filePath, value) => {
  ensureParentDir(filePath)
  fs.writeFileSync(path.resolve(filePath), `${JSON.stringify(value, null, 2)}\n`)
}

const writeScreenshot = async (petWindow, screenshotPath) => {
  if (!screenshotPath) return ''
  ensureParentDir(screenshotPath)
  const image = await petWindow.capturePage()
  fs.writeFileSync(path.resolve(screenshotPath), image.toPNG())
  return path.resolve(screenshotPath)
}

const summarizeBubbleChatItems = (items = []) => (
  (Array.isArray(items) ? items : [])
    .filter((item) => item && typeof item === 'object')
    .slice(-6)
    .map((item) => ({
      kind: String(item.kind || ''),
      role: String(item.role || ''),
      source: String(item.source || ''),
      text: String(item.text || '')
    }))
)

const inspectRenderer = async (petWindow) => petWindow.webContents.executeJavaScript(`(() => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const transparentColors = new Set(['transparent', 'rgba(0, 0, 0, 0)']);
  const cat = document.getElementById('cat');
  const bubble = document.getElementById('bubble');
  const bodyStyle = getComputedStyle(document.body);
  const htmlStyle = getComputedStyle(document.documentElement);
  const catStyle = cat ? getComputedStyle(cat) : null;
  const firstPosition = catStyle?.backgroundPositionX || '';
  return sleep(260).then(() => {
    const nextCatStyle = cat ? getComputedStyle(cat) : null;
    const rect = cat ? cat.getBoundingClientRect() : { width: 0, height: 0 };
    const legacyBubbleRect = bubble ? bubble.getBoundingClientRect() : { width: 0, height: 0 };
    const legacyBubbleStyle = bubble ? getComputedStyle(bubble) : null;
    const bodyBackground = bodyStyle.backgroundColor || bodyStyle.background || '';
    const htmlBackground = htmlStyle.backgroundColor || htmlStyle.background || '';
    const backgroundImage = nextCatStyle?.backgroundImage || '';
    const secondPosition = nextCatStyle?.backgroundPositionX || '';
    return {
      ok: Boolean(cat && bubble),
      bodyBackground,
      htmlBackground,
      transparentBackground: transparentColors.has(bodyBackground) && transparentColors.has(htmlBackground),
      sprite: {
        visible: Boolean(cat && rect.width > 0 && rect.height > 0 && backgroundImage && backgroundImage !== 'none'),
        width: Math.round(rect.width || 0),
        height: Math.round(rect.height || 0),
        backgroundImage
      },
      legacyInlineBubble: {
        visible: Boolean(bubble && legacyBubbleStyle && Number(legacyBubbleStyle.opacity) > 0 && legacyBubbleRect.width > 0 && legacyBubbleRect.height > 0),
        text: bubble?.textContent || ''
      },
      action: {
        current: '',
        firstPosition,
        secondPosition,
        advanced: firstPosition !== secondPosition
      }
    };
  });
})()`, true)

const waitForSprite = async (petWindow, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const startedAt = Date.now()
  let last = null
  while (Date.now() - startedAt < timeoutMs) {
    last = await inspectRenderer(petWindow)
    if (last.sprite?.visible) return last
    await sleep(150)
  }
  return last || { ok: false, sprite: { visible: false } }
}

const sendAnimations = (petWindow, petService) => {
  const animations = petService.reloadAnimations()
  petWindow.webContents.send(IPC.PET_ANIMATIONS_CHANGED, animations)
  return animations
}

const collectPackEvidence = async ({ petWindow, petService, petPackService }) => {
  const results = []
  for (const packId of BUILT_IN_PACKS) {
    try {
      petPackService.setActivePack(packId)
      const animations = sendAnimations(petWindow, petService)
      const renderer = await waitForSprite(petWindow)
      results.push({
        id: packId,
        ok: Boolean(renderer.sprite?.visible && animations.actions?.length),
        actionCount: animations.actions?.length || 0,
        defaultAction: animations.defaultAction || '',
        spriteVisible: Boolean(renderer.sprite?.visible),
        spriteSize: { width: renderer.sprite?.width || 0, height: renderer.sprite?.height || 0 }
      })
    } catch (error) {
      results.push({ id: packId, ok: false, error: error.message || String(error) })
    }
  }
  return results
}

const runPackagedRuntimeSmoke = async ({ app, petWindow, petService, petPackService, petBubbleChatWindowService, env = process.env } = {}) => {
  if (!isSmokeEnabled(env)) return null
  const outputPath = env.OPENPET_PACKAGED_RUNTIME_SMOKE_OUTPUT
  if (!outputPath) throw new Error('OPENPET_PACKAGED_RUNTIME_SMOKE_OUTPUT is required')

  const screenshotPath = env.OPENPET_PACKAGED_RUNTIME_SMOKE_SCREENSHOT || ''
  const sessionId = env.OPENPET_PACKAGED_RUNTIME_SMOKE_SESSION_ID || new Date().toISOString().replace(/[:.]/g, '-')
  const startedAt = new Date()
  const evidence = {
    schemaVersion: 1,
    sessionId,
    generatedAt: startedAt.toISOString(),
    appPath: env.OPENPET_PACKAGED_RUNTIME_SMOKE_APP_PATH || app?.getAppPath?.() || '',
    state: {
      launch: { ok: true, pid: process.pid },
      window: { ok: false },
      renderer: { ok: false },
      packs: [],
      invalidPackage: {
        status: 'blocked',
        notes: 'Native picker invalid-package path requires a paired desktop picker smoke report.'
      },
      finalState: { ok: false }
    },
    screenshotPath: ''
  }

  try {
    const bounds = petWindow.getBounds()
    evidence.state.window = {
      ok: Boolean(petWindow && !petWindow.isDestroyed()),
      visible: petWindow.isVisible(),
      focused: petWindow.isFocused(),
      bounds,
      transparent: true,
      alwaysOnTop: petWindow.isAlwaysOnTop()
    }

    await waitForSprite(petWindow)
    petService.say({ text: 'OpenPet runtime smoke', ttlMs: 5000, source: 'packaged-runtime-smoke' })
    const animations = petService.getAnimations()
    const actionId = animations.clickAction || animations.defaultAction || animations.actions?.[0]?.id || ''
    if (actionId) petService.playAction({ actionId, source: 'packaged-runtime-smoke' })
    await sleep(300)
    const renderer = await inspectRenderer(petWindow)
    const bubbleChatState = petBubbleChatWindowService?.getState?.() || {}
    const bubbleItems = summarizeBubbleChatItems(bubbleChatState.items)
    renderer.bubbleChat = {
      visible: Boolean(bubbleChatState.visible),
      hasWindow: Boolean(bubbleChatState.hasWindow),
      text: String(bubbleChatState.message?.text || ''),
      source: String(bubbleChatState.message?.source || ''),
      items: bubbleItems,
      noticeCount: bubbleItems.filter((item) => item.kind === 'notice').length,
      dialogueCount: bubbleItems.filter((item) => item.kind === 'dialogue').length
    }
    renderer.action.requested = actionId
    evidence.state.renderer = renderer
    evidence.screenshotPath = await writeScreenshot(petWindow, screenshotPath)
    evidence.state.packs = await collectPackEvidence({ petWindow, petService, petPackService })
    try {
      petPackService.setActivePack('legacy-cat')
      sendAnimations(petWindow, petService)
      evidence.state.finalState = { ok: true, activePackId: 'legacy-cat' }
    } catch (error) {
      evidence.state.finalState = { ok: false, error: error.message || String(error) }
    }
  } catch (error) {
    evidence.error = error.message || String(error)
  } finally {
    writeJson(outputPath, evidence)
    const quitDelayMs = Math.max(0, Number(env.OPENPET_PACKAGED_RUNTIME_SMOKE_QUIT_DELAY_MS || 300) || 0)
    setTimeout(() => app?.quit?.(), quitDelayMs)
  }
  return evidence
}

const maybeRunPackagedRuntimeSmoke = (deps) => {
  if (!isSmokeEnabled(deps?.env || process.env)) return false
  runPackagedRuntimeSmoke(deps).catch((error) => {
    const outputPath = deps?.env?.OPENPET_PACKAGED_RUNTIME_SMOKE_OUTPUT || process.env.OPENPET_PACKAGED_RUNTIME_SMOKE_OUTPUT
    if (outputPath) {
      writeJson(outputPath, {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        error: error.message || String(error),
        state: { launch: { ok: true, pid: process.pid } }
      })
    }
    deps?.app?.quit?.()
  })
  return true
}

module.exports = {
  BUILT_IN_PACKS,
  isSmokeEnabled,
  maybeRunPackagedRuntimeSmoke,
  runPackagedRuntimeSmoke
}
