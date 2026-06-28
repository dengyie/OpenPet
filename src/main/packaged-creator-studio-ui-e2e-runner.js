const fs = require('fs')
const path = require('path')
const { BrowserWindow } = require('electron')

const DEFAULT_PLUGIN_ID = 'openpet.creator-studio'
const DEFAULT_SERVICE_ID = 'studio'
const DEFAULT_DASHBOARD_ID = 'main'
const DEFAULT_IMPORT_COMMAND_ID = 'import-approved-action'
const DEFAULT_TIMEOUT_MS = 15000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const isPackagedCreatorStudioUiE2eEnabled = (env = process.env) => env.OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E === '1'

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

const findEntryById = (entries = [], entryId) => (
  Array.isArray(entries) ? entries.find((entry) => entry?.id === entryId) || null : null
)

const normalizeDashboardText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim()

const parseDashboardCompletionSnapshot = ({
  approvalStatusText = '',
  snapshotText = '',
  importText = ''
} = {}) => {
  const normalizedApprovalStatusText = normalizeDashboardText(approvalStatusText)
  const normalizedSnapshotText = normalizeDashboardText(snapshotText)
  const normalizedImportText = normalizeDashboardText(importText)
  const taskStatusMatch = normalizedSnapshotText.match(/\bTask:\s*([^/]+?)\s*\/\s*Step:/i)
  const importCommandMatch = normalizedImportText.match(/\bCommand ID:\s*([A-Za-z0-9:_-]+)/i)

  return {
    status: /\bRun approved\./i.test(normalizedApprovalStatusText) ? 'approved' : '',
    taskStatus: taskStatusMatch ? String(taskStatusMatch[1] || '').trim() : '',
    importCommand: importCommandMatch
      ? String(importCommandMatch[1] || '').trim()
      : (normalizedImportText.includes('Import Approved Action') ? DEFAULT_IMPORT_COMMAND_ID : '')
  }
}

