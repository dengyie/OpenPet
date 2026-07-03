const fs = require('fs')
const path = require('path')

const DEFAULT_PLUGIN_ID = 'openpet.creator-studio'
const DEFAULT_SERVICE_ID = 'studio'
const DEFAULT_TIMEOUT_MS = 15000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const isPackagedCreateUiSmokeEnabled = (env = process.env) => env.OPENPET_PACKAGED_CREATE_UI_SMOKE === '1'

const ensureParentDir = (filePath) => {
  if (!filePath) return
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true })
}

const writeText = (filePath, value) => {
  ensureParentDir(filePath)
  fs.writeFileSync(path.resolve(filePath), String(value ?? ''))
}

const writeJson = (filePath, value) => {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

const createEmptyArtifact = ({ hostApp }) => ({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  hostApp,
  controlCenter: {
    opened: false,
    createTabActivated: false,
    pluginsTabActivated: false
  },
  initialCreate: {
    visible: false,
    providerReady: false,
    providerText: '',
    providerCode: '',
    providerModel: '',
    creatorStudioReady: false,
    creatorStudioText: '',
    generateButtonDisabled: true
  },
  afterStudioStart: {
    pluginEnabled: false,
    serviceStarted: false,
    visible: false,
    providerReady: false,
    providerText: '',
    providerCode: '',
    providerModel: '',
    creatorStudioReady: false,
    creatorStudioText: '',
    generateButtonDisabled: true
  }
})

const waitForLoad = async (win, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  if (!win?.webContents) throw new Error('Window webContents is required')
  if (typeof win.webContents.isLoading === 'function' && !win.webContents.isLoading()) return
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Timed out waiting for window load'))
    }, timeoutMs)
    const cleanup = () => {
      clearTimeout(timeout)
      win.webContents.removeListener?.('did-finish-load', onLoad)
      win.webContents.removeListener?.('did-fail-load', onFail)
    }
    const onLoad = () => {
      cleanup()
      resolve()
    }
    const onFail = (_event, code, description) => {
      cleanup()
      reject(new Error(`Window load failed (${code}): ${description || 'unknown error'}`))
    }
    win.webContents.once?.('did-finish-load', onLoad)
    win.webContents.once?.('did-fail-load', onFail)
  })
}

const waitForWebContentsCondition = async (win, expression, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const startedAt = Date.now()
  let lastValue = null
  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await win.webContents.executeJavaScript(expression, true)
    if (lastValue?.ok) return lastValue
    await sleep(100)
  }
  throw new Error(lastValue?.error || 'Timed out waiting for window condition')
}

const openTab = async (controlCenterWindow, buttonText) => {
  await waitForWebContentsCondition(controlCenterWindow, `(() => {
    const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent.trim() === ${JSON.stringify(buttonText)})
    if (!button) return { ok: false, error: ${JSON.stringify(`${buttonText} tab button was not found`)} }
    button.click()
    return { ok: true }
  })()`)
}

const collectCreateSnapshot = async (controlCenterWindow) => {
  if (!controlCenterWindow?.webContents) throw new Error('Control Center window is required')
  return controlCenterWindow.webContents.executeJavaScript(`(async () => {
    const state = await window.controlCenterAPI.getCreatorState()
    const providerNode = document.querySelector('[data-testid="creator-provider-status"]')
    const workflowNode = document.querySelector('[data-testid="creator-workflow-status"]')
    const button = document.querySelector('[data-testid="creator-generate-new-character"]')
    const heading = document.querySelector('.pane h1')
    return {
      visible: Boolean(heading && heading.textContent.trim() === 'Create'),
      providerReady: Boolean(state?.provider?.ready),
      providerText: String(providerNode?.textContent || ''),
      providerCode: String(state?.provider?.code || ''),
      providerModel: String(state?.provider?.model || ''),
      creatorStudioReady: Boolean(state?.dashboard?.available && state?.dashboard?.serviceStatus === 'running'),
      creatorStudioText: String(workflowNode?.textContent || ''),
      generateButtonDisabled: button ? Boolean(button.disabled) : true
    }
  })()`, true)
}

