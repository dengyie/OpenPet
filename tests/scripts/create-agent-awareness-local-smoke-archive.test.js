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
    sessionDir: `agent-awareness-local-smoke/${sessionId}`,
    pluginDataDir: 'plugin-data',
    resultPath: 'agent-awareness-local-smoke-result.json',
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
    notificationPolicyEvidence: {
      source: 'state-mapper-synthetic-sequence',
      eventCount: 5,
      petEventCount: 5,
      speechCount: 2,
      suppressedSpeechCount: 3,
      routineStatusSuppressed: true,
      urgentTransitionSpoke: true,
      repeatedUrgentSuppressed: true,
      repeatedCompletionSuppressed: true,
      eventPreservedWhenSpeechSuppressed: true,
      contentFreeDecisionEvidence: true,
      decisionFields: ['status', 'priority', 'reason', 'shouldSpeak', 'cooldownMs']
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
  report.manualAcceptanceTemplate.notes = 'Separate live-app verification after this smoke run confirmed the dev7 app health endpoint showed hook installed.'
  const readme = createReadme({ report, archiveDir: '/tmp/archive' })

  assert.match(readme, /Agent Awareness Local Smoke Evidence/)
  assert.match(readme, /## Manual Acceptance/)
  assert.match(readme, /separate live-app verification/i)
  assert.match(readme, /outside the archived smoke run/i)
  assert.match(readme, /manualAcceptanceTemplate/)
  assert.match(readme, /Notification policy/)
  assert.match(readme, /repeatedUrgentSuppressed = true/)
  assert.match(readme, /does not by itself prove/i)
  assert.match(readme, /unsupportedLifecycleRecordCount = 19/)
  assert.match(readme, /npm run run-agent-awareness-local-smoke -- --codex-home ~\/\.codex/)
  assert.match(readme, /npm run update-agent-awareness-local-smoke-report/)
})

