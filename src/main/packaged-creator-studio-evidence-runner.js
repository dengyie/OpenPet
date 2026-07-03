const fs = require('fs')
const path = require('path')

const DEFAULT_PLUGIN_ID = 'openpet.creator-studio'
const DEFAULT_COMMAND_ID = 'draft-task'
const DEFAULT_SERVICE_ID = 'studio'
const DEFAULT_DASHBOARD_ID = 'main'
const DEFAULT_HEALTH_TIMEOUT_MS = 3000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const isPackagedCreatorStudioEvidenceEnabled = (env = process.env) => env.OPENPET_PACKAGED_CREATOR_STUDIO_EVIDENCE === '1'

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

const waitForHealthyService = async ({
  pluginService,
  pluginId,
  serviceId,
  timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS
} = {}) => {
  const startedAt = Date.now()
  let lastResult = null
  while (Date.now() - startedAt < timeoutMs) {
    lastResult = await pluginService.checkServiceHealth(pluginId, serviceId)
    if (lastResult?.ok && String(lastResult?.runtime?.health?.status || '').toLowerCase() === 'healthy') {
      return lastResult
    }
    await sleep(100)
  }
  return lastResult
}

const createEmptyArtifact = ({ pluginId, hostApp }) => ({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  pluginId,
  hostApp,
  pluginFound: false,
  pluginEnabledBefore: false,
  dashboard: {
    present: false,
    id: '',
    title: '',
    url: ''
  },
  service: {
    present: false,
    id: '',
    title: '',
    startRequested: false,
    stopRequested: false,
    healthOk: false,
    healthStatus: '',
    statusBeforeStart: '',
    statusAfterStart: '',
    statusAfterStop: ''
  },
  command: {
    requested: false,
    commandId: DEFAULT_COMMAND_ID,
    ok: false,
    runId: '',
    status: '',
    taskStatus: '',
    mode: ''
  }
})

const runPackagedCreatorStudioEvidence = async ({
  app,
  pluginService,
  env = process.env
} = {}) => {
  if (!isPackagedCreatorStudioEvidenceEnabled(env)) return null
  const outputPath = env.OPENPET_PACKAGED_CREATOR_STUDIO_OUTPUT
  if (!outputPath) throw new Error('OPENPET_PACKAGED_CREATOR_STUDIO_OUTPUT is required')
  const stdoutPath = env.OPENPET_PACKAGED_CREATOR_STUDIO_STDOUT || ''
  const stderrPath = env.OPENPET_PACKAGED_CREATOR_STUDIO_STDERR || ''
  const pluginId = env.OPENPET_PACKAGED_CREATOR_STUDIO_PLUGIN_ID || DEFAULT_PLUGIN_ID
  const serviceId = env.OPENPET_PACKAGED_CREATOR_STUDIO_SERVICE_ID || DEFAULT_SERVICE_ID
  const dashboardId = env.OPENPET_PACKAGED_CREATOR_STUDIO_DASHBOARD_ID || DEFAULT_DASHBOARD_ID
  const hostApp = env.OPENPET_PACKAGED_CREATOR_STUDIO_APP_PATH || app?.getAppPath?.() || 'OpenPet packaged app'
  const healthTimeoutMs = Math.max(100, Number(env.OPENPET_PACKAGED_CREATOR_STUDIO_HEALTH_TIMEOUT_MS || DEFAULT_HEALTH_TIMEOUT_MS) || DEFAULT_HEALTH_TIMEOUT_MS)
  const stdout = []
  const stderr = []
  const artifact = createEmptyArtifact({ pluginId, hostApp })

  try {
    const plugin = (pluginService.listPlugins?.() || []).find((candidate) => candidate?.id === pluginId)
    if (!plugin) throw new Error('Bundled Creator Studio plugin was not found')

    artifact.generatedAt = new Date().toISOString()
    artifact.pluginFound = true
    artifact.pluginEnabledBefore = Boolean(plugin.enabled)
    stdout.push(`discovered ${pluginId}`)

    const dashboard = findEntryById(plugin.entries?.dashboards, dashboardId)
    artifact.dashboard = {
      present: Boolean(dashboard),
      id: dashboard?.id || '',
      title: dashboard?.title || '',
      url: dashboard?.url || ''
    }

    const serviceEntry = findEntryById(plugin.entries?.services, serviceId)
    artifact.service.present = Boolean(serviceEntry)
    artifact.service.id = serviceEntry?.id || ''
    artifact.service.title = serviceEntry?.title || ''
    artifact.service.statusBeforeStart = serviceEntry?.runtime?.status || ''

    if (!artifact.pluginEnabledBefore) {
      pluginService.setEnabled?.(pluginId, true)
      stdout.push(`enabled ${pluginId}`)
    }

    if (serviceEntry) {
      artifact.service.startRequested = true
      const started = pluginService.startService
        ? await pluginService.startService(pluginId, serviceId)
        : {}
      artifact.service.statusAfterStart = started?.runtime?.status || 'running'
      const health = await waitForHealthyService({
        pluginService,
        pluginId,
        serviceId,
        timeoutMs: healthTimeoutMs
      })
      artifact.service.healthOk = Boolean(health?.ok)
      artifact.service.healthStatus = health?.runtime?.health?.status || ''
    }

    artifact.command.requested = true
    const commandResult = await pluginService.runCommand?.(pluginId, DEFAULT_COMMAND_ID, {
      prompt: '新增一个自定义动作：原地打滚，动作要循环。',
      backend: 'fixture'
    })
    const run = commandResult?.result?.run || {}
    artifact.command.ok = Boolean(commandResult?.ok && commandResult?.result?.ok)
    artifact.command.runId = run.runId || ''
    artifact.command.status = run.status || ''
    artifact.command.taskStatus = run.taskStatus || ''
    artifact.command.mode = run.generationTask?.mode || ''
    stdout.push(`ran ${DEFAULT_COMMAND_ID} for ${pluginId}`)

    if (serviceEntry) {
      artifact.service.stopRequested = true
      const stopped = pluginService.stopService?.(pluginId, serviceId) || {}
      artifact.service.statusAfterStop = stopped?.runtime?.status || 'stopped'
    }

    writeJson(outputPath, artifact)
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
    const quitDelayMs = Math.max(0, Number(env.OPENPET_PACKAGED_CREATOR_STUDIO_QUIT_DELAY_MS || 300) || 0)
    setTimeout(() => app?.quit?.(), quitDelayMs)
  }
}

const maybeRunPackagedCreatorStudioEvidence = (deps) => {
  if (!isPackagedCreatorStudioEvidenceEnabled(deps?.env || process.env)) return false
  runPackagedCreatorStudioEvidence(deps).catch((error) => {
    const outputPath = deps?.env?.OPENPET_PACKAGED_CREATOR_STUDIO_OUTPUT || process.env.OPENPET_PACKAGED_CREATOR_STUDIO_OUTPUT
    if (outputPath) {
      writeJson(outputPath, {
        ...createEmptyArtifact({
          pluginId: deps?.env?.OPENPET_PACKAGED_CREATOR_STUDIO_PLUGIN_ID || DEFAULT_PLUGIN_ID,
          hostApp: deps?.env?.OPENPET_PACKAGED_CREATOR_STUDIO_APP_PATH || deps?.app?.getAppPath?.() || 'OpenPet packaged app'
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
  isPackagedCreatorStudioEvidenceEnabled,
  maybeRunPackagedCreatorStudioEvidence,
  runPackagedCreatorStudioEvidence
}
