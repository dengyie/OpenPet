const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  createSessionPaths,
  defaultCodexHome,
  parseArgs,
  runAgentAwarenessLocalSmoke,
  sanitizePersistedSummary
} = require('../../scripts/run-agent-awareness-local-smoke')

const createTempDir = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix))
const resolveOutputPath = (outputDir, sessionId, recordedPath) => (
  path.isAbsolute(recordedPath) ? recordedPath : path.join(outputDir, sessionId, recordedPath)
)

const createCodexRolloutFixture = () => {
  const codexHome = createTempDir('openpet-agent-awareness-codex-home-')
  const sessionsDir = path.join(codexHome, 'sessions')
  fs.mkdirSync(sessionsDir, { recursive: true })
  fs.writeFileSync(path.join(sessionsDir, 'rollout-2026-07-03T00-00-00-1.jsonl'), [
    JSON.stringify({ type: 'session_meta', timestamp: '2026-07-03T00:00:00.000Z', payload: { id: 'raw-session-1', cwd: '/Users/mango/private/project/OpenPet' } }),
    JSON.stringify({ type: 'event_msg', timestamp: '2026-07-03T00:00:01.000Z', payload: { type: 'user_message', message: 'do not store me sk-test123' } }),
    JSON.stringify({ type: 'event_msg', timestamp: '2026-07-03T00:00:02.000Z', payload: { type: 'task_started' } }),
    JSON.stringify({ type: 'event_msg', timestamp: '2026-07-03T00:00:03.000Z', payload: { type: 'task_complete', stdout: 'secret stdout' } })
  ].join('\n'))
  return codexHome
}

test('defaultCodexHome follows the local ~/.codex convention', () => {
  assert.equal(defaultCodexHome({ homedir: () => '/Users/mango' }), '/Users/mango/.codex')
})

test('parseArgs accepts smoke options', () => {
  const options = parseArgs([
    '--codex-home', '/tmp/codex-home',
    '--output-dir', '/tmp/output',
    '--scan-timeout-ms', '9000',
    '--sample-limit', '3'
  ])

  assert.equal(options.codexHome, path.resolve('/tmp/codex-home'))
  assert.equal(options.outputDir, path.resolve('/tmp/output'))
  assert.equal(options.scanTimeoutMs, 9000)
  assert.equal(options.sampleLimit, 3)
})

test('createSessionPaths creates deterministic artifact paths', () => {
  const paths = createSessionPaths({
    outputDir: '/tmp/openpet-agent-awareness-smoke',
    now: () => new Date('2026-07-03T12:34:56.789Z')
  })

  assert.equal(paths.sessionId, '2026-07-03T12-34-56-789Z')
  assert.equal(paths.pluginDataDir.endsWith(path.join('2026-07-03T12-34-56-789Z', 'plugin-data')), true)
  assert.equal(paths.resultPath.endsWith(path.join('2026-07-03T12-34-56-789Z', 'agent-awareness-local-smoke-result.json')), true)
})

test('sanitizePersistedSummary redacts codex home, local URLs, and local artifact paths', () => {
  const sanitized = sanitizePersistedSummary({
    codexHome: '/Users/mango/.codex',
    sessionDir: '/repo/tmp/agent-awareness/2026-07-03T12-34-56-789Z',
    pluginDataDir: '/repo/tmp/agent-awareness/2026-07-03T12-34-56-789Z/plugin-data',
    resultPath: '/repo/tmp/agent-awareness/2026-07-03T12-34-56-789Z/agent-awareness-local-smoke-result.json',
    healthUrl: 'http://127.0.0.1:8899/health'
  }, { projectRoot: '/repo' })

  assert.equal(sanitized.codexHome, '[redacted-local-codex-home]')
  assert.equal(sanitized.sessionDir, 'tmp/agent-awareness/2026-07-03T12-34-56-789Z')
  assert.equal(sanitized.pluginDataDir, 'tmp/agent-awareness/2026-07-03T12-34-56-789Z/plugin-data')
  assert.equal(sanitized.resultPath, 'tmp/agent-awareness/2026-07-03T12-34-56-789Z/agent-awareness-local-smoke-result.json')
  assert.equal(sanitized.healthUrl, '[local-url]')
})