test('createReadme falls back to current agent-awareness-local-smoke contract when source session fields are missing', () => {
  const { report } = createSessionFixture()
  delete report.sessionDir
  delete report.resultPath

  const readme = createReadme({ report, archiveDir: '/tmp/archive' })

  assert.match(readme, /--output-dir agent-awareness-local-smoke/i)
  assert.match(readme, /--session-dir agent-awareness-local-smoke\/<session>/i)
  assert.doesNotMatch(readme, /tmp\/agent-awareness-real-codex-acceptance/i)
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
  assert.equal(result.smoke.sanitizedSignalDetected, true)
  assert.equal(result.smoke.sessionCount, 20)
  assert.equal(result.smoke.unsupportedLifecycleRecordCount, 19)
  assert.equal(result.smoke.manualAcceptanceTemplatePresent, true)
  assert.equal(result.smoke.manualAcceptance.dashboardUseful, 'pending')
  assert.equal(result.smoke.manualAcceptance.petSpeechNoiseAcceptable, 'pending')
  assert.equal(result.smoke.manualAcceptance.redactionLooksSafe, 'pass')
  assert.equal(result.smoke.manualAcceptance.notesPresent, false)
  assert.deepEqual(result.smoke.notificationPolicy, {
    present: true,
    eventCount: 5,
    petEventCount: 5,
    speechCount: 2,
    suppressedSpeechCount: 3,
    routineStatusSuppressed: 'pass',
    urgentTransitionSpoke: 'pass',
    repeatedUrgentSuppressed: 'pass',
    repeatedCompletionSuppressed: 'pass',
    eventPreservedWhenSpeechSuppressed: 'pass',
    contentFreeDecisionEvidence: 'pass'
  })
  assert.equal(result.source.sessionDir, 'agent-awareness-local-smoke/2026-07-03T15-38-32-999Z')
  assert.equal(result.source.resultPath, 'agent-awareness-local-smoke/2026-07-03T15-38-32-999Z/agent-awareness-local-smoke-result.json')
  assert.equal(result.archive.archiveDir, 'docs/release-evidence/agent-awareness-local-smoke/2026-07-03T15-38-32-999Z')
  assert.equal(result.archive.outputPath, 'docs/release-evidence/agent-awareness-local-smoke/2026-07-03T15-38-32-999Z/agent-awareness-local-smoke-archive-result.json')
  assert.equal(result.files.length, 2)
  assert.deepEqual(result.files.map((file) => file.path), [
    'agent-awareness-local-smoke-result.json',
    'README.md'
  ])

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
  assert.match(archivedReadme, /synthetic notification-policy evidence/i)
  assert.match(archivedReadme, /does not by itself prove/i)

  const archiveResult = JSON.parse(fs.readFileSync(archiveResultPath, 'utf-8'))
  assert.equal(archiveResult.ok, true)
  assert.equal(archiveResult.smoke.totalEvents, 1000)
  assert.equal(archiveResult.smoke.manualAcceptance.dashboardUseful, 'pending')
  assert.equal(archiveResult.smoke.notificationPolicy.repeatedCompletionSuppressed, 'pass')
  assert.doesNotMatch(JSON.stringify(archiveResult), /\/Users\//)
})

test('createAgentAwarenessLocalSmokeArchive falls back to current agent-awareness-local-smoke source paths when report fields are missing', () => {
  const { rootDir, sessionDir } = createSessionFixture()
  const reportPath = path.join(sessionDir, 'agent-awareness-local-smoke-result.json')
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'))
  delete report.sessionDir
  delete report.resultPath
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  const archiveDir = path.join(rootDir, 'archive', '2026-07-03T15-38-32-999Z')
  const result = createAgentAwarenessLocalSmokeArchive({ sessionDir, archiveDir, now: fixedNow })

  assert.equal(result.source.sessionDir, 'agent-awareness-local-smoke/2026-07-03T15-38-32-999Z')
  assert.equal(result.source.resultPath, 'agent-awareness-local-smoke/2026-07-03T15-38-32-999Z/agent-awareness-local-smoke-result.json')
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

test('createAgentAwarenessLocalSmokeArchive rejects content-bearing notification evidence drift', () => {
  const { rootDir, sessionDir } = createSessionFixture()
  const reportPath = path.join(sessionDir, 'agent-awareness-local-smoke-result.json')
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'))
  report.notificationPolicyEvidence.contentFreeDecisionEvidence = false
  report.notificationPolicyEvidence.decisionFields = ['status', 'priority', 'message']
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  const archiveDir = path.join(rootDir, 'archive', '2026-07-03T15-38-32-999Z')
  assert.throws(
    () => createAgentAwarenessLocalSmokeArchive({ sessionDir, archiveDir, now: fixedNow }),
    /notificationPolicyEvidence/
  )
})

test('createAgentAwarenessLocalSmokeArchive rejects notification evidence without source', () => {
  const { rootDir, sessionDir } = createSessionFixture()
  const reportPath = path.join(sessionDir, 'agent-awareness-local-smoke-result.json')
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'))
  delete report.notificationPolicyEvidence.source
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  const archiveDir = path.join(rootDir, 'archive', '2026-07-03T15-38-32-999Z')
  assert.throws(
    () => createAgentAwarenessLocalSmokeArchive({ sessionDir, archiveDir, now: fixedNow }),
    /notificationPolicyEvidence\.source/
  )
})

test('createAgentAwarenessLocalSmokeArchive rejects notification evidence with incomplete decision fields', () => {
  const { rootDir, sessionDir } = createSessionFixture()
  const reportPath = path.join(sessionDir, 'agent-awareness-local-smoke-result.json')
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'))
  report.notificationPolicyEvidence.decisionFields = ['status', 'priority', 'reason', 'shouldSpeak']
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  const archiveDir = path.join(rootDir, 'archive', '2026-07-03T15-38-32-999Z')
  assert.throws(
    () => createAgentAwarenessLocalSmokeArchive({ sessionDir, archiveDir, now: fixedNow }),
    /notificationPolicyEvidence\.decisionFields/
  )
})

test('createAgentAwarenessLocalSmokeArchive keeps legacy reports without notification evidence compatible', () => {
  const { rootDir, sessionDir } = createSessionFixture()
  const reportPath = path.join(sessionDir, 'agent-awareness-local-smoke-result.json')
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'))
  delete report.notificationPolicyEvidence
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  const archiveDir = path.join(rootDir, 'archive', '2026-07-03T15-38-32-999Z')
  const result = createAgentAwarenessLocalSmokeArchive({ sessionDir, archiveDir, now: fixedNow })

  assert.equal(result.ok, true)
  assert.equal(result.smoke.notificationPolicy.present, false)
  assert.equal(result.smoke.notificationPolicy.contentFreeDecisionEvidence, 'pending')
})

test('createAgentAwarenessLocalSmokeArchive refuses to overwrite an existing archive directory', () => {
  const { rootDir, sessionDir } = createSessionFixture()
  const archiveDir = path.join(rootDir, 'archive', '2026-07-03T15-38-32-999Z')
  fs.mkdirSync(archiveDir, { recursive: true })

  assert.throws(() => createAgentAwarenessLocalSmokeArchive({ sessionDir, archiveDir, now: fixedNow }), /archiveDir already exists/)
})
