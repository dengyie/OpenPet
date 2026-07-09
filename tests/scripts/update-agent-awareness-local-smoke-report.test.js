const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const {
  parseArgs,
  updateAgentAwarenessLocalSmokeReport,
  updateReport,
  validateUpdatedReport
} = require('../../scripts/update-agent-awareness-local-smoke-report')

const createReportFixture = ({
  sessionId = '2026-07-03T16-04-08-824Z',
  notes = '',
  reportOverrides = {}
} = {}) => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-update-'))
  const archiveDir = path.join(rootDir, sessionId)
  const reportPath = path.join(archiveDir, 'agent-awareness-local-smoke-result.json')
  fs.mkdirSync(archiveDir, { recursive: true })

  const report = {
    ok: true,
    generatedAt: '2026-07-03T16:04:08.847Z',
    source: 'scripts/run-agent-awareness-local-smoke.js',
    codexHome: '[redacted-local-codex-home]',
    sessionId,
    sessionDir: `agent-awareness-local-smoke/${sessionId}`,
    pluginDataDir: 'plugin-data',
    resultPath: 'agent-awareness-local-smoke-result.json',
    scanTimeoutMs: 12000,
    sampleLimit: 5,
    sanitizedSignalDetected: true,
    timedOut: false,
    healthUrl: '[local-url]',
    hookPlan: {
      ok: true,
      serviceUrl: '[local-url]',
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
        activeSessionCount: 3,
        totalEvents: 1000,
        seenCount: 1374,
        ignoredContentRecordCount: 3025,
        ignoredMetadataRecordCount: 793,
        unknownRecordCount: 0,
        malformedRecordCount: 0,
        unsupportedLifecycleRecordCount: 0,
        lastEventAt: '2026-07-03T16:04:07.345Z',
        lastScanAt: '2026-07-03T16:04:13.631Z',
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
        timestamp: '2026-07-03T16:04:07.345Z',
        eventCount: 63
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
      notes
    },
    ...reportOverrides
  }

  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  return { archiveDir, reportPath, report }
}

test('parseArgs accepts manual acceptance update options', () => {
  const parsed = parseArgs([
    'docs/release-evidence/agent-awareness-local-smoke/session/agent-awareness-local-smoke-result.json',
    '--output', 'tmp/out.json',
    '--readme', 'tmp/README.md',
    '--dashboard-useful', 'true',
    '--pet-speech-noise-acceptable', 'pending',
    '--redaction-looks-safe', 'false',
    '--notes', 'Review pending follow-up.',
    '--validate-complete'
  ])

  assert.equal(parsed.reportPath, 'docs/release-evidence/agent-awareness-local-smoke/session/agent-awareness-local-smoke-result.json')
  assert.equal(parsed.outputPath, 'tmp/out.json')
  assert.equal(parsed.readmePath, 'tmp/README.md')
  assert.equal(parsed.dashboardUseful, true)
  assert.equal(parsed.petSpeechNoiseAcceptable, null)
  assert.equal(parsed.redactionLooksSafe, false)
  assert.equal(parsed.notes, 'Review pending follow-up.')
  assert.equal(parsed.validateComplete, true)
})

test('parseArgs rejects invalid combinations and values', () => {
  assert.throws(() => parseArgs(['report.json', '--no-readme', '--readme', 'README.md']), /cannot be used with --no-readme/)
  assert.throws(() => parseArgs(['report.json', '--dashboard-useful', 'maybe']), /must be true, false, or pending/)
  assert.throws(() => parseArgs(['report.json', '--redaction-looks-safe', 'pending']), /must be true or false/)
})

test('updateReport updates manual acceptance fields and reads notes from file', () => {
  const { reportPath } = createReportFixture()
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'))
  const notesFile = path.join(path.dirname(reportPath), 'notes.txt')
  fs.writeFileSync(notesFile, 'Dashboard looked useful.\n')

  updateReport(report, {
    dashboardUseful: true,
    petSpeechNoiseAcceptable: false,
    redactionLooksSafe: true,
    notesFile
  })

  assert.equal(report.manualAcceptanceTemplate.dashboardUseful, true)
  assert.equal(report.manualAcceptanceTemplate.petSpeechNoiseAcceptable, false)
  assert.equal(report.manualAcceptanceTemplate.redactionLooksSafe, true)
  assert.equal(report.manualAcceptanceTemplate.notes, 'Dashboard looked useful.')
})

