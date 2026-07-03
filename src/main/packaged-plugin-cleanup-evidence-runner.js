const fs = require('fs')
const path = require('path')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const isPackagedCleanupEvidenceEnabled = (env = process.env) => env.OPENPET_PACKAGED_PLUGIN_CLEANUP_EVIDENCE === '1'

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

const collectLogs = (pluginService, pluginId) => {
  try {
    return (pluginService.getLogs?.() || []).filter((entry) => entry.pluginId === pluginId)
  } catch (_) {
    return []
  }
}

const logContains = (logs, pattern) => logs.some((entry) => pattern.test(String(entry.message || '')))

const stepTranscript = ({ logs, commandPrefix }) => logs
  .filter((entry) => !commandPrefix || String(entry.commandId || '').startsWith(commandPrefix))
  .map((entry) => [
    entry.timestamp || '',
    entry.level || '',
    entry.commandId || '',
    entry.message || ''
  ].filter(Boolean).join(' | '))
  .join('\n')

const persistStepTranscript = ({ filePath, logs, commandPrefix }) => {
  const content = stepTranscript({ logs, commandPrefix })
  writeText(filePath, content ? `${content}\n` : '')
  return path.resolve(filePath)
}

const waitForLog = async ({ pluginService, pluginId, pattern, timeoutMs = 2500 }) => {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (logContains(collectLogs(pluginService, pluginId), pattern)) return true
    await sleep(100)
  }
  return false
}

const installAndEnablePlugin = ({ pluginInstallService, pluginService, pluginSource }) => {
  const review = pluginInstallService.inspectPluginPackage(pluginSource)
  const installed = pluginInstallService.installPlugin(review.selectionId)
  pluginService.setEnabled(installed.pluginId, true)
  return installed.pluginId
}

const runSetupEvidence = async ({ pluginService, pluginId, transcriptPath }) => {
  pluginService.setEnabled(pluginId, true)
  const setupPromise = pluginService.runSetup(pluginId, 'prepare').catch((error) => error)
  await waitForLog({ pluginService, pluginId, pattern: /Setup started/i })
  pluginService.setEnabled(pluginId, false)
  await setupPromise
  await waitForLog({ pluginService, pluginId, pattern: /Setup stopped|Setup failed/i })
  const logs = collectLogs(pluginService, pluginId)
  return {
    requested: true,
    stopRequested: logContains(logs, /Plugin disabled/i),
    exitConfirmed: logContains(logs, /Setup stopped/i),
    treeCleanupAttempted: logContains(logs, /tree cleanup/i),
    transcriptPath: persistStepTranscript({ filePath: transcriptPath, logs, commandPrefix: 'setup:' })
  }
}

const runCommandEvidence = async ({ pluginService, pluginId, transcriptPath }) => {
  pluginService.setEnabled(pluginId, true)
  const commandPromise = pluginService.runCommand(pluginId, 'announce', { reason: 'packaged-cleanup-evidence' }).catch((error) => error)
  await waitForLog({ pluginService, pluginId, pattern: /Command started/i })
  pluginService.setEnabled(pluginId, false)
  await commandPromise
  await waitForLog({ pluginService, pluginId, pattern: /Command stopped|Command failed/i })
  const logs = collectLogs(pluginService, pluginId)
  return {
    requested: true,
    stopRequested: logContains(logs, /Command stop requested/i),
    exitConfirmed: logContains(logs, /Command stopped/i),
    treeCleanupAttempted: logContains(logs, /tree cleanup/i),
    transcriptPath: persistStepTranscript({ filePath: transcriptPath, logs, commandPrefix: 'announce' })
  }
}

const runServiceEvidence = async ({ pluginService, pluginId, transcriptPath }) => {
  pluginService.setEnabled(pluginId, true)
  await pluginService.startService(pluginId, 'companion')
  await waitForLog({ pluginService, pluginId, pattern: /Service started/i })
  pluginService.stopService(pluginId, 'companion')
  await waitForLog({ pluginService, pluginId, pattern: /Service stopped|Service exited|force stop/i, timeoutMs: 4000 })
  const logs = collectLogs(pluginService, pluginId)
  return {
    requested: true,
    stopRequested: logContains(logs, /Service stop requested|Service stopped|Service exited/i),
    exitConfirmed: logContains(logs, /Service stopped|Service exited/i),
    processGroupCleanupAttempted: logContains(logs, /Service stop requested|Service stopped|Service exited/i),
    treeCleanupAttempted: logContains(logs, /tree cleanup/i),
    forceStopAttempted: logContains(logs, /force stop requested|force kill|force stop/i),
    transcriptPath: persistStepTranscript({ filePath: transcriptPath, logs, commandPrefix: 'service:' })
  }
}