test('runAgentAwarenessLocalSmoke writes a redacted report when sanitized Codex session signal is present', async () => {
  const codexHome = createCodexRolloutFixture()
  const outputDir = createTempDir('openpet-agent-awareness-output-')

  const result = await runAgentAwarenessLocalSmoke({
    codexHome,
    outputDir,
    scanTimeoutMs: 4000,
    sampleLimit: 2,
    now: () => new Date('2026-07-03T12:34:56.789Z')
  })

  assert.equal(result.ok, true)
  assert.equal(result.sanitizedSignalDetected, true)
  assert.equal(result.timedOut, false)
  assert.equal(result.health.ok, true)
  assert.equal(result.health.service, 'agent-awareness')
  assert.equal(result.health.hookMode.planAvailable, true)
  assert.equal(result.health.hookMode.tokenConfigured, true)
  assert.equal(result.health.diagnostics.sessionCount >= 1, true)
  assert.equal(result.health.diagnostics.totalEvents >= 2, true)
  assert.equal(result.hookPlan.authFile, 'plugin-auth-file')
  assert.equal(result.hookPlan.instructionsFile, 'codex-hook-plan.md')
  assert.equal(result.hookPlan.serviceUrl, '[local-url]')
  assert.equal(result.sessions.length >= 1, true)
  assert.match(result.sessions[0].sessionId, /^[a-f0-9]{12}$/)
  assert.match(result.sessions[0].project, /^OpenPet #[a-f0-9]{6}$/)
  assert.equal(result.redactionChecks.sessionIdsHashed, true)
  assert.equal(result.redactionChecks.projectLabelsRedacted, true)
  assert.equal(result.redactionChecks.noRawPaths, true)
  assert.equal(result.redactionChecks.noLoopbackUrls, true)
  assert.equal(result.redactionChecks.noSecrets, true)
  assert.deepEqual(result.manualAcceptanceTemplate, {
    dashboardUseful: null,
    petSpeechNoiseAcceptable: null,
    redactionLooksSafe: true,
    notes: ''
  })
  assert.equal(result.sessionDir, 'agent-awareness-local-smoke/2026-07-03T12-34-56-789Z')
  assert.equal(result.pluginDataDir, 'plugin-data')
  assert.equal(result.resultPath, 'agent-awareness-local-smoke-result.json')
  assert.equal(result.healthUrl, '[local-url]')
  assert.equal(fs.existsSync(resolveOutputPath(outputDir, result.sessionId, result.resultPath)), true)

  const persisted = JSON.parse(fs.readFileSync(resolveOutputPath(outputDir, result.sessionId, result.resultPath), 'utf-8'))
  assert.equal(persisted.ok, true)
  assert.equal(persisted.codexHome, '[redacted-local-codex-home]')
  assert.equal(persisted.healthUrl, '[local-url]')
  assert.equal(JSON.stringify(persisted).includes('/Users/mango/private/project/OpenPet'), false)
  assert.equal(JSON.stringify(persisted).includes('127.0.0.1'), false)
  assert.equal(JSON.stringify(persisted).includes('sk-test123'), false)
})

test('runAgentAwarenessLocalSmoke fails cleanly when no sanitized Codex session signal appears', async () => {
  const codexHome = createTempDir('openpet-agent-awareness-empty-codex-home-')
  const outputDir = createTempDir('openpet-agent-awareness-empty-output-')

  const result = await runAgentAwarenessLocalSmoke({
    codexHome,
    outputDir,
    scanTimeoutMs: 700,
    now: () => new Date('2026-07-03T12:34:56.789Z')
  })

  assert.equal(result.ok, false)
  assert.equal(result.sanitizedSignalDetected, false)
  assert.equal(result.timedOut, true)
  assert.equal(result.health.diagnostics.sessionCount, 0)
  assert.equal(result.sessions.length, 0)
  assert.equal(fs.existsSync(resolveOutputPath(outputDir, result.sessionId, result.resultPath)), true)
})