test('validateUpdatedReport requires complete review fields only when requested', () => {
  const { report } = createReportFixture()

  const pendingResult = validateUpdatedReport(report, { validateComplete: false })
  assert.equal(pendingResult.ok, true)

  const incompleteResult = validateUpdatedReport(report, { validateComplete: true })
  assert.equal(incompleteResult.ok, false)
  assert.match(incompleteResult.errors.join('\n'), /dashboardUseful must be filled/i)
  assert.match(incompleteResult.errors.join('\n'), /petSpeechNoiseAcceptable must be filled/i)
})

test('validateUpdatedReport requires notes when a completed manual review fails a check', () => {
  const { report } = createReportFixture()
  report.manualAcceptanceTemplate.dashboardUseful = false
  report.manualAcceptanceTemplate.petSpeechNoiseAcceptable = true
  report.manualAcceptanceTemplate.redactionLooksSafe = true

  const result = validateUpdatedReport(report, { validateComplete: true })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /must explain any failed manual acceptance check/i)
})

test('updateAgentAwarenessLocalSmokeReport rewrites the report and companion README', () => {
  const { archiveDir, reportPath } = createReportFixture()
  const archiveResultPath = path.join(archiveDir, 'agent-awareness-local-smoke-archive-result.json')
  fs.writeFileSync(archiveResultPath, `${JSON.stringify({
    generatedAt: '2026-07-03T16:08:15.308Z',
    ok: true,
    source: {
      sessionDir: '/tmp/source-session',
      resultPath: '/tmp/source-session/agent-awareness-local-smoke-result.json'
    },
    archive: {
      archiveDir,
      outputPath: archiveResultPath
    },
    smoke: {
      sanitizedSignalDetected: true,
      sessionCount: 20,
      activeSessionCount: 3,
      totalEvents: 1000,
      unsupportedLifecycleRecordCount: 0,
      notificationPolicy: {
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
      },
      manualAcceptanceTemplatePresent: true
    },
    files: []
  }, null, 2)}\n`)

  const result = updateAgentAwarenessLocalSmokeReport({
    reportPath,
    options: {
      dashboardUseful: true,
      petSpeechNoiseAcceptable: true,
      redactionLooksSafe: true,
      notes: 'Dashboard clearly showed active Codex work without noisy repeats.',
      validateComplete: true
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.summary.dashboardUseful, 'pass')
  assert.equal(result.summary.petSpeechNoiseAcceptable, 'pass')
  assert.equal(result.summary.redactionLooksSafe, 'pass')
  assert.equal(result.archiveResultPath, archiveResultPath)

  const updatedReport = JSON.parse(fs.readFileSync(reportPath, 'utf-8'))
  assert.equal(updatedReport.manualAcceptanceTemplate.dashboardUseful, true)
  assert.equal(updatedReport.manualAcceptanceTemplate.petSpeechNoiseAcceptable, true)
  assert.equal(updatedReport.manualAcceptanceTemplate.redactionLooksSafe, true)
  assert.match(updatedReport.manualAcceptanceTemplate.notes, /Dashboard clearly showed/)

  const readme = fs.readFileSync(path.join(archiveDir, 'README.md'), 'utf-8')
  assert.match(readme, /## Manual Acceptance/)
  assert.match(readme, /\| Dashboard usefulness \| pass \|/)
  assert.match(readme, /Dashboard clearly showed active Codex work/)
  assert.match(readme, /npm run update-agent-awareness-local-smoke-report/)

  const archiveResult = JSON.parse(fs.readFileSync(archiveResultPath, 'utf-8'))
  assert.equal(archiveResult.smoke.manualAcceptance.dashboardUseful, 'pass')
  assert.equal(archiveResult.smoke.manualAcceptance.petSpeechNoiseAcceptable, 'pass')
  assert.equal(archiveResult.smoke.manualAcceptance.redactionLooksSafe, 'pass')
  assert.equal(archiveResult.smoke.manualAcceptance.notesPresent, true)
  assert.equal(archiveResult.smoke.notificationPolicy.repeatedUrgentSuppressed, 'pass')
  assert.equal(archiveResult.smoke.notificationPolicy.contentFreeDecisionEvidence, 'pass')
  assert.equal(archiveResult.source.sessionDir, 'agent-awareness-local-smoke/2026-07-03T16-04-08-824Z')
  assert.equal(archiveResult.source.resultPath, 'agent-awareness-local-smoke/2026-07-03T16-04-08-824Z/agent-awareness-local-smoke-result.json')
  assert.equal(archiveResult.archive.archiveDir, 'docs/release-evidence/agent-awareness-local-smoke/2026-07-03T16-04-08-824Z')
  assert.equal(archiveResult.archive.outputPath, 'docs/release-evidence/agent-awareness-local-smoke/2026-07-03T16-04-08-824Z/agent-awareness-local-smoke-archive-result.json')
  assert.equal(Array.isArray(archiveResult.files), true)
  assert.equal(archiveResult.files.length, 2)
  assert.equal(archiveResult.files[0].role, 'agentAwarenessLocalSmokeResult')
  assert.equal(archiveResult.files[1].role, 'archiveReadme')
  assert.deepEqual(archiveResult.files.map((file) => file.path), [
    'agent-awareness-local-smoke-result.json',
    'README.md'
  ])
  assert.doesNotMatch(JSON.stringify(archiveResult), /\/tmp\//)
})

test('updateAgentAwarenessLocalSmokeReport creates an archive result when the archive summary is missing', () => {
  const { archiveDir, reportPath } = createReportFixture()
  const archiveResultPath = path.join(archiveDir, 'agent-awareness-local-smoke-archive-result.json')

  const result = updateAgentAwarenessLocalSmokeReport({
    reportPath,
    options: {
      dashboardUseful: null,
      petSpeechNoiseAcceptable: null
    }
  })

  assert.equal(result.archiveResultPath, archiveResultPath)
  assert.equal(fs.existsSync(archiveResultPath), true)

  const archiveResult = JSON.parse(fs.readFileSync(archiveResultPath, 'utf-8'))
  assert.equal(archiveResult.smoke.sessionCount, 20)
  assert.equal(archiveResult.smoke.manualAcceptance.dashboardUseful, 'pending')
  assert.equal(archiveResult.files.length, 2)
  assert.equal(archiveResult.archive.archiveDir, 'docs/release-evidence/agent-awareness-local-smoke/2026-07-03T16-04-08-824Z')
})

test('updateAgentAwarenessLocalSmokeReport rejects unsafe notes before writing', () => {
  const { reportPath } = createReportFixture()

  assert.throws(() => updateAgentAwarenessLocalSmokeReport({
    reportPath,
    options: {
      notes: 'Observed local path /Users/mango/private during review.',
      validateComplete: false
    }
  }), /local user path found/)
})

test('updateAgentAwarenessLocalSmokeReport rejects invalid notification policy evidence before writing', () => {
  const { reportPath } = createReportFixture({
    reportOverrides: {
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
        decisionFields: ['status', 'priority', 'speechText']
      }
    }
  })

  assert.throws(
    () => updateAgentAwarenessLocalSmokeReport({
      reportPath,
      options: {
        dashboardUseful: true,
        petSpeechNoiseAcceptable: true,
        redactionLooksSafe: true,
        validateComplete: true
      }
    }),
    /notificationPolicyEvidence/
  )
})

test('cli exits non-zero when complete validation is requested with pending review fields', () => {
  const { reportPath } = createReportFixture()
  const scriptPath = path.resolve(__dirname, '../../scripts/update-agent-awareness-local-smoke-report.js')
  const result = spawnSync(process.execPath, [scriptPath, reportPath, '--validate-complete'], { encoding: 'utf-8' })

  assert.equal(result.status, 1)
  assert.match(result.stderr, /dashboardUseful must be filled/i)
})