const defaultDriveControlCenter = async ({
  openControlCenter,
  pluginId,
  serviceId
} = {}) => {
  const controlCenterWindow = await Promise.resolve(openControlCenter())
  if (!controlCenterWindow) throw new Error('Control Center window was not created')
  await waitForLoad(controlCenterWindow)

  await openTab(controlCenterWindow, 'Create')
  await waitForWebContentsCondition(controlCenterWindow, `(() => {
    const heading = document.querySelector('.pane h1')
    return heading?.textContent?.trim() === 'Create'
      ? { ok: true }
      : { ok: false, error: 'Create pane heading was not visible' }
  })()`)
  const initialCreate = await collectCreateSnapshot(controlCenterWindow)

  await openTab(controlCenterWindow, 'Plugins')
  await waitForWebContentsCondition(controlCenterWindow, `(() => {
    const row = [...document.querySelectorAll('.plugin-row')].find((candidate) => candidate.textContent.includes('Creator Studio'))
    return row ? { ok: true } : { ok: false, error: 'Creator Studio plugin row was not visible' }
  })()`)

  const enabledState = await controlCenterWindow.webContents.executeJavaScript(`(() => {
    const toggle = document.querySelector('[role="switch"][aria-label="Enable Creator Studio"]')
    if (!toggle) return { exists: false, checked: false }
    return { exists: true, checked: toggle.getAttribute('aria-checked') === 'true' }
  })()`, true)
  if (enabledState.exists && !enabledState.checked) {
    await waitForWebContentsCondition(controlCenterWindow, `(() => {
      const toggle = document.querySelector('[role="switch"][aria-label="Enable Creator Studio"]')
      if (!toggle) return { ok: false, error: 'Creator Studio enable toggle was not found' }
      toggle.click()
      return { ok: true }
    })()`)
    await waitForWebContentsCondition(controlCenterWindow, `(() => {
      const toggle = document.querySelector('[role="switch"][aria-label="Enable Creator Studio"]')
      return toggle?.getAttribute('aria-checked') === 'true'
        ? { ok: true }
        : { ok: false, error: 'Creator Studio plugin did not enable in the UI' }
    })()`)
  }

  await waitForWebContentsCondition(controlCenterWindow, `(() => {
    const row = [...document.querySelectorAll('.plugin-row')].find((candidate) => candidate.textContent.includes('Creator Studio'))
    if (!row) return { ok: false, error: 'Creator Studio plugin row was not visible' }
    const button = [...row.querySelectorAll('button')].find((candidate) => candidate.textContent.trim() === 'Start Creator Studio Service')
    if (!button) return { ok: false, error: 'Start Creator Studio Service button was not found' }
    if (button.disabled) return { ok: false, error: 'Start Creator Studio Service button is disabled' }
    button.click()
    return { ok: true }
  })()`)

  await waitForWebContentsCondition(controlCenterWindow, `(() => {
    const row = [...document.querySelectorAll('.plugin-row')].find((candidate) => candidate.textContent.includes('Creator Studio'))
    return row && row.textContent.includes('Service status: running')
      ? { ok: true }
      : { ok: false, error: 'Creator Studio service did not reach running state in the UI' }
  })()`)

  await openTab(controlCenterWindow, 'Create')
  await waitForWebContentsCondition(controlCenterWindow, `(() => {
    const heading = document.querySelector('.pane h1')
    return heading?.textContent?.trim() === 'Create'
      ? { ok: true }
      : { ok: false, error: 'Create pane was not visible after starting Creator Studio' }
  })()`)
  const afterStudioStart = await collectCreateSnapshot(controlCenterWindow)

  return {
    controlCenterWindow,
    controlCenter: {
      opened: true,
      createTabActivated: true,
      pluginsTabActivated: true
    },
    initialCreate,
    afterStudioStart: {
      pluginEnabled: true,
      serviceStarted: true,
      ...afterStudioStart
    }
  }
}

