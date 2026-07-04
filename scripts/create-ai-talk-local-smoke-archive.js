const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const DEFAULT_ARCHIVE_ROOT = path.join('docs', 'release-evidence', 'ai-talk-local-smoke')
const DEFAULT_RESULT_NAME = 'ai-talk-local-smoke-result.json'
const DEFAULT_LOG_NAME = path.join('logs', 'openpet-app.jsonl')
const DEFAULT_README_NAME = 'README.md'
const DEFAULT_ARCHIVE_RESULT_NAME = 'ai-talk-local-smoke-archive-result.json'

const toPosixPath = (value) => String(value || '').split(path.sep).join('/')
const formatManualAcceptanceStatus = (value) => {
  if (value === true) return 'pass'
  if (value === false) return 'fail'
  return 'pending'
}

const usage = () => [
  'Usage: node scripts/create-ai-talk-local-smoke-archive.js --session-dir <dir> [options]',
  '',
  'Options:',
  '  --session-dir <dir>    Source smoke session directory produced by run-ai-talk-local-smoke',
  '  --archive-dir <dir>    Archive directory to create. Defaults to docs/release-evidence/ai-talk-local-smoke/<session-id>',
  '  --output <file>        Archive result JSON path. Defaults to <archive-dir>/ai-talk-local-smoke-archive-result.json',
  '  --json                 Print archive result JSON',
  '  --help',
  '',
  'Copies a sanitized AI Talk local smoke session into release evidence and writes',
  'a generated README that preserves the current telemetry-only claim boundary.'
].join('\n')

