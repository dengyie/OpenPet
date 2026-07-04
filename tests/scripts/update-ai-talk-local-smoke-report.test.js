const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const {
  parseArgs,
  updateAiTalkLocalSmokeReport,
  updateReport,
  validateUpdatedReport
} = require('../../scripts/update-ai-talk-local-smoke-report')

const createReportFixture = ({
  sessionId = '2026-06-28T15-35-59-210Z',
  notes = '',
  reportOverrides = {}
} = {}) => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-ai-talk-update-'))
  const archiveDir = path.join(rootDir, sessionId)
  const logsDir = path.join(archiveDir, 'logs')
  const reportPath = path.join(archiveDir, 'ai-talk-local-smoke-result.json')
  fs.mkdirSync(logsDir, { recursive: true })

  const report = {
    ok: true,
    generatedAt: '2026-06-28T15:35:59.235Z',
    source: 'scripts/run-ai-talk-local-smoke.js',
    userDataDir: '[redacted-local-user-data]',
    sessionId,
    sessionDir: `tmp/real-provider-chat-acceptance/${sessionId}`,
    copiedLiveAiTalkStore: true,
    liveAiTalkStorePath: '[redacted-local-user-data]/ai-talk-store.json',
    tempAiTalkStorePath: `tmp/real-provider-chat-acceptance/${sessionId}/ai-talk-store.json`,
    logPath: `tmp/real-provider-chat-acceptance/${sessionId}/logs/openpet-app.jsonl`,
    config: {
      enabled: true,
      provider: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:8317/v1',
      model: 'gpt-5.5',
      hasApiKey: true
    },
    activePetPack: {
      id: 'duodong',
      displayName: 'Duodong'
    },
    connectionTest: {
      ok: true,
      skipped: false,
      code: 'ok',
      message: 'AI provider connection test succeeded',
      elapsedMs: 2656,
      replyPreview: 'ok'
    },
    chat: {
      ok: true,
      messageChars: 22,
      replyChars: 13,
      replyPreview: '你好呀，我在这儿陪你～🐾'
    },
    bubbleDispatch: {
      attempted: true,
      requestId: 'chat-mqxyb5gj-6tvex3h5',
      petSayReceived: true,
      bubbleStateVisible: true,
      correlatedLogEvents: [
        'ai-talk.chat.started',
        'ai-talk.chat.completed',
        'pet-bubble-chat.message.displayed',
        'pet-bubble-chat.items.updated'
      ]
    },
    bubbleAcceptance: {
      requestId: 'chat-mqxyb5gj-6tvex3h5',
      providerLatencyMs: 2141,
      bubbleSegmentCount: 1,
      replyChars: 13
    },
    manualAcceptanceTemplate: {
      bubbleVisibleLongEnough: null,
      inputUsable: null,
      desktopFeelNotes: notes,
      requestId: 'chat-mqxyb5gj-6tvex3h5'
    },
    ...reportOverrides
  }

  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  fs.writeFileSync(path.join(logsDir, 'openpet-app.jsonl'), '{"scope":"pet-bubble-chat","event":"pet-bubble-chat.message.displayed"}\n')
  return { archiveDir, reportPath, report }
}

test('parseArgs accepts manual acceptance update options', () => {
  const parsed = parseArgs([
    'docs/release-evidence/ai-talk-local-smoke/session/ai-talk-local-smoke-result.json',
    '--output', 'tmp/out.json',
    '--readme', 'tmp/README.md',
    '--bubble-visible-long-enough', 'true',
    '--input-usable', 'pending',
    '--desktop-feel-notes', 'Review pending follow-up.',
    '--request-id', 'chat-123',
    '--validate-complete'
  ])

  assert.equal(parsed.reportPath, 'docs/release-evidence/ai-talk-local-smoke/session/ai-talk-local-smoke-result.json')
  assert.equal(parsed.outputPath, 'tmp/out.json')
  assert.equal(parsed.readmePath, 'tmp/README.md')
  assert.equal(parsed.bubbleVisibleLongEnough, true)
  assert.equal(parsed.inputUsable, null)
  assert.equal(parsed.desktopFeelNotes, 'Review pending follow-up.')
  assert.equal(parsed.requestId, 'chat-123')
  assert.equal(parsed.validateComplete, true)
})

