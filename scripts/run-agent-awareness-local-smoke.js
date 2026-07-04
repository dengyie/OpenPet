const fs = require('fs')
const os = require('os')
const path = require('path')
const { createAgentAwarenessServer } = require('../examples/plugins/agent-awareness/service/agent-awareness-service')
const { createCodexRolloutPoller } = require('../examples/plugins/agent-awareness/service/adapters/codex-rollout-poller')
const { sanitizeText } = require('../examples/plugins/agent-awareness/service/adapters/codex')
const { writeCodexHookPlan, toCommandOutput } = require('../examples/plugins/agent-awareness/commands/codex-hook-plan')

const DEFAULT_OUTPUT_DIR = path.join(__dirname, '..', 'release', 'agent-awareness-local-smoke')
const DEFAULT_SCAN_TIMEOUT_MS = 12000
const DEFAULT_SAMPLE_LIMIT = 5
const POLL_INTERVAL_MS = 400

const usage = () => [
  'Usage: node scripts/run-agent-awareness-local-smoke.js [options]',
  '',
  'Options:',
  '  --codex-home <dir>       Codex home directory to scan. Default: ~/.codex',
  '  --output-dir <dir>       Directory for smoke session artifacts. Default: release/agent-awareness-local-smoke',
  '  --scan-timeout-ms <n>    How long to wait for sanitized session signal. Default: 12000',
  '  --sample-limit <n>       Maximum sanitized sessions to keep in the report. Default: 5',
  '  --help',
  '',
  'This smoke entrypoint starts the bundled agent-awareness service against a local',
  'Codex home, waits for sanitized rollout signal, writes a redacted JSON summary,',
  'and keeps the remaining acceptance boundary explicit for human review.'
].join('\n')

const defaultCodexHome = ({ homedir = os.homedir } = {}) => path.join(homedir(), '.codex')

const createSessionId = (date) => date.toISOString().replace(/[:.]/g, '-')