const readValue = (argv, index, flag) => {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

const parseArgs = (argv) => {
  const options = {
    sessionDir: '',
    archiveDir: '',
    outputPath: '',
    json: false,
    help: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--session-dir') {
      options.sessionDir = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--archive-dir') {
      options.archiveDir = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--output') {
      options.outputPath = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--json') {
      options.json = true
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  if (!options.help && !options.sessionDir) throw new Error('--session-dir is required')
  return options
}

const sha256 = (content) => crypto.createHash('sha256').update(content).digest('hex')

const assertDirectory = (dirPath, role, fsImpl = fs) => {
  let stat
  try {
    stat = fsImpl.statSync(dirPath)
  } catch (error) {
    throw new Error(`${role} is missing: ${dirPath}`)
  }
  if (!stat.isDirectory()) throw new Error(`${role} must be a directory: ${dirPath}`)
}

const assertPlainFile = (filePath, role, fsImpl = fs) => {
  let stat
  try {
    stat = fsImpl.lstatSync(filePath)
  } catch (error) {
    throw new Error(`${role} is missing: ${filePath}`)
  }
  if (!stat.isFile()) throw new Error(`${role} must be a regular file: ${filePath}`)
}

const assertDoesNotExist = (targetPath, role, fsImpl = fs) => {
  if (fsImpl.existsSync(targetPath)) throw new Error(`${role} already exists: ${targetPath}`)
}

const sanitizeText = (value, maxChars = 240) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxChars)
const isSafeRelativePath = (value) => {
  const normalized = toPosixPath(String(value || '').trim())
  if (!normalized) return false
  if (normalized.startsWith('/')) return false
  if (/^[A-Za-z]:\//.test(normalized)) return false
  return !normalized.split('/').some((segment) => segment === '..')
}

const sanitizeRelativePath = (value, fallback, maxChars = 240) => {
  const normalized = toPosixPath(String(value || '').trim())
  if (isSafeRelativePath(normalized)) return sanitizeText(normalized, maxChars)
  return sanitizeText(fallback, maxChars)
}

const createSafeArchiveDirPath = (archiveDir, sessionId) => {
  const relative = toPosixPath(path.relative(process.cwd(), String(archiveDir || '').trim()))
  return sanitizeRelativePath(relative, `${toPosixPath(DEFAULT_ARCHIVE_ROOT)}/${sanitizeText(sessionId, 80)}`)
}

const createSafeSourceSummary = ({ report, sessionId }) => {
  const sourceSessionDir = sanitizeRelativePath(
    report?.sessionDir,
    `tmp/real-provider-chat-acceptance/${sanitizeText(sessionId, 80)}`
  )
  const resultPath = sanitizeRelativePath(
    report?.resultPath,
    `${sourceSessionDir}/${DEFAULT_RESULT_NAME}`
  )
  const logPath = sanitizeRelativePath(
    report?.logPath,
    `${sourceSessionDir}/${toPosixPath(DEFAULT_LOG_NAME)}`
  )
  return { sourceSessionDir, resultPath, logPath }
}

const summarizeManualAcceptance = (manualAcceptance = {}) => ({
  bubbleVisibleLongEnough: formatManualAcceptanceStatus(manualAcceptance.bubbleVisibleLongEnough),
  inputUsable: formatManualAcceptanceStatus(manualAcceptance.inputUsable),
  desktopFeelNotesPresent: String(manualAcceptance.desktopFeelNotes || '').trim().length > 0,
  requestId: sanitizeText(manualAcceptance.requestId || '', 160)
})

const requireSanitizedReport = (report) => {
  if (report?.userDataDir !== '[redacted-local-user-data]') {
    throw new Error('Smoke report is not sanitized for archive: userDataDir must be redacted')
  }
  if (report?.liveAiTalkStorePath !== '[redacted-local-user-data]/ai-talk-store.json') {
    throw new Error('Smoke report is not sanitized for archive: liveAiTalkStorePath must be redacted')
  }
}

const assertNoSensitiveArchiveText = (content, role) => {
  const text = Buffer.isBuffer(content) ? content.toString('utf-8') : String(content || '')
  if (/sk-[A-Za-z0-9_-]{8,}/.test(text)) {
    throw new Error(`${role} is not sanitized for archive: raw API key-like token found`)
  }
  if (/\bAuthorization\b|\bBearer\s+[A-Za-z0-9._-]+/i.test(text)) {
    throw new Error(`${role} is not sanitized for archive: authorization header-like text found`)
  }
  if (/\/Users\/[^"'\s]+/.test(text)) {
    throw new Error(`${role} is not sanitized for archive: local user path found`)
  }
}

const createArchiveResultValue = ({
  report,
  absoluteArchiveDir,
  sessionId,
  files,
  now = () => new Date()
}) => {
  const safeArchiveDir = createSafeArchiveDirPath(absoluteArchiveDir, sessionId)
  const safeSource = createSafeSourceSummary({ report, sessionId })
  return {
    generatedAt: now().toISOString(),
    ok: true,
    source: {
      sessionDir: safeSource.sourceSessionDir,
      resultPath: safeSource.resultPath,
      logPath: safeSource.logPath
    },
    archive: {
      archiveDir: safeArchiveDir,
      outputPath: `${safeArchiveDir}/${DEFAULT_ARCHIVE_RESULT_NAME}`,
      sessionId
    },
  smoke: {
    generatedAt: sanitizeText(report?.generatedAt || '', 80),
    provider: sanitizeText(report?.config?.provider || '', 80),
    baseUrl: sanitizeText(report?.config?.baseUrl || '', 200),
    model: sanitizeText(report?.config?.model || '', 120),
    activePetPackId: sanitizeText(report?.activePetPack?.id || '', 120),
    requestId: sanitizeText(report?.bubbleAcceptance?.requestId || '', 160),
    providerLatencyMs: Number(report?.bubbleAcceptance?.providerLatencyMs) || 0,
    bubbleVisible: report?.bubbleDispatch?.bubbleStateVisible === true,
    manualAcceptanceTemplatePresent: Boolean(report?.manualAcceptanceTemplate),
    manualAcceptance: summarizeManualAcceptance(report?.manualAcceptanceTemplate || {})
  },
  files,
  warnings: [
    'Archive preserves sanitized telemetry evidence only; human desktop-feel acceptance remains manual-required.'
  ]
  }
}

const createReadme = ({ report, archiveDir }) => {
  const provider = sanitizeText(report?.config?.provider || '', 80)
  const baseUrl = sanitizeText(report?.config?.baseUrl || '', 200)
  const model = sanitizeText(report?.config?.model || '', 120)
  const activePetPackId = sanitizeText(report?.activePetPack?.id || '', 120)
  const prompt = sanitizeText(report?.chat?.messageChars ? report?.chat?.messagePreview || '' : '', 200)
  const connectionStatus = report?.connectionTest?.skipped ? 'skipped' : (report?.connectionTest?.ok ? 'pass' : 'fail')
  const connectionEvidence = report?.connectionTest?.skipped
    ? 'Connection test was intentionally skipped for this smoke run.'
    : report?.connectionTest?.ok
      ? `Saved chat Provider configuration completed a connection test in \`${Number(report?.connectionTest?.elapsedMs) || 0}ms\`.`
      : `Saved chat Provider configuration failed its connection test with code \`${sanitizeText(report?.connectionTest?.code || '', 80) || 'unknown'}\`.`
  const replyPreview = sanitizeText(report?.chat?.replyPreview || '', 200)
  const providerLatencyMs = Number(report?.bubbleAcceptance?.providerLatencyMs) || 0
  const requestId = sanitizeText(report?.bubbleAcceptance?.requestId || '', 160)
  const bubbleVisible = report?.bubbleDispatch?.bubbleStateVisible === true ? 'true' : 'false'
  const petSayReceived = report?.bubbleDispatch?.petSayReceived === true ? 'true' : 'false'
  const logEvents = Array.isArray(report?.bubbleDispatch?.correlatedLogEvents)
    ? report.bubbleDispatch.correlatedLogEvents.map((event) => `\`${sanitizeText(event, 120)}\``).join(', ')
    : ''
  const bubbleTelemetryLine = providerLatencyMs > 0
    ? `Correlated logs include ${logEvents || 'the expected bubble events'}; the displayed bubble recorded popup telemetry in \`logs/openpet-app.jsonl\`.`
    : 'Correlated logs were copied into `logs/openpet-app.jsonl` for popup telemetry review.'
  const sourceSessionDir = sanitizeText(report?.sessionDir || '', 200) || 'tmp/real-provider-chat-acceptance/<session>'
  const smokeOutputDir = sourceSessionDir.includes('/') ? sanitizeText(path.posix.dirname(sourceSessionDir), 200) : 'tmp/real-provider-chat-acceptance'
  const archiveSessionDir = sanitizeText(toPosixPath(path.relative(process.cwd(), archiveDir) || archiveDir), 240)
  const manualAcceptance = report?.manualAcceptanceTemplate || {}
  const manualNotes = sanitizeText(manualAcceptance.desktopFeelNotes || '', 400)
  const reportCommandPath = `${archiveSessionDir}/${DEFAULT_RESULT_NAME}`

  return [
    '# AI Talk Bubble Chat Smoke Evidence',
    '',
    `Generated: ${sanitizeText(report?.generatedAt || '', 80)}`,
    '',
    'This evidence records a sanitized real-provider AI Talk smoke run against the saved OpenPet development gateway configuration, focused on Bubble Chat request correlation and popup dispatch.',
    '',
    '## Scope',
    '',
    `- Provider: \`${provider}\``,
    `- Base URL: \`${baseUrl}\``,
    `- Chat model: \`${model}\``,
    `- Active pet-pack during the run: \`${activePetPackId}\``,
    prompt ? `- Prompt: \`${prompt}\`` : '- Prompt: not recorded in the archive README',
    '- Raw API key: not recorded',
    '- Local user-data path: redacted in the persisted report',
    '',
    '## Result',
    '',
    '| Check | Status | Evidence |',
    '| --- | --- | --- |',
    `| Connection test | ${connectionStatus} | ${connectionEvidence} |`,
    `| AI Talk chat | ${report?.chat?.ok ? 'pass' : 'fail'} | \`${model}\` returned \`${replyPreview}\` with \`providerLatencyMs = ${providerLatencyMs}\`. |`,
    `| Bubble dispatch | ${report?.bubbleDispatch?.attempted && report?.bubbleDispatch?.petSayReceived && report?.bubbleDispatch?.bubbleStateVisible ? 'pass' : 'fail'} | \`bubbleAcceptance.requestId = ${requestId}\`, \`bubbleDispatch.petSayReceived = ${petSayReceived}\`, and \`bubbleDispatch.bubbleStateVisible = ${bubbleVisible}\`. |`,
    `| Bubble telemetry | ${Array.isArray(report?.bubbleDispatch?.correlatedLogEvents) && report.bubbleDispatch.correlatedLogEvents.length > 0 ? 'pass' : 'fail'} | ${bubbleTelemetryLine} |`,
    '',
    '## Artifacts',
    '',
    `- Report: \`${DEFAULT_RESULT_NAME}\``,
    `- Redacted logs: \`${DEFAULT_LOG_NAME}\``,
    '',
    '## Manual Acceptance',
    '',
    '| Review area | Status |',
    '| --- | --- |',
    `| Bubble visible long enough | ${formatManualAcceptanceStatus(manualAcceptance.bubbleVisibleLongEnough)} |`,
    `| Input usable | ${formatManualAcceptanceStatus(manualAcceptance.inputUsable)} |`,
    '',
    `- Notes: ${manualNotes ? manualNotes : '_none recorded_'}`,
    `- Request ID: \`${sanitizeText(manualAcceptance.requestId || '', 160) || 'not-recorded'}\``,
    '',
    '## Claim Boundary',
    '',
    'This evidence confirms that the saved host-side AI Talk wiring can complete a real-provider chat request, emit a correlated `requestId`, record provider latency, and dispatch the reply into Bubble Chat with visible popup telemetry.',
    '',
    'It does not by itself prove that transparent popup placement, dwell time comfort, hit-testing, copying behavior, or overall desktop feel have passed fresh human acceptance. The `manualAcceptanceTemplate` in the report remains the handoff point for that human review.',
    '',
    '## Reproduction Command',
    '',
    '```bash',
    `npm run run-ai-talk-local-smoke -- --message "<message>" --output-dir ${smokeOutputDir}`,
    `npm run create-ai-talk-local-smoke-archive -- --session-dir ${sourceSessionDir} --archive-dir ${archiveSessionDir}`,
    `npm run update-ai-talk-local-smoke-report -- ${reportCommandPath} --bubble-visible-long-enough true --input-usable true --desktop-feel-notes "Record the desktop interaction review here." --validate-complete`,
    '```',
    ''
  ].join('\n')
}

const createSafeArchivedFilePath = (targetPath, archiveDir, fallback) => {
  const relative = toPosixPath(path.relative(archiveDir, targetPath))
  return sanitizeRelativePath(relative, fallback)
}

const copyFile = ({ sourcePath, targetPath, archiveDir, role, fallbackPath, fsImpl = fs }) => {
  assertPlainFile(sourcePath, role, fsImpl)
  const content = fsImpl.readFileSync(sourcePath)
  fsImpl.mkdirSync(path.dirname(targetPath), { recursive: true })
  fsImpl.writeFileSync(targetPath, content)
  return {
    role,
    path: createSafeArchivedFilePath(targetPath, archiveDir, fallbackPath),
    bytes: content.length,
    sha256: sha256(content)
  }
}

const writeJson = ({ filePath, value, fsImpl = fs }) => {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true })
  fsImpl.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

const createAiTalkLocalSmokeArchive = ({
  sessionDir,
  archiveDir = '',
  outputPath = '',
  now = () => new Date(),
  fsImpl = fs
} = {}) => {
  if (!sessionDir) throw new Error('sessionDir is required')

  const absoluteSessionDir = path.resolve(sessionDir)
  assertDirectory(absoluteSessionDir, 'sessionDir', fsImpl)

  const sessionId = path.basename(absoluteSessionDir)
  const absoluteArchiveDir = path.resolve(archiveDir || path.join(DEFAULT_ARCHIVE_ROOT, sessionId))
  const absoluteOutputPath = path.resolve(outputPath || path.join(absoluteArchiveDir, DEFAULT_ARCHIVE_RESULT_NAME))
  const sourceResultPath = path.join(absoluteSessionDir, DEFAULT_RESULT_NAME)
  const sourceLogPath = path.join(absoluteSessionDir, DEFAULT_LOG_NAME)
  const archivedResultPath = path.join(absoluteArchiveDir, DEFAULT_RESULT_NAME)
  const archivedLogPath = path.join(absoluteArchiveDir, DEFAULT_LOG_NAME)
  const archivedReadmePath = path.join(absoluteArchiveDir, DEFAULT_README_NAME)

  assertPlainFile(sourceResultPath, 'aiTalkLocalSmokeResult', fsImpl)
  assertPlainFile(sourceLogPath, 'aiTalkLocalSmokeLog', fsImpl)
  assertDoesNotExist(absoluteArchiveDir, 'archiveDir', fsImpl)
  assertDoesNotExist(absoluteOutputPath, 'archiveResult', fsImpl)

  const report = JSON.parse(fsImpl.readFileSync(sourceResultPath, 'utf-8'))
  requireSanitizedReport(report)
  assertNoSensitiveArchiveText(JSON.stringify(report), 'aiTalkLocalSmokeResult')

  const logContent = fsImpl.readFileSync(sourceLogPath)
  assertNoSensitiveArchiveText(logContent, 'aiTalkLocalSmokeLog')

  fsImpl.mkdirSync(absoluteArchiveDir, { recursive: true })
  const files = [
    copyFile({
      sourcePath: sourceResultPath,
      targetPath: archivedResultPath,
      archiveDir: absoluteArchiveDir,
      role: 'aiTalkLocalSmokeResult',
      fallbackPath: DEFAULT_RESULT_NAME,
      fsImpl
    }),
    copyFile({
      sourcePath: sourceLogPath,
      targetPath: archivedLogPath,
      archiveDir: absoluteArchiveDir,
      role: 'aiTalkLocalSmokeLog',
      fallbackPath: toPosixPath(DEFAULT_LOG_NAME),
      fsImpl
    })
  ]

  const readme = createReadme({ report, archiveDir: absoluteArchiveDir })
  fsImpl.writeFileSync(archivedReadmePath, readme)
  files.push({
    role: 'archiveReadme',
    path: createSafeArchivedFilePath(archivedReadmePath, absoluteArchiveDir, DEFAULT_README_NAME),
    bytes: Buffer.byteLength(readme),
    sha256: sha256(readme)
  })

  const archiveResult = createArchiveResultValue({
    report,
    absoluteArchiveDir,
    sessionId,
    files,
    now
  })

  writeJson({ filePath: absoluteOutputPath, value: archiveResult, fsImpl })
  return archiveResult
}

const main = () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const result = createAiTalkLocalSmokeArchive(options)
  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  console.log(JSON.stringify({
    ok: result.ok,
    archiveDir: result.archive.archiveDir,
    outputPath: result.archive.outputPath,
    requestId: result.smoke.requestId,
    providerLatencyMs: result.smoke.providerLatencyMs
  }, null, 2))
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error.message || error)
    process.exit(1)
  }
}

module.exports = {
  DEFAULT_ARCHIVE_ROOT,
  DEFAULT_ARCHIVE_RESULT_NAME,
  DEFAULT_LOG_NAME,
  DEFAULT_README_NAME,
  DEFAULT_RESULT_NAME,
  assertNoSensitiveArchiveText,
  createArchiveResultValue,
  createAiTalkLocalSmokeArchive,
  createReadme,
  formatManualAcceptanceStatus,
  parseArgs,
  requireSanitizedReport,
  summarizeManualAcceptance,
  usage
}