const runPackagedPluginCleanupEvidence = async ({
  app,
  pluginInstallService,
  pluginService,
  env = process.env
} = {}) => {
  if (!isPackagedCleanupEvidenceEnabled(env)) return null
  const outputPath = env.OPENPET_PACKAGED_PLUGIN_CLEANUP_OUTPUT
  if (!outputPath) throw new Error('OPENPET_PACKAGED_PLUGIN_CLEANUP_OUTPUT is required')
  const pluginSource = env.OPENPET_PACKAGED_PLUGIN_CLEANUP_PLUGIN_SOURCE
  if (!pluginSource) throw new Error('OPENPET_PACKAGED_PLUGIN_CLEANUP_PLUGIN_SOURCE is required')
  const stdoutPath = env.OPENPET_PACKAGED_PLUGIN_CLEANUP_STDOUT || ''
  const stderrPath = env.OPENPET_PACKAGED_PLUGIN_CLEANUP_STDERR || ''
  const generatedAt = new Date().toISOString()
  const transcriptDir = path.dirname(path.resolve(outputPath))
  const hostApp = env.OPENPET_PACKAGED_PLUGIN_CLEANUP_APP_PATH || app?.getAppPath?.() || 'OpenPet packaged app'
  let pluginId = 'openpet.cleanup-evidence-fixture'
  const stdout = []
  const stderr = []

  try {
    pluginId = installAndEnablePlugin({ pluginInstallService, pluginService, pluginSource })
    stdout.push(`installed ${pluginId}`)
    const setup = await runSetupEvidence({
      pluginService,
      pluginId,
      transcriptPath: path.join(transcriptDir, 'packaged-plugin-cleanup-setup.txt')
    })
    const command = await runCommandEvidence({
      pluginService,
      pluginId,
      transcriptPath: path.join(transcriptDir, 'packaged-plugin-cleanup-command.txt')
    })
    const service = await runServiceEvidence({
      pluginService,
      pluginId,
      transcriptPath: path.join(transcriptDir, 'packaged-plugin-cleanup-service.txt')
    })
    const artifact = {
      schemaVersion: 1,
      generatedAt,
      pluginId,
      hostApp,
      setup,
      command,
      service,
      logPath: path.join(transcriptDir, 'packaged-plugin-cleanup-logs.json')
    }
    writeJson(artifact.logPath, collectLogs(pluginService, pluginId))
    writeJson(outputPath, artifact)
    return artifact
  } catch (error) {
    stderr.push(error.message || String(error))
    const artifact = {
      schemaVersion: 1,
      generatedAt,
      pluginId,
      hostApp,
      error: error.message || String(error),
      setup: { requested: false, stopRequested: false, exitConfirmed: false, transcriptPath: '' },
      command: { requested: false, stopRequested: false, exitConfirmed: false, transcriptPath: '' },
      service: { requested: false, stopRequested: false, exitConfirmed: false, transcriptPath: '' }
    }
    writeJson(outputPath, artifact)
    return artifact
  } finally {
    if (stdoutPath) writeText(stdoutPath, stdout.join('\n') + (stdout.length ? '\n' : ''))
    if (stderrPath) writeText(stderrPath, stderr.join('\n') + (stderr.length ? '\n' : ''))
    const quitDelayMs = Math.max(0, Number(env.OPENPET_PACKAGED_PLUGIN_CLEANUP_QUIT_DELAY_MS || 300) || 0)
    setTimeout(() => app?.quit?.(), quitDelayMs)
  }
}

const maybeRunPackagedPluginCleanupEvidence = (deps) => {
  if (!isPackagedCleanupEvidenceEnabled(deps?.env || process.env)) return false
  runPackagedPluginCleanupEvidence(deps).catch((error) => {
    const outputPath = deps?.env?.OPENPET_PACKAGED_PLUGIN_CLEANUP_OUTPUT || process.env.OPENPET_PACKAGED_PLUGIN_CLEANUP_OUTPUT
    if (outputPath) {
      writeJson(outputPath, {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        error: error.message || String(error),
        setup: { requested: false, stopRequested: false, exitConfirmed: false, transcriptPath: '' },
        command: { requested: false, stopRequested: false, exitConfirmed: false, transcriptPath: '' },
        service: { requested: false, stopRequested: false, exitConfirmed: false, transcriptPath: '' }
      })
    }
    deps?.app?.quit?.()
  })
  return true
}

module.exports = {
  isPackagedCleanupEvidenceEnabled,
  maybeRunPackagedPluginCleanupEvidence,
  runPackagedPluginCleanupEvidence
}
