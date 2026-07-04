const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createAgentAwarenessLocalSmokeArchive,
  createReadme,
  parseArgs
} = require('../../scripts/create-agent-awareness-local-smoke-archive')

const fixedNow = () => new Date('2026-07-03T16:00:00.000Z')

const createSessionFixture = ({
  sessionId = '2026-07-03T15-38-32-999Z',
  sanitized = true
} = {}) => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-archive-'))
  const sessionDir = path.join(rootDir, sessionId)
  fs.mkdirSync(sessionDir, { recursive: true })

  const report = {
    ok: true,
    generatedAt: '2026-07-03T15:38:33.000Z',
    source: 'scripts/run-agent-awareness-local-smoke.js',
    codexHome: sanitized ? '[redacted-local-codex-home]' : '/Users/mango/.codex',
    sessionId,
    sessionDir: `tmp/agent-awareness-real-codex-acceptance/${sessionId}`,
    pluginDataDir: `tmp/agent-awareness-real-codex-acceptance/${sessionId}/plugin-data`,
    resultPath: `tmp/agent-awareness-real-codex-acceptance/${sessionId}/agent-awareness-local-smoke-result.json`,
    scanTimeoutMs: 12000,
    sampleLimit: 5,
    sanitizedSignalDetected: true,
    timedOut: false,
    healthUrl: sanitized ? '[local-url]' : 'http://127.0.0.1:8795/health',
    hookPlan: {
      ok: true,
      serviceUrl: sanitized ? '[local-url]' : 'http://127.0.0.1:8795/api/events',
      authFile: 'plugin-auth-file',
      instructionsFile: 'codex-hook-plan.md',
      externalWrites: false,
      dataDirConfigured: true
    },
    health: {
      ok: true,
      service: 'agent-awareness',
      diagnostics: {
        sessionCount: 20,
        activeSessionCount: 2,
        totalEvents: 1000,
        seenCount: 1355,
        unsupportedLifecycleRecordCount: 19,
        lastError: ''
      }
    },
    sessions: [
      {
        sessionId: 'c769bb02d6f5',
        status: 'working',
        type: 'tool.started',
        project: 'OpenPet #262c94',
        message: 'Codex started a tool call.',
        timestamp: '2026-07-03T15:38:32.670Z',
        eventCount: 71
      }
    ],
    redactionChecks: {
      sessionIdsHashed: true,
      projectLabelsRedacted: true,
      noRawPaths: true,
      noLoopbackUrls: true,
      noSecrets: true
    },
    manualAcceptanceTemplate: {
      dashboardUseful: null,
      petSpeechNoiseAcceptable: null,
      redactionLooksSafe: true,
      notes: ''
    }
  }

  fs.writeFileSync(path.join(sessionDir, 'agent-awareness-local-smoke-result.json'), `${JSON.stringify(report, null, 2)}\n`)
  return { rootDir, sessionDir, report }
}

test('parseArgs accepts archive inputs and flags', () => {
  const options = parseArgs([
    '--session-dir', 'tmp/session',
    '--archive-dir', 'docs/archive',
    '--output', 'docs/archive/result.json',
    '--json'
  ])

  assert.equal(options.sessionDir, 'tmp/session')
  assert.equal(options.archiveDir, 'docs/archive')
  assert.equal(options.outputPath, 'docs/archive/result.json')
  assert.equal(options.json, true)
})

test('parseArgs rejects missing and unexpected arguments', () => {
  assert.throws(() => parseArgs([]), /--session-dir is required/)
  assert.throws(() => parseArgs(['--session-dir']), /--session-dir requires a value/)
  assert.throws(() => parseArgs(['--wat']), /Unexpected argument/)
})

