const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createAiTalkLocalSmokeArchive,
  createReadme,
  parseArgs
} = require('../../scripts/create-ai-talk-local-smoke-archive')

const fixedNow = () => new Date('2026-06-28T16:00:00.000Z')

const createSessionFixture = ({
  sessionId = '2026-06-28T15-35-59-210Z',
  sanitized = true
} = {}) => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-ai-talk-archive-'))
  const sessionDir = path.join(rootDir, sessionId)
  const logsDir = path.join(sessionDir, 'logs')
  fs.mkdirSync(logsDir, { recursive: true })

  const report = {
    ok: true,
    generatedAt: '2026-06-28T15:35:59.235Z',
    source: 'scripts/run-ai-talk-local-smoke.js',
    userDataDir: sanitized ? '[redacted-local-user-data]' : '/Users/mango/Library/Application Support/ibot',
    sessionId,
    sessionDir: `tmp/real-provider-chat-acceptance/${sessionId}`,
    copiedLiveAiTalkStore: true,
    liveAiTalkStorePath: sanitized ? '[redacted-local-user-data]/ai-talk-store.json' : '/Users/mango/Library/Application Support/ibot/ai-talk-store.json',
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
      desktopFeelNotes: '',
      requestId: 'chat-mqxyb5gj-6tvex3h5'
    }
  }

  fs.writeFileSync(path.join(sessionDir, 'ai-talk-local-smoke-result.json'), `${JSON.stringify(report, null, 2)}\n`)
  fs.writeFileSync(path.join(logsDir, 'openpet-app.jsonl'), '{"scope":"pet-bubble-chat","event":"pet-bubble-chat.message.displayed","details":{"requestId":"chat-mqxyb5gj-6tvex3h5","ttlMs":9835}}\n')

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