const createSessionPaths = ({ outputDir = DEFAULT_OUTPUT_DIR, now = () => new Date() } = {}) => {
  const sessionId = createSessionId(now())
  const sessionDir = path.resolve(outputDir, sessionId)
  return {
    sessionId,
    sessionDir,
    pluginDataDir: path.join(sessionDir, 'plugin-data'),
    resultPath: path.join(sessionDir, 'agent-awareness-local-smoke-result.json')
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const toRepoRelativePath = (filePath, projectRoot) => {
  const rawPath = String(filePath || '').trim()
  const rootPath = String(projectRoot || '').trim()
  if (!rawPath || !rootPath) return sanitizeText(rawPath, 240)
  const resolvedFilePath = path.resolve(rawPath)
  const resolvedProjectRoot = path.resolve(rootPath)
  if (resolvedFilePath === resolvedProjectRoot) return '.'
  if (!resolvedFilePath.startsWith(`${resolvedProjectRoot}${path.sep}`)) return sanitizeText(rawPath, 240)
  return path.relative(resolvedProjectRoot, resolvedFilePath) || '.'
}

const sanitizeSessions = (sessions = [], sampleLimit = DEFAULT_SAMPLE_LIMIT) => (
  sessions.slice(0, Math.max(1, sampleLimit)).map((session) => ({
    sessionId: sanitizeText(session?.sessionId || '', 40),
    status: sanitizeText(session?.status || '', 32),
    type: sanitizeText(session?.type || '', 64),
    project: sanitizeText(session?.project || '', 120),
    message: sanitizeText(session?.message || '', 160),
    timestamp: sanitizeText(session?.timestamp || '', 40),
    eventCount: Array.isArray(session?.history) ? session.history.length : 0
  }))
)

const createEmptyHealth = () => ({
  ok: false,
  service: '',
  hookMode: {
    installed: false,
    mode: 'not-installed',
    planAvailable: false,
    tokenConfigured: false,
    ingestAuthRequired: false
  },
  diagnostics: {
    sessionCount: 0,
    activeSessionCount: 0,
    totalEvents: 0,
    seenCount: 0,
    ignoredContentRecordCount: 0,
    ignoredMetadataRecordCount: 0,
    unknownRecordCount: 0,
    malformedRecordCount: 0,
    unsupportedLifecycleRecordCount: 0,
    lastEventAt: '',
    lastScanAt: '',
    lastError: ''
  },
  codexPoller: {
    enabled: false,
    lastScanAt: '',
    lastError: '',
    seenCount: 0,
    ignoredContentRecordCount: 0,
    ignoredMetadataRecordCount: 0,
    unknownRecordCount: 0,
    malformedRecordCount: 0,
    unsupportedLifecycleRecordCount: 0
  }
})

const sanitizePersistedSummary = (summary = {}, { projectRoot } = {}) => ({
  ...summary,
  codexHome: '[redacted-local-codex-home]',
  sessionDir: toRepoRelativePath(summary.sessionDir, projectRoot),
  pluginDataDir: toRepoRelativePath(summary.pluginDataDir, projectRoot),
  resultPath: toRepoRelativePath(summary.resultPath, projectRoot),
  healthUrl: '[local-url]',
  hookPlan: {
    ...(summary.hookPlan || {}),
    serviceUrl: '[local-url]'
  }
})

const parseArgs = (argv) => {
  const options = {
    codexHome: defaultCodexHome(),
    outputDir: DEFAULT_OUTPUT_DIR,
    scanTimeoutMs: DEFAULT_SCAN_TIMEOUT_MS,
    sampleLimit: DEFAULT_SAMPLE_LIMIT,
    help: false
  }

  const readValue = (index, flag) => {
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
    return value
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--codex-home') {
      options.codexHome = readValue(index, arg)
      index += 1
    } else if (arg === '--output-dir') {
      options.outputDir = readValue(index, arg)
      index += 1
    } else if (arg === '--scan-timeout-ms') {
      options.scanTimeoutMs = Number(readValue(index, arg))
      index += 1
    } else if (arg === '--sample-limit') {
      options.sampleLimit = Number(readValue(index, arg))
      index += 1
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  if (!Number.isFinite(options.scanTimeoutMs) || options.scanTimeoutMs <= 0) {
    throw new Error('--scan-timeout-ms must be a positive number')
  }
  if (!Number.isFinite(options.sampleLimit) || options.sampleLimit <= 0) {
    throw new Error('--sample-limit must be a positive number')
  }

  options.codexHome = path.resolve(options.codexHome)
  options.outputDir = path.resolve(options.outputDir)
  options.scanTimeoutMs = Math.round(options.scanTimeoutMs)
  options.sampleLimit = Math.round(options.sampleLimit)
  return options
}

const readJson = async ({ fetchImpl, url }) => {
  const response = await fetchImpl(url)
  if (!response.ok) throw new Error(`Request failed: ${response.status}`)
  return response.json()
}

const readServiceSnapshot = async ({ fetchImpl, port }) => {
  const health = await readJson({ fetchImpl, url: `http://127.0.0.1:${port}/health` })
  const sessionBody = await readJson({ fetchImpl, url: `http://127.0.0.1:${port}/api/sessions` })
  return {
    health,
    sessions: Array.isArray(sessionBody?.sessions) ? sessionBody.sessions : []
  }
}

const hasSanitizedSessionSignal = ({ sessions = [], health = createEmptyHealth() } = {}) => {
  if ((health?.diagnostics?.sessionCount || 0) <= 0) return false
  if (!Array.isArray(sessions) || sessions.length <= 0) return false
  return sessions.some((session) => /^[a-f0-9]{12}$/i.test(String(session?.sessionId || '')))
}

const createRedactionChecks = ({ sessions = [], summary = {}, codexHome = '' } = {}) => {
  const serialized = JSON.stringify({
    sessions,
    diagnostics: summary?.health?.diagnostics || {},
    codexPoller: summary?.health?.codexPoller || {}
  })
  const pathLeakPattern = /\/Users\/|\/private\/|\/tmp\/|\/var\/folders\/|[A-Za-z]:\\/i
  const localUrlPattern = /127\.0\.0\.1|localhost|\[::1\]/i
  const secretPattern = /\bsk-[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._-]+/i
  return {
    sessionIdsHashed: sessions.every((session) => /^[a-f0-9]{12}$/i.test(String(session?.sessionId || ''))),
    projectLabelsRedacted: sessions.every((session) => !/[\\/]/.test(String(session?.project || ''))),
    noRawPaths: !pathLeakPattern.test(serialized) && !serialized.includes(String(codexHome || '')),
    noLoopbackUrls: !localUrlPattern.test(serialized),
    noSecrets: !secretPattern.test(serialized)
  }
}

const persistSummary = ({ summary, projectRoot }) => {
  const sanitized = sanitizePersistedSummary(summary, { projectRoot })
  fs.writeFileSync(summary.resultPath, `${JSON.stringify(sanitized, null, 2)}\n`)
  return sanitized
}

const runAgentAwarenessLocalSmoke = async ({
  codexHome = defaultCodexHome(),
  outputDir = DEFAULT_OUTPUT_DIR,
  scanTimeoutMs = DEFAULT_SCAN_TIMEOUT_MS,
  sampleLimit = DEFAULT_SAMPLE_LIMIT,
  now = () => new Date(),
  projectRoot = path.join(__dirname, '..'),
  fetchImpl = fetch,
  createAgentAwarenessServerImpl = createAgentAwarenessServer,
  createCodexRolloutPollerImpl = createCodexRolloutPoller,
  writeCodexHookPlanImpl = writeCodexHookPlan
} = {}) => {
  const sessionPaths = createSessionPaths({ outputDir, now })
  fs.mkdirSync(sessionPaths.sessionDir, { recursive: true })
  fs.mkdirSync(sessionPaths.pluginDataDir, { recursive: true })

  const summary = {
    ok: false,
    generatedAt: now().toISOString(),
    source: 'scripts/run-agent-awareness-local-smoke.js',
    codexHome: path.resolve(codexHome),
    sessionId: sessionPaths.sessionId,
    sessionDir: sessionPaths.sessionDir,
    pluginDataDir: sessionPaths.pluginDataDir,
    resultPath: sessionPaths.resultPath,
    scanTimeoutMs,
    sampleLimit,
    sanitizedSignalDetected: false,
    timedOut: false,
    healthUrl: '[local-url]',
    hookPlan: {
      ok: false,
      serviceUrl: '[local-url]',
      authFile: 'plugin-auth-file',
      instructionsFile: 'codex-hook-plan.md',
      externalWrites: false,
      dataDirConfigured: true
    },
    health: createEmptyHealth(),
    sessions: [],
    redactionChecks: {
      sessionIdsHashed: false,
      projectLabelsRedacted: false,
      noRawPaths: false,
      noLoopbackUrls: false,
      noSecrets: false
    },
    manualAcceptanceTemplate: {
      dashboardUseful: null,
      petSpeechNoiseAcceptable: null,
      redactionLooksSafe: null,
      notes: ''
    }
  }

  let service = null
  try {
    service = createAgentAwarenessServerImpl({
      dataDir: sessionPaths.pluginDataDir,
      bridgeClient: {
        event: async () => {},
        say: async () => {}
      },
      createRolloutPoller: (options) => createCodexRolloutPollerImpl({
        ...options,
        codexHome: path.resolve(codexHome)
      })
    })

    await service.start(0)
    const port = service.server.address().port
    summary.healthUrl = `http://127.0.0.1:${port}/health`
    summary.hookPlan = toCommandOutput(writeCodexHookPlanImpl({
      dataDir: sessionPaths.pluginDataDir,
      port
    }))

    const startedAt = Date.now()
    let snapshot = { health: createEmptyHealth(), sessions: [] }
    while ((Date.now() - startedAt) < scanTimeoutMs) {
      snapshot = await readServiceSnapshot({ fetchImpl, port })
      summary.health = {
        ok: Boolean(snapshot.health?.ok),
        service: sanitizeText(snapshot.health?.service || '', 64),
        hookMode: snapshot.health?.hookMode || createEmptyHealth().hookMode,
        diagnostics: snapshot.health?.diagnostics || createEmptyHealth().diagnostics,
        codexPoller: snapshot.health?.codexPoller || createEmptyHealth().codexPoller
      }
      summary.sessions = sanitizeSessions(snapshot.sessions, sampleLimit)
      summary.sanitizedSignalDetected = hasSanitizedSessionSignal(snapshot)
      if (summary.sanitizedSignalDetected) break
      await delay(POLL_INTERVAL_MS)
    }

    summary.timedOut = !summary.sanitizedSignalDetected
    summary.redactionChecks = createRedactionChecks({
      sessions: summary.sessions,
      summary,
      codexHome
    })
    summary.manualAcceptanceTemplate = {
      dashboardUseful: null,
      petSpeechNoiseAcceptable: null,
      redactionLooksSafe: Object.values(summary.redactionChecks).every(Boolean) ? true : null,
      notes: ''
    }
    summary.ok = Boolean(summary.sanitizedSignalDetected) && Object.values(summary.redactionChecks).every(Boolean)
  } catch (error) {
    summary.ok = false
    summary.health = {
      ...summary.health,
      diagnostics: {
        ...summary.health.diagnostics,
        lastError: sanitizeText(error?.message || 'Agent awareness smoke failed', 160)
      },
      codexPoller: {
        ...summary.health.codexPoller,
        lastError: sanitizeText(error?.message || 'Agent awareness smoke failed', 160)
      }
    }
  } finally {
    if (service) {
      try {
        await service.close()
      } catch (_) {}
    }
    persistSummary({ summary, projectRoot })
  }

  return summary
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const result = await runAgentAwarenessLocalSmoke(options)
  const output = sanitizePersistedSummary(result, {
    projectRoot: path.join(__dirname, '..')
  })
  console.log(JSON.stringify(output, null, 2))
  if (!result.ok) process.exit(1)
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error?.message || error)
    process.exit(1)
  })
}

module.exports = {
  DEFAULT_OUTPUT_DIR,
  DEFAULT_SAMPLE_LIMIT,
  DEFAULT_SCAN_TIMEOUT_MS,
  createSessionPaths,
  defaultCodexHome,
  parseArgs,
  runAgentAwarenessLocalSmoke,
  sanitizePersistedSummary
}