test('createReadme preserves privacy-first claim boundary', () => {
  const { report } = createSessionFixture()
  const readme = createReadme({ report, archiveDir: '/tmp/archive' })

  assert.match(readme, /Agent Awareness Local Smoke Evidence/)
  assert.match(readme, /## Manual Acceptance/)
  assert.match(readme, /manualAcceptanceTemplate/)
  assert.match(readme, /does not by itself prove/i)
  assert.match(readme, /unsupportedLifecycleRecordCount = 19/)
  assert.match(readme, /npm run run-agent-awareness-local-smoke -- --codex-home ~\/\.codex/)
  assert.match(readme, /npm run update-agent-awareness-local-smoke-report/)
})

test('createAgentAwarenessLocalSmokeArchive copies sanitized artifacts and writes archive result', () => {
  const { rootDir, sessionDir } = createSessionFixture()
  const archiveDir = path.join(rootDir, 'archive', '2026-07-03T15-38-32-999Z')

  const result = createAgentAwarenessLocalSmokeArchive({
    sessionDir,
    archiveDir,
    now: fixedNow
  })

  assert.equal(result.ok, true)
  assert.equal(result.archive.archiveDir, path.resolve(archiveDir))
  assert.equal(result.smoke.sanitizedSignalDetected, true)
  assert.equal(result.smoke.sessionCount, 20)
  assert.equal(result.smoke.unsupportedLifecycleRecordCount, 19)
  assert.equal(result.smoke.manualAcceptanceTemplatePresent, true)
  assert.equal(result.smoke.manualAcceptance.dashboardUseful, 'pending')
  assert.equal(result.smoke.manualAcceptance.petSpeechNoiseAcceptable, 'pending')
  assert.equal(result.smoke.manualAcceptance.redactionLooksSafe, 'pass')
  assert.equal(result.smoke.manualAcceptance.notesPresent, false)
  assert.equal(result.files.length, 2)

  const archivedReportPath = path.join(archiveDir, 'agent-awareness-local-smoke-result.json')
  const archivedReadmePath = path.join(archiveDir, 'README.md')
  const archiveResultPath = path.join(archiveDir, 'agent-awareness-local-smoke-archive-result.json')
  assert.equal(fs.existsSync(archivedReportPath), true)
  assert.equal(fs.existsSync(archivedReadmePath), true)
  assert.equal(fs.existsSync(archiveResultPath), true)

  const archivedReport = JSON.parse(fs.readFileSync(archivedReportPath, 'utf-8'))
  assert.equal(archivedReport.codexHome, '[redacted-local-codex-home]')
  assert.equal(archivedReport.healthUrl, '[local-url]')

  const archivedReadme = fs.readFileSync(archivedReadmePath, 'utf-8')
  assert.match(archivedReadme, /privacy-safe session discovery/)
  assert.match(archivedReadme, /does not by itself prove/i)

  const archiveResult = JSON.parse(fs.readFileSync(archiveResultPath, 'utf-8'))
  assert.equal(archiveResult.ok, true)
  assert.equal(archiveResult.smoke.totalEvents, 1000)
  assert.equal(archiveResult.smoke.manualAcceptance.dashboardUseful, 'pending')
})

test('createAgentAwarenessLocalSmokeArchive rejects missing required files', () => {
  const { rootDir, sessionDir } = createSessionFixture()
  const archiveDir = path.join(rootDir, 'archive', '2026-07-03T15-38-32-999Z')
  fs.rmSync(path.join(sessionDir, 'agent-awareness-local-smoke-result.json'))

  assert.throws(() => createAgentAwarenessLocalSmokeArchive({ sessionDir, archiveDir, now: fixedNow }), /agentAwarenessLocalSmokeResult is missing/)
})

test('createAgentAwarenessLocalSmokeArchive rejects unsanitized reports', () => {
  const { rootDir, sessionDir } = createSessionFixture({ sanitized: false })
  const archiveDir = path.join(rootDir, 'archive', '2026-07-03T15-38-32-999Z')

  assert.throws(() => createAgentAwarenessLocalSmokeArchive({ sessionDir, archiveDir, now: fixedNow }), /must be redacted/)
})

test('createAgentAwarenessLocalSmokeArchive rejects sensitive authorization text in reports', () => {
  const { rootDir, sessionDir } = createSessionFixture()
  const reportPath = path.join(sessionDir, 'agent-awareness-local-smoke-result.json')
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'))
  report.manualAcceptanceTemplate.notes = 'Authorization: Bearer secret-token'
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  const archiveDir = path.join(rootDir, 'archive', '2026-07-03T15-38-32-999Z')
  assert.throws(
    () => createAgentAwarenessLocalSmokeArchive({ sessionDir, archiveDir, now: fixedNow }),
    /authorization header-like text/
  )
})

test('createAgentAwarenessLocalSmokeArchive refuses to overwrite an existing archive directory', () => {
  const { rootDir, sessionDir } = createSessionFixture()
  const archiveDir = path.join(rootDir, 'archive', '2026-07-03T15-38-32-999Z')
  fs.mkdirSync(archiveDir, { recursive: true })

  assert.throws(() => createAgentAwarenessLocalSmokeArchive({ sessionDir, archiveDir, now: fixedNow }), /archiveDir already exists/)
})