test('parseArgs rejects invalid combinations and values', () => {
  assert.throws(() => parseArgs(['report.json', '--no-readme', '--readme', 'README.md']), /cannot be used with --no-readme/)
  assert.throws(() => parseArgs(['report.json', '--bubble-visible-long-enough', 'maybe']), /must be true, false, or pending/)
})

test('updateReport updates manual acceptance fields and reads desktop notes from file', () => {
  const { reportPath } = createReportFixture()
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'))
  const notesFile = path.join(path.dirname(reportPath), 'notes.txt')
  fs.writeFileSync(notesFile, 'Bubble stayed readable.\n')

  updateReport(report, {
    bubbleVisibleLongEnough: true,
    inputUsable: false,
    desktopFeelNotesFile: notesFile
  })

  assert.equal(report.manualAcceptanceTemplate.bubbleVisibleLongEnough, true)
  assert.equal(report.manualAcceptanceTemplate.inputUsable, false)
  assert.equal(report.manualAcceptanceTemplate.desktopFeelNotes, 'Bubble stayed readable.')
})

test('validateUpdatedReport requires complete review fields only when requested', () => {
  const { report } = createReportFixture()

  const pendingResult = validateUpdatedReport(report, { validateComplete: false })
  assert.equal(pendingResult.ok, true)

  const incompleteResult = validateUpdatedReport(report, { validateComplete: true })
  assert.equal(incompleteResult.ok, false)
  assert.match(incompleteResult.errors.join('\n'), /bubbleVisibleLongEnough must be filled/i)
  assert.match(incompleteResult.errors.join('\n'), /inputUsable must be filled/i)
})

test('validateUpdatedReport requires matching requestId and notes for failed checks', () => {
  const { report } = createReportFixture()
  report.manualAcceptanceTemplate.bubbleVisibleLongEnough = false
  report.manualAcceptanceTemplate.inputUsable = true
  report.manualAcceptanceTemplate.requestId = 'chat-mismatch'

  const result = validateUpdatedReport(report, { validateComplete: true })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /must match bubbleAcceptance\.requestId/i)
  assert.match(result.errors.join('\n'), /must explain any failed manual acceptance check/i)
})