test('createReadme preserves telemetry-only claim boundary', () => {
  const { report } = createSessionFixture()
  const readme = createReadme({ report, archiveDir: '/tmp/archive' })

  assert.match(readme, /AI Talk Bubble Chat Smoke Evidence/)
  assert.match(readme, /providerLatencyMs = 2141/)
  assert.match(readme, /## Manual Acceptance/)
  assert.match(readme, /manualAcceptanceTemplate/)
  assert.match(readme, /does not by itself prove/i)
  assert.match(readme, /npm run run-ai-talk-local-smoke -- --message "<message>" --output-dir tmp\/real-provider-chat-acceptance/)
  assert.match(
    readme,
    /npm run create-ai-talk-local-smoke-archive -- --session-dir tmp\/real-provider-chat-acceptance\/2026-06-28T15-35-59-210Z --archive-dir /,
    'README reproduction command should pass the source session dir and explicit archive dir separately'
  )
  assert.match(readme, /npm run update-ai-talk-local-smoke-report/)
})

test('createAiTalkLocalSmokeArchive copies sanitized artifacts and writes archive result', () => {
  const { rootDir, sessionDir } = createSessionFixture()
  const archiveDir = path.join(rootDir, 'archive', '2026-06-28T15-35-59-210Z')

  const result = createAiTalkLocalSmokeArchive({
    sessionDir,
    archiveDir,
    now: fixedNow
  })

  assert.equal(result.ok, true)
  assert.equal(result.smoke.requestId, 'chat-mqxyb5gj-6tvex3h5')
  assert.equal(result.smoke.providerLatencyMs, 2141)
  assert.equal(result.smoke.manualAcceptanceTemplatePresent, true)
  assert.equal(result.smoke.manualAcceptance.bubbleVisibleLongEnough, 'pending')
  assert.equal(result.smoke.manualAcceptance.inputUsable, 'pending')
  assert.equal(result.smoke.manualAcceptance.desktopFeelNotesPresent, false)
  assert.equal(result.smoke.manualAcceptance.requestId, 'chat-mqxyb5gj-6tvex3h5')
  assert.equal(result.source.sessionDir, 'tmp/real-provider-chat-acceptance/2026-06-28T15-35-59-210Z')
  assert.equal(result.source.resultPath, 'tmp/real-provider-chat-acceptance/2026-06-28T15-35-59-210Z/ai-talk-local-smoke-result.json')
  assert.equal(result.source.logPath, 'tmp/real-provider-chat-acceptance/2026-06-28T15-35-59-210Z/logs/openpet-app.jsonl')
  assert.equal(result.archive.archiveDir, 'docs/release-evidence/ai-talk-local-smoke/2026-06-28T15-35-59-210Z')
  assert.equal(result.archive.outputPath, 'docs/release-evidence/ai-talk-local-smoke/2026-06-28T15-35-59-210Z/ai-talk-local-smoke-archive-result.json')
  assert.equal(result.files.length, 3)
  assert.deepEqual(result.files.map((file) => file.path), [
    'ai-talk-local-smoke-result.json',
    'logs/openpet-app.jsonl',
    'README.md'
  ])

  const archivedReportPath = path.join(archiveDir, 'ai-talk-local-smoke-result.json')
  const archivedReadmePath = path.join(archiveDir, 'README.md')
  const archiveResultPath = path.join(archiveDir, 'ai-talk-local-smoke-archive-result.json')
  assert.equal(fs.existsSync(archivedReportPath), true)
  assert.equal(fs.existsSync(path.join(archiveDir, 'logs', 'openpet-app.jsonl')), true)
  assert.equal(fs.existsSync(archivedReadmePath), true)
  assert.equal(fs.existsSync(archiveResultPath), true)

  const archivedReport = JSON.parse(fs.readFileSync(archivedReportPath, 'utf-8'))
  assert.equal(archivedReport.userDataDir, '[redacted-local-user-data]')
  assert.equal(archivedReport.liveAiTalkStorePath, '[redacted-local-user-data]/ai-talk-store.json')

  const archivedReadme = fs.readFileSync(archivedReadmePath, 'utf-8')
  assert.match(archivedReadme, /Bubble Chat request correlation and popup dispatch/)
  assert.match(archivedReadme, /does not by itself prove/i)

  const archiveResult = JSON.parse(fs.readFileSync(archiveResultPath, 'utf-8'))
  assert.equal(archiveResult.ok, true)
  assert.equal(archiveResult.smoke.provider, 'openai-compatible')
  assert.equal(archiveResult.smoke.bubbleVisible, true)
  assert.equal(archiveResult.smoke.manualAcceptance.inputUsable, 'pending')
  assert.doesNotMatch(JSON.stringify(archiveResult), /\/Users\//)
})

test('createAiTalkLocalSmokeArchive rejects missing required files', () => {
  const { rootDir, sessionDir } = createSessionFixture()
  const archiveDir = path.join(rootDir, 'archive', '2026-06-28T15-35-59-210Z')
  fs.rmSync(path.join(sessionDir, 'logs', 'openpet-app.jsonl'))

  assert.throws(() => createAiTalkLocalSmokeArchive({ sessionDir, archiveDir, now: fixedNow }), /aiTalkLocalSmokeLog is missing/)
})

test('createAiTalkLocalSmokeArchive rejects unsanitized reports', () => {
  const { rootDir, sessionDir } = createSessionFixture({ sanitized: false })
  const archiveDir = path.join(rootDir, 'archive', '2026-06-28T15-35-59-210Z')

  assert.throws(() => createAiTalkLocalSmokeArchive({ sessionDir, archiveDir, now: fixedNow }), /Smoke report is not sanitized for archive/)
})

test('createAiTalkLocalSmokeArchive rejects raw API key-like tokens in reports', () => {
  const { rootDir, sessionDir } = createSessionFixture()
  const reportPath = path.join(sessionDir, 'ai-talk-local-smoke-result.json')
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'))
  report.config.apiKey = 'sk-cpa-1234567890abcdef'
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  const archiveDir = path.join(rootDir, 'archive', '2026-06-28T15-35-59-210Z')
  assert.throws(
    () => createAiTalkLocalSmokeArchive({ sessionDir, archiveDir, now: fixedNow }),
    /raw API key-like token/
  )
})

test('createAiTalkLocalSmokeArchive rejects sensitive authorization text in logs', () => {
  const { rootDir, sessionDir } = createSessionFixture()
  fs.appendFileSync(path.join(sessionDir, 'logs', 'openpet-app.jsonl'), 'Authorization: Bearer secret-token\n')

  const archiveDir = path.join(rootDir, 'archive', '2026-06-28T15-35-59-210Z')
  assert.throws(
    () => createAiTalkLocalSmokeArchive({ sessionDir, archiveDir, now: fixedNow }),
    /authorization header-like text/
  )
})

test('createAiTalkLocalSmokeArchive refuses to overwrite an existing archive directory', () => {
  const { rootDir, sessionDir } = createSessionFixture()
  const archiveDir = path.join(rootDir, 'archive', '2026-06-28T15-35-59-210Z')
  fs.mkdirSync(archiveDir, { recursive: true })

  assert.throws(() => createAiTalkLocalSmokeArchive({ sessionDir, archiveDir, now: fixedNow }), /archiveDir already exists/)
})