const runPackagedCreateUiSmoke = async ({
  app,
  openControlCenter,
  driveControlCenterImpl = defaultDriveControlCenter,
  env = process.env
} = {}) => {
  if (!isPackagedCreateUiSmokeEnabled(env)) return null
  const outputPath = env.OPENPET_PACKAGED_CREATE_UI_SMOKE_OUTPUT
  if (!outputPath) throw new Error('OPENPET_PACKAGED_CREATE_UI_SMOKE_OUTPUT is required')
  const stdoutPath = env.OPENPET_PACKAGED_CREATE_UI_SMOKE_STDOUT || ''
  const stderrPath = env.OPENPET_PACKAGED_CREATE_UI_SMOKE_STDERR || ''
  const pluginId = env.OPENPET_PACKAGED_CREATE_UI_SMOKE_PLUGIN_ID || DEFAULT_PLUGIN_ID
  const serviceId = env.OPENPET_PACKAGED_CREATE_UI_SMOKE_SERVICE_ID || DEFAULT_SERVICE_ID
  const hostApp = env.OPENPET_PACKAGED_CREATE_UI_SMOKE_APP_PATH || app?.getAppPath?.() || 'OpenPet packaged app'
  const stdout = []
  const stderr = []
  const artifact = createEmptyArtifact({ hostApp })

  try {
    const result = await driveControlCenterImpl({
      openControlCenter,
      pluginId,
      serviceId
    })
    artifact.generatedAt = new Date().toISOString()
    artifact.controlCenter = {
      opened: Boolean(result?.controlCenter?.opened),
      createTabActivated: Boolean(result?.controlCenter?.createTabActivated),
      pluginsTabActivated: Boolean(result?.controlCenter?.pluginsTabActivated)
    }
    artifact.initialCreate = {
      ...artifact.initialCreate,
      ...result?.initialCreate
    }
    artifact.afterStudioStart = {
      ...artifact.afterStudioStart,
      ...result?.afterStudioStart
    }
    writeJson(outputPath, artifact)
    stdout.push(`packaged create ui smoke completed for ${pluginId}:${serviceId}`)
    return artifact
  } catch (error) {
    artifact.generatedAt = new Date().toISOString()
    artifact.error = error.message || String(error)
    stderr.push(artifact.error)
    writeJson(outputPath, artifact)
    return artifact
  } finally {
    if (stdoutPath) writeText(stdoutPath, stdout.join('\n') + (stdout.length ? '\n' : ''))
    if (stderrPath) writeText(stderrPath, stderr.join('\n') + (stderr.length ? '\n' : ''))
    const quitDelayMs = Math.max(0, Number(env.OPENPET_PACKAGED_CREATE_UI_SMOKE_QUIT_DELAY_MS || 300) || 0)
    setTimeout(() => app?.quit?.(), quitDelayMs)
  }
}

const maybeRunPackagedCreateUiSmoke = (deps) => {
  if (!isPackagedCreateUiSmokeEnabled(deps?.env || process.env)) return false
  runPackagedCreateUiSmoke(deps).catch((error) => {
    const outputPath = deps?.env?.OPENPET_PACKAGED_CREATE_UI_SMOKE_OUTPUT || process.env.OPENPET_PACKAGED_CREATE_UI_SMOKE_OUTPUT
    if (outputPath) {
      writeJson(outputPath, {
        ...createEmptyArtifact({
          hostApp: deps?.env?.OPENPET_PACKAGED_CREATE_UI_SMOKE_APP_PATH || deps?.app?.getAppPath?.() || 'OpenPet packaged app'
        }),
        generatedAt: new Date().toISOString(),
        error: error.message || String(error)
      })
    }
    deps?.app?.quit?.()
  })
  return true
}

module.exports = {
  isPackagedCreateUiSmokeEnabled,
  maybeRunPackagedCreateUiSmoke,
  runPackagedCreateUiSmoke
}