test('updateAiTalkLocalSmokeReport rewrites report, README, and archive result', () => {
  const { archiveDir, reportPath } = createReportFixture()
  const archiveResultPath = path.join(archiveDir, 'ai-talk-local-smoke-archive-result.json')
  fs.writeFileSync(archiveResultPath, `${JSON.stringify({
    generatedAt: '2026-06-28T16:00:00.000Z',
    ok: true,
    source: {
      sessionDir: '/tmp/source-session',
      resultPath: '/tmp/source-session/ai-talk-local-smoke-result.json',
      logPath: '/tmp/source-session/logs/openpet-app.jsonl'
    },
    archive: {
      archiveDir,
      outputPath: archiveResultPath,
      sessionId: path.basename(archiveDir)
    },
    smoke: {
      requestId: 'chat-mqxyb5gj-6tvex3h5',
      providerLatencyMs: 2141,
      manualAcceptanceTemplatePresent: true
    },
    files: []
  }, null, 2)}\n`)

  const result = updateAiTalkLocalSmokeReport({
    reportPath,
    options: {
      bubbleVisibleLongEnough: true,
      inputUsable: true,
      desktopFeelNotes: 'Bubble stayed readable and input flow felt natural.',
      validateComplete: true
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.summary.bubbleVisibleLongEnough, 'pass')
  assert.equal(result.summary.inputUsable, 'pass')
  assert.equal(result.archiveResultPath, archiveResultPath)

  const updatedReport = JSON.parse(fs.readFileSync(reportPath, 'utf-8'))
  assert.equal(updatedReport.manualAcceptanceTemplate.bubbleVisibleLongEnough, true)
  assert.equal(updatedReport.manualAcceptanceTemplate.inputUsable, true)
  assert.match(updatedReport.manualAcceptanceTemplate.desktopFeelNotes, /readable and input flow/)

  const readme = fs.readFileSync(path.join(archiveDir, 'README.md'), 'utf-8')
  assert.match(readme, /## Manual Acceptance/)
  assert.match(readme, /\| Bubble visible long enough \| pass \|/)
  assert.match(readme, /update-ai-talk-local-smoke-report/)

  const archiveResult = JSON.parse(fs.readFileSync(archiveResultPath, 'utf-8'))
  assert.equal(archiveResult.smoke.manualAcceptance.bubbleVisibleLongEnough, 'pass')
  assert.equal(archiveResult.smoke.manualAcceptance.inputUsable, 'pass')
  assert.equal(archiveResult.smoke.manualAcceptance.desktopFeelNotesPresent, true)
  assert.equal(archiveResult.smoke.manualAcceptance.requestId, 'chat-mqxyb5gj-6tvex3h5')
  assert.equal(archiveResult.source.sessionDir, 'tmp/real-provider-chat-acceptance/2026-06-28T15-35-59-210Z')
  assert.equal(archiveResult.source.resultPath, 'tmp/real-provider-chat-acceptance/2026-06-28T15-35-59-210Z/ai-talk-local-smoke-result.json')
  assert.equal(archiveResult.source.logPath, 'tmp/real-provider-chat-acceptance/2026-06-28T15-35-59-210Z/logs/openpet-app.jsonl')
  assert.equal(archiveResult.archive.archiveDir, 'docs/release-evidence/ai-talk-local-smoke/2026-06-28T15-35-59-210Z')
  assert.equal(archiveResult.archive.outputPath, 'docs/release-evidence/ai-talk-local-smoke/2026-06-28T15-35-59-210Z/ai-talk-local-smoke-archive-result.json')
  assert.equal(Array.isArray(archiveResult.files), true)
  assert.equal(archiveResult.files.length, 3)
  assert.deepEqual(archiveResult.files.map((file) => file.path), [
    'ai-talk-local-smoke-result.json',
    'logs/openpet-app.jsonl',
    'README.md'
  ])
  assert.doesNotMatch(JSON.stringify(archiveResult), /\/tmp\//)
})

test('updateAiTalkLocalSmokeReport creates an archive result when the archive summary is missing', () => {
  const { archiveDir, reportPath } = createReportFixture()
  const archiveResultPath = path.join(archiveDir, 'ai-talk-local-smoke-archive-result.json')

  const result = updateAiTalkLocalSmokeReport({
    reportPath,
    options: {
      bubbleVisibleLongEnough: null,
      inputUsable: null
    }
  })

  assert.equal(result.archiveResultPath, archiveResultPath)
  assert.equal(fs.existsSync(archiveResultPath), true)

  const archiveResult = JSON.parse(fs.readFileSync(archiveResultPath, 'utf-8'))
  assert.equal(archiveResult.smoke.requestId, 'chat-mqxyb5gj-6tvex3h5')
  assert.equal(archiveResult.smoke.manualAcceptance.requestId, 'chat-mqxyb5gj-6tvex3h5')
  assert.equal(archiveResult.files.length, 3)
  assert.equal(archiveResult.archive.archiveDir, 'docs/release-evidence/ai-talk-local-smoke/2026-06-28T15-35-59-210Z')
})

test('updateAiTalkLocalSmokeReport rejects unsafe notes before writing', () => {
  const { reportPath } = createReportFixture()

  assert.throws(() => updateAiTalkLocalSmokeReport({
    reportPath,
    options: {
      desktopFeelNotes: 'Observed local path /Users/mango/private during review.'
    }
  }), /local user path found/)
})

test('cli exits non-zero when complete validation is requested with pending review fields', () => {
  const { reportPath } = createReportFixture()
  const scriptPath = path.resolve(__dirname, '../../scripts/update-ai-talk-local-smoke-report.js')
  const result = spawnSync(process.execPath, [scriptPath, reportPath, '--validate-complete'], { encoding: 'utf-8' })

  assert.equal(result.status, 1)
  assert.match(result.stderr, /bubbleVisibleLongEnough must be filled/i)
})