const createEmptyArtifact = ({ pluginId, hostApp }) => ({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  pluginId,
  hostApp,
  pluginFound: false,
  pluginEnabledBefore: false,
  controlCenter: {
    opened: false,
    pluginsTabActivated: false,
    pluginEnabledAfter: false,
    serviceStarted: false,
    serviceHealthOk: false,
    dashboardOpenRequested: false,
    dashboardUrl: ''
  },
  dashboard: {
    loaded: false,
    title: '',
    draftOk: false,
    questionAnswered: false,
    confirmed: false,
    generated: false,
    approved: false,
    runId: '',
    status: '',
    taskStatus: '',
    importCommand: '',
    qaSummary: '',
    handoffSummary: ''
  },
  importResult: {
    importRequested: false,
    importCommandId: '',
    importOk: false,
    importedActionId: '',
    triggerProposalSummary: ''
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

const defaultCreateDashboardWindow = (url) => {
  const win = new BrowserWindow({
    width: 1200,
    height: 900,
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.loadURL(url)
  return win
}

const defaultDriveControlCenterBootstrap = async ({
  openControlCenter,
  pluginId,
  serviceId,
  dashboardId,
  pluginService
} = {}) => {
  const controlCenterWindow = await Promise.resolve(openControlCenter())
  if (!controlCenterWindow) throw new Error('Control Center window was not created')
  await waitForLoad(controlCenterWindow)

  await waitForWebContentsCondition(controlCenterWindow, `(() => {
    const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent.trim() === 'Plugins')
    if (!button) return { ok: false, error: 'Plugins tab button was not found' }
    button.click()
    return { ok: true }
  })()`)

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

  const clickPluginRowButton = async (buttonText, errorLabel) => {
    await waitForWebContentsCondition(controlCenterWindow, `(() => {
      const row = [...document.querySelectorAll('.plugin-row')].find((candidate) => candidate.textContent.includes('Creator Studio'))
      if (!row) return { ok: false, error: 'Creator Studio plugin row was not visible' }
      const button = [...row.querySelectorAll('button')].find((candidate) => candidate.textContent.trim() === ${JSON.stringify(buttonText)})
      if (!button) return { ok: false, error: ${JSON.stringify(errorLabel)} }
      if (button.disabled) return { ok: false, error: ${JSON.stringify(`${buttonText} button is disabled`)} }
      button.click()
      return { ok: true }
    })()`)
  }

  await clickPluginRowButton('Start Creator Studio Service', 'Start Creator Studio Service button was not found')
  await waitForWebContentsCondition(controlCenterWindow, `(() => {
    const row = [...document.querySelectorAll('.plugin-row')].find((candidate) => candidate.textContent.includes('Creator Studio'))
    return row && row.textContent.includes('Service status: running')
      ? { ok: true }
      : { ok: false, error: 'Creator Studio service did not reach running state in the UI' }
  })()`)

  await clickPluginRowButton('Check Creator Studio Service Health', 'Check Creator Studio Service Health button was not found')
  await waitForWebContentsCondition(controlCenterWindow, `(() => {
    const row = [...document.querySelectorAll('.plugin-row')].find((candidate) => candidate.textContent.includes('Creator Studio'))
    return row && row.textContent.includes('Health: healthy')
      ? { ok: true }
      : { ok: false, error: 'Creator Studio service health did not become healthy in the UI' }
  })()`)

  const dashboardEntry = findEntryById((pluginService.listPlugins?.() || []).find((candidate) => candidate?.id === pluginId)?.entries?.dashboards, dashboardId)
  const dashboardTitle = dashboardEntry?.title || 'Creator Studio'
  await clickPluginRowButton(dashboardTitle, 'Creator Studio dashboard button was not found')
  await waitForWebContentsCondition(controlCenterWindow, `(() => {
    const status = document.querySelector('.status-line')?.textContent || ''
    return status.includes('Dashboard 已打开')
      ? { ok: true }
      : { ok: false, error: 'Control Center did not report that the dashboard opened' }
  })()`)

  return {
    controlCenterWindow,
    opened: true,
    pluginsTabActivated: true,
    pluginEnabledAfter: true,
    serviceStarted: true,
    serviceHealthOk: true,
    dashboardOpenRequested: true,
    dashboardUrl: dashboardEntry?.url || ''
  }
}

const defaultDriveDashboard = async ({
  dashboardUrl,
  createDashboardWindow = defaultCreateDashboardWindow
} = {}) => {
  if (!dashboardUrl) throw new Error('Dashboard URL is required for packaged Creator Studio UI E2E')
  const dashboardWindow = await Promise.resolve(createDashboardWindow(dashboardUrl))
  if (!dashboardWindow) throw new Error('Dashboard window was not created')
  await waitForLoad(dashboardWindow)

  await waitForWebContentsCondition(dashboardWindow, `(() => {
    return document.getElementById('draft-button')
      ? { ok: true }
      : { ok: false, error: 'Creator Studio dashboard draft button was not found' }
  })()`)

  await dashboardWindow.webContents.executeJavaScript(`(() => {
    const backend = document.getElementById('backend-select')
    if (backend) {
      backend.value = 'fixture'
      backend.dispatchEvent(new Event('change', { bubbles: true }))
    }
    const prompt = document.getElementById('prompt-input')
    if (prompt) {
      prompt.value = '新增一个自定义动作：原地打滚，动作要循环。'
      prompt.dispatchEvent(new Event('input', { bubbles: true }))
      prompt.dispatchEvent(new Event('change', { bubbles: true }))
    }
  })()`, true)

  await waitForWebContentsCondition(dashboardWindow, `(() => {
    const button = document.getElementById('draft-button')
    if (!button) return { ok: false, error: 'Draft task button was not found' }
    button.click()
    return { ok: true }
  })()`)
  await waitForWebContentsCondition(dashboardWindow, `(() => {
    const status = document.getElementById('status-line')?.textContent || ''
    const runId = document.getElementById('run-select')?.value || ''
    return status.includes('Task drafted.') && runId
      ? { ok: true, runId }
      : { ok: false, error: 'Creator Studio dashboard did not draft a run yet' }
  })()`)

  const answerResult = await waitForWebContentsCondition(dashboardWindow, `(() => {
    const buttons = [...document.querySelectorAll('#question-panel button')]
    const target = buttons.find((candidate) => candidate.textContent.trim() === 'click') || buttons[0]
    if (!target) return { ok: false, error: 'Creator Studio dashboard follow-up answer buttons were not visible' }
    target.click()
    return { ok: true, answer: target.textContent.trim() }
  })()`)
  await waitForWebContentsCondition(dashboardWindow, `(() => {
    const status = document.getElementById('status-line')?.textContent || ''
    return status.includes('Question answered.')
      ? { ok: true }
      : { ok: false, error: 'Creator Studio dashboard did not accept the follow-up answer' }
  })()`)

  await waitForWebContentsCondition(dashboardWindow, `(() => {
    const button = document.getElementById('confirm-button')
    if (!button) return { ok: false, error: 'Confirm task button was not found' }
    if (button.disabled) return { ok: false, error: 'Confirm task button is disabled' }
    button.click()
    return { ok: true }
  })()`)
  await waitForWebContentsCondition(dashboardWindow, `(() => {
    const status = document.getElementById('status-line')?.textContent || ''
    return status.includes('Task confirmed.')
      ? { ok: true }
      : { ok: false, error: 'Creator Studio dashboard did not confirm the task' }
  })()`)

  await waitForWebContentsCondition(dashboardWindow, `(() => {
    const button = document.getElementById('generate-button')
    if (!button) return { ok: false, error: 'Generate action button was not found' }
    if (button.disabled) return { ok: false, error: 'Generate action button is disabled' }
    button.click()
    return { ok: true }
  })()`)
  await waitForWebContentsCondition(dashboardWindow, `(() => {
    const status = document.getElementById('status-line')?.textContent || ''
    const approveButton = document.getElementById('approve-button')
    return status.includes('Generated action output') && approveButton && approveButton.disabled === false
      ? { ok: true }
      : { ok: false, error: 'Creator Studio dashboard did not finish fixture generation and unlock approval' }
  })()`, DEFAULT_TIMEOUT_MS * 2)

  await waitForWebContentsCondition(dashboardWindow, `(() => {
    const button = document.getElementById('approve-button')
    if (!button) return { ok: false, error: 'Approve run button was not found' }
    if (button.disabled) return { ok: false, error: 'Approve run button is disabled' }
    button.click()
    return { ok: true }
  })()`)
  const approvalResult = await waitForWebContentsCondition(dashboardWindow, `(() => {
    const status = document.getElementById('status-line')?.textContent || ''
    const handoff = document.getElementById('import-handoff-panel')?.textContent || ''
    const qa = document.getElementById('qa-panel')?.textContent || ''
    const runId = document.getElementById('run-select')?.value || ''
    if (!status.includes('Run approved.')) {
      return { ok: false, error: 'Creator Studio dashboard did not approve the run' }
    }
    return {
      ok: true,
      status,
      handoff,
      qa,
      runId
    }
  })()`)

  const runState = await dashboardWindow.webContents.executeJavaScript(`(() => {
    const approvalStatusText = document.getElementById('status-line')?.textContent || ''
    const snapshotText = document.getElementById('run-snapshot-panel')?.textContent || ''
    const importText = document.getElementById('import-handoff-panel')?.textContent || ''
    return {
      approvalStatusText,
      snapshotText,
      importText
    }
  })()`, true)
  const parsedCompletionSnapshot = parseDashboardCompletionSnapshot(runState)

  return {
    dashboardWindow,
    loaded: true,
    title: await dashboardWindow.webContents.getTitle(),
    draftOk: true,
    questionAnswered: Boolean(answerResult.answer),
    confirmed: true,
    generated: true,
    approved: true,
    runId: approvalResult.runId || '',
    status: parsedCompletionSnapshot.status,
    taskStatus: parsedCompletionSnapshot.taskStatus,
    importCommand: parsedCompletionSnapshot.importCommand,
    qaSummary: approvalResult.qa || '',
    handoffSummary: approvalResult.handoff || ''
  }
}

const defaultDriveControlCenterImport = async ({
  controlCenterWindow,
  pluginId,
  runId,
  importCommandId = DEFAULT_IMPORT_COMMAND_ID
} = {}) => {
  if (!controlCenterWindow?.webContents) throw new Error('Control Center window is required for import flow')
  if (!runId) throw new Error('Run ID is required for import flow')

  await waitForWebContentsCondition(controlCenterWindow, `(() => {
    const input = document.getElementById(${JSON.stringify(`plugin-command-payload-${pluginId}`)})
    if (!input) return { ok: false, error: 'Creator Studio command payload input was not found' }
    input.value = ${JSON.stringify(JSON.stringify({ runId }))}
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return { ok: true }
  })()`)

  await waitForWebContentsCondition(controlCenterWindow, `(() => {
    const row = [...document.querySelectorAll('.plugin-row')].find((candidate) => candidate.textContent.includes('Creator Studio'))
    if (!row) return { ok: false, error: 'Creator Studio plugin row was not visible during import' }
    const button = [...row.querySelectorAll('button')].find((candidate) => candidate.textContent.trim() === 'Import Approved Action')
    if (!button) return { ok: false, error: 'Import Approved Action button was not found' }
    if (button.disabled) return { ok: false, error: 'Import Approved Action button is disabled' }
    button.click()
    return { ok: true }
  })()`)

  const importState = await waitForWebContentsCondition(controlCenterWindow, `(() => {
    const row = [...document.querySelectorAll('.plugin-row')].find((candidate) => candidate.textContent.includes('Creator Studio'))
    const status = document.querySelector('.status-line')?.textContent || ''
    const text = row?.textContent || ''
    if (!status.includes('Imported action') || !text.includes('import-approved-action')) {
      return { ok: false, error: 'Creator Studio import command has not completed in the Control Center yet' }
    }
    return { ok: true, text, status }
  })()`, DEFAULT_TIMEOUT_MS * 2)

  const importedActionMatch = importState.text.match(/已导入动作\s*([A-Za-z0-9:_-]+)/)
  const triggerProposalMatch = importState.text.match(/触发建议\s*([^]+)$/)
  return {
    importRequested: true,
    importCommandId,
    importOk: true,
    importedActionId: importedActionMatch ? importedActionMatch[1] : '',
    triggerProposalSummary: triggerProposalMatch ? triggerProposalMatch[1].trim() : ''
  }
}

const runPackagedCreatorStudioUiE2e = async ({
  app,
  pluginService,
  openControlCenter,
  createDashboardWindow = defaultCreateDashboardWindow,
  driveControlCenterBootstrapImpl = defaultDriveControlCenterBootstrap,
  driveDashboardImpl = defaultDriveDashboard,
  driveControlCenterImportImpl = defaultDriveControlCenterImport,
  env = process.env
} = {}) => {
  if (!isPackagedCreatorStudioUiE2eEnabled(env)) return null
  const outputPath = env.OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_OUTPUT
  if (!outputPath) throw new Error('OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_OUTPUT is required')
  const stdoutPath = env.OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_STDOUT || ''
  const stderrPath = env.OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_STDERR || ''
  const pluginId = env.OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_PLUGIN_ID || DEFAULT_PLUGIN_ID
  const serviceId = env.OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_SERVICE_ID || DEFAULT_SERVICE_ID
  const dashboardId = env.OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_DASHBOARD_ID || DEFAULT_DASHBOARD_ID
  const hostApp = env.OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_APP_PATH || app?.getAppPath?.() || 'OpenPet packaged app'
  const stdout = []
  const stderr = []
  const artifact = createEmptyArtifact({ pluginId, hostApp })
  let dashboardWindow = null

  try {
    const plugin = (pluginService.listPlugins?.() || []).find((candidate) => candidate?.id === pluginId)
    if (!plugin) throw new Error('Bundled Creator Studio plugin was not found')

    artifact.generatedAt = new Date().toISOString()
    artifact.pluginFound = true
    artifact.pluginEnabledBefore = Boolean(plugin.enabled)
    stdout.push(`discovered ${pluginId}`)

    const bootstrapResult = await driveControlCenterBootstrapImpl({
      openControlCenter,
      pluginId,
      serviceId,
      dashboardId,
      pluginService
    })
    artifact.controlCenter = {
      opened: Boolean(bootstrapResult?.opened),
      pluginsTabActivated: Boolean(bootstrapResult?.pluginsTabActivated),
      pluginEnabledAfter: Boolean(bootstrapResult?.pluginEnabledAfter),
      serviceStarted: Boolean(bootstrapResult?.serviceStarted),
      serviceHealthOk: Boolean(bootstrapResult?.serviceHealthOk),
      dashboardOpenRequested: Boolean(bootstrapResult?.dashboardOpenRequested),
      dashboardUrl: String(bootstrapResult?.dashboardUrl || '')
    }
    stdout.push('control center flow completed')

    const dashboardResult = await driveDashboardImpl({
      dashboardUrl: artifact.controlCenter.dashboardUrl,
      createDashboardWindow,
      pluginId
    })
    dashboardWindow = dashboardResult?.dashboardWindow || null
    artifact.dashboard = {
      loaded: Boolean(dashboardResult?.loaded),
      title: String(dashboardResult?.title || ''),
      draftOk: Boolean(dashboardResult?.draftOk),
      questionAnswered: Boolean(dashboardResult?.questionAnswered),
      confirmed: Boolean(dashboardResult?.confirmed),
      generated: Boolean(dashboardResult?.generated),
      approved: Boolean(dashboardResult?.approved),
      runId: String(dashboardResult?.runId || ''),
      status: String(dashboardResult?.status || ''),
      taskStatus: String(dashboardResult?.taskStatus || ''),
      importCommand: String(dashboardResult?.importCommand || ''),
      qaSummary: String(dashboardResult?.qaSummary || ''),
      handoffSummary: String(dashboardResult?.handoffSummary || '')
    }
    stdout.push(`dashboard flow completed for ${artifact.dashboard.runId || 'unknown-run'}`)

    artifact.importResult = {
      importRequested: false,
      importCommandId: artifact.dashboard.importCommand || DEFAULT_IMPORT_COMMAND_ID,
      importOk: false,
      importedActionId: '',
      triggerProposalSummary: ''
    }
    if (artifact.dashboard.runId && artifact.dashboard.importCommand === DEFAULT_IMPORT_COMMAND_ID) {
      const importResult = await driveControlCenterImportImpl({
        controlCenterWindow: bootstrapResult?.controlCenterWindow,
        pluginId,
        runId: artifact.dashboard.runId,
        importCommandId: artifact.dashboard.importCommand
      })
      artifact.importResult = {
        importRequested: Boolean(importResult?.importRequested),
        importCommandId: String(importResult?.importCommandId || artifact.dashboard.importCommand),
        importOk: Boolean(importResult?.importOk),
        importedActionId: String(importResult?.importedActionId || ''),
        triggerProposalSummary: String(importResult?.triggerProposalSummary || '')
      }
      stdout.push(`control center import completed for ${artifact.dashboard.runId}`)
    }

    writeJson(outputPath, artifact)
    stdout.push('packaged creator studio ui e2e completed')
    return artifact
  } catch (error) {
    artifact.generatedAt = new Date().toISOString()
    artifact.error = error.message || String(error)
    stderr.push(artifact.error)
    writeJson(outputPath, artifact)
    return artifact
  } finally {
    if (dashboardWindow && !dashboardWindow.isDestroyed?.()) dashboardWindow.close?.()
    if (stdoutPath) writeText(stdoutPath, stdout.join('\n') + (stdout.length ? '\n' : ''))
    if (stderrPath) writeText(stderrPath, stderr.join('\n') + (stderr.length ? '\n' : ''))
    const quitDelayMs = Math.max(0, Number(env.OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_QUIT_DELAY_MS || 300) || 0)
    setTimeout(() => app?.quit?.(), quitDelayMs)
  }
}

const maybeRunPackagedCreatorStudioUiE2e = (deps) => {
  if (!isPackagedCreatorStudioUiE2eEnabled(deps?.env || process.env)) return false
  runPackagedCreatorStudioUiE2e(deps).catch((error) => {
    const outputPath = deps?.env?.OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_OUTPUT || process.env.OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_OUTPUT
    if (outputPath) {
      writeJson(outputPath, {
        ...createEmptyArtifact({
          pluginId: deps?.env?.OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_PLUGIN_ID || DEFAULT_PLUGIN_ID,
          hostApp: deps?.env?.OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_APP_PATH || deps?.app?.getAppPath?.() || 'OpenPet packaged app'
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
  parseDashboardCompletionSnapshot,
  isPackagedCreatorStudioUiE2eEnabled,
  maybeRunPackagedCreatorStudioUiE2e,
  runPackagedCreatorStudioUiE2e
}
