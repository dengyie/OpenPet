const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const DEFAULT_ARCHIVE_ROOT = path.join('docs', 'release-evidence', 'agent-awareness-local-smoke')
const DEFAULT_RESULT_NAME = 'agent-awareness-local-smoke-result.json'
const DEFAULT_README_NAME = 'README.md'
const DEFAULT_ARCHIVE_RESULT_NAME = 'agent-awareness-local-smoke-archive-result.json'
const DEFAULT_SESSION_DIR_LABEL = 'agent-awareness-local-smoke'

const toPosixPath = (value) => String(value || '').split(path.sep).join('/')
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
    `${DEFAULT_SESSION_DIR_LABEL}/${sanitizeText(sessionId, 80)}`
  )
  const normalizeSourceChildPath = (value, fallback) => {
    const normalized = sanitizeRelativePath(value, fallback)
    if (normalized === sourceSessionDir) return normalized
    if (normalized.startsWith(`${sourceSessionDir}/`)) return normalized
    return sanitizeRelativePath(`${sourceSessionDir}/${normalized}`, `${sourceSessionDir}/${fallback}`)
  }
  const resultPath = sanitizeRelativePath(
    normalizeSourceChildPath(report?.resultPath, DEFAULT_RESULT_NAME),
    `${sourceSessionDir}/${DEFAULT_RESULT_NAME}`
  )
  return { sourceSessionDir, resultPath }
}

const formatManualAcceptanceStatus = (value) => {
  if (value === true) return 'pass'
  if (value === false) return 'fail'
  return 'pending'
}

const summarizeManualAcceptance = (manualAcceptance = {}) => ({
  dashboardUseful: formatManualAcceptanceStatus(manualAcceptance.dashboardUseful),
  petSpeechNoiseAcceptable: formatManualAcceptanceStatus(manualAcceptance.petSpeechNoiseAcceptable),
  redactionLooksSafe: formatManualAcceptanceStatus(manualAcceptance.redactionLooksSafe),
  notesPresent: String(manualAcceptance.notes || '').trim().length > 0
})

const usage = () => [
  'Usage: node scripts/create-agent-awareness-local-smoke-archive.js --session-dir <dir> [options]',
  '',
  'Options:',
  '  --session-dir <dir>    Source smoke session directory produced by run-agent-awareness-local-smoke',
  '  --archive-dir <dir>    Archive directory to create. Defaults to docs/release-evidence/agent-awareness-local-smoke/<session-id>',
  '  --output <file>        Archive result JSON path. Defaults to <archive-dir>/agent-awareness-local-smoke-archive-result.json',
  '  --json                 Print archive result JSON',
  '  --help',
  '',
  'Copies a sanitized agent-awareness local smoke session into release evidence and',
  'writes a generated README that preserves the current privacy-first claim boundary.'
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
  } catch (_) {
    throw new Error(`${role} is missing: ${dirPath}`)
  }
  if (!stat.isDirectory()) throw new Error(`${role} must be a directory: ${dirPath}`)
}

const assertPlainFile = (filePath, role, fsImpl = fs) => {
  let stat
  try {
    stat = fsImpl.lstatSync(filePath)
  } catch (_) {
    throw new Error(`${role} is missing: ${filePath}`)
  }
  if (!stat.isFile()) throw new Error(`${role} must be a regular file: ${filePath}`)
}

const assertDoesNotExist = (targetPath, role, fsImpl = fs) => {
  if (fsImpl.existsSync(targetPath)) throw new Error(`${role} already exists: ${targetPath}`)
}

const sanitizeText = (value, maxChars = 240) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxChars)

const requireSanitizedReport = (report) => {
  if (report?.codexHome !== '[redacted-local-codex-home]') {
    throw new Error('Smoke report is not sanitized for archive: codexHome must be redacted')
  }
  if (report?.healthUrl !== '[local-url]') {
    throw new Error('Smoke report is not sanitized for archive: healthUrl must be redacted')
  }
  if (report?.hookPlan?.serviceUrl !== '[local-url]') {
    throw new Error('Smoke report is not sanitized for archive: hookPlan.serviceUrl must be redacted')
  }
}

const assertNoSensitiveArchiveText = (content, role) => {
  const text = Buffer.isBuffer(content) ? content.toString('utf-8') : String(content || '')
  if (/\bsk-[A-Za-z0-9_-]{8,}/.test(text)) {
    throw new Error(`${role} is not sanitized for archive: raw API key-like token found`)
  }
  if (/\bAuthorization\b|\bBearer\s+[A-Za-z0-9._-]+/i.test(text)) {
    throw new Error(`${role} is not sanitized for archive: authorization header-like text found`)
  }
  if (/\/Users\/[^"'\s]+/.test(text)) {
    throw new Error(`${role} is not sanitized for archive: local user path found`)
  }
  if (/127\.0\.0\.1|localhost|\[::1\]/i.test(text)) {
    throw new Error(`${role} is not sanitized for archive: loopback address found`)
  }
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
      resultPath: safeSource.resultPath
    },
    archive: {
      archiveDir: safeArchiveDir,
      outputPath: `${safeArchiveDir}/${DEFAULT_ARCHIVE_RESULT_NAME}`
    },
  smoke: {
    sanitizedSignalDetected: report?.sanitizedSignalDetected === true,
    sessionCount: Number(report?.health?.diagnostics?.sessionCount) || 0,
    activeSessionCount: Number(report?.health?.diagnostics?.activeSessionCount) || 0,
    totalEvents: Number(report?.health?.diagnostics?.totalEvents) || 0,
    unsupportedLifecycleRecordCount: Number(report?.health?.diagnostics?.unsupportedLifecycleRecordCount) || 0,
    manualAcceptanceTemplatePresent: report?.manualAcceptanceTemplate && typeof report.manualAcceptanceTemplate === 'object',
    manualAcceptance: summarizeManualAcceptance(report?.manualAcceptanceTemplate || {})
  },
  files
  }
}

const createReadme = ({ report, archiveDir }) => {
  const sessionCount = Number(report?.health?.diagnostics?.sessionCount) || 0
  const activeSessionCount = Number(report?.health?.diagnostics?.activeSessionCount) || 0
  const totalEvents = Number(report?.health?.diagnostics?.totalEvents) || 0
  const seenCount = Number(report?.health?.diagnostics?.seenCount) || 0
  const unsupportedLifecycleRecordCount = Number(report?.health?.diagnostics?.unsupportedLifecycleRecordCount) || 0
  const sessionRows = Array.isArray(report?.sessions) && report.sessions.length > 0
    ? report.sessions.map((session) => (
      `| \`${sanitizeText(session.sessionId, 40)}\` | \`${sanitizeText(session.status, 32)}\` | \`${sanitizeText(session.project, 120)}\` | ${Number(session.eventCount) || 0} |`
    )).join('\n')
    : '| none | - | - | 0 |'
  const sourceSessionDir = sanitizeText(report?.sessionDir || '', 200) || `${DEFAULT_SESSION_DIR_LABEL}/<session>`
  const smokeOutputDir = sourceSessionDir.includes('/') ? sanitizeText(path.posix.dirname(sourceSessionDir), 200) : DEFAULT_SESSION_DIR_LABEL
  const archiveSessionDir = sanitizeText(toPosixPath(path.relative(process.cwd(), archiveDir) || archiveDir), 240)
  const manualAcceptance = report?.manualAcceptanceTemplate || {}
  const manualNotes = sanitizeText(manualAcceptance.notes || '', 400)
  const reportCommandPath = `${archiveSessionDir}/${DEFAULT_RESULT_NAME}`

  return [
    '# Agent Awareness Local Smoke Evidence',
    '',
    `Generated: ${sanitizeText(report?.generatedAt || '', 80)}`,
    '',
    'This evidence records a sanitized real-Codex agent-awareness smoke run against a local Codex home, focused on privacy-safe session discovery, diagnostics, and hook-plan readiness.',
    '',
    '## Scope',
    '',
    `- Sanitized signal detected: \`${report?.sanitizedSignalDetected === true}\``,
    `- Hook-plan available: \`${report?.hookPlan?.ok === true}\``,
    `- Service health: \`${report?.health?.ok === true}\``,
    `- Codex home path: redacted`,
    `- Health URL: redacted`,
    '',
    '## Result',
    '',
    '| Check | Status | Evidence |',
    '| --- | --- | --- |',
    `| Session discovery | ${report?.sanitizedSignalDetected === true ? 'pass' : 'fail'} | \`sessionCount = ${sessionCount}\`, \`activeSessionCount = ${activeSessionCount}\`, \`totalEvents = ${totalEvents}\`. |`,
    `| Redaction boundary | ${Object.values(report?.redactionChecks || {}).every(Boolean) ? 'pass' : 'fail'} | \`sessionIdsHashed = ${report?.redactionChecks?.sessionIdsHashed === true}\`, \`projectLabelsRedacted = ${report?.redactionChecks?.projectLabelsRedacted === true}\`, \`noRawPaths = ${report?.redactionChecks?.noRawPaths === true}\`, \`noLoopbackUrls = ${report?.redactionChecks?.noLoopbackUrls === true}\`, \`noSecrets = ${report?.redactionChecks?.noSecrets === true}\`. |`,
    `| Hook planning | ${report?.hookPlan?.ok === true ? 'pass' : 'fail'} | \`instructionsFile = ${sanitizeText(report?.hookPlan?.instructionsFile || '', 120)}\`, \`authFile = ${sanitizeText(report?.hookPlan?.authFile || '', 120)}\`, and \`externalWrites = ${report?.hookPlan?.externalWrites === true}\`. |`,
    `| Poller diagnostics | ${report?.health?.ok === true ? 'pass' : 'fail'} | \`seenCount = ${seenCount}\`, \`unsupportedLifecycleRecordCount = ${unsupportedLifecycleRecordCount}\`, \`lastError = ${sanitizeText(report?.health?.diagnostics?.lastError || '', 80) || '""'}\`. |`,
    '',
    '## Sample Sessions',
    '',
    '| Session | Status | Project | Events |',
    '| --- | --- | --- | --- |',
    sessionRows,
    '',
    '## Artifacts',
    '',
    `- Report: \`${DEFAULT_RESULT_NAME}\``,
    '',
    '## Manual Acceptance',
    '',
    '| Review area | Status |',
    '| --- | --- |',
    `| Dashboard usefulness | ${formatManualAcceptanceStatus(manualAcceptance.dashboardUseful)} |`,
    `| Pet speech noise | ${formatManualAcceptanceStatus(manualAcceptance.petSpeechNoiseAcceptable)} |`,
    `| Redaction review | ${formatManualAcceptanceStatus(manualAcceptance.redactionLooksSafe)} |`,
    '',
    `- Notes: ${manualNotes ? manualNotes : '_none recorded_'}`,
    '',
    '## Claim Boundary',
    '',
    'This evidence confirms that the bundled agent-awareness service can discover real local Codex rollout data, reduce it to sanitized session summaries, and preserve the current privacy boundary for archived results.',
    '',
    'It does not by itself prove that dashboard usefulness, pet speech noisiness, or the overall desktop interaction feel have passed human acceptance. The `manualAcceptanceTemplate` in the report remains the handoff point for that review.',
    '',
    '## Reproduction Command',
    '',
    '```bash',
    `npm run run-agent-awareness-local-smoke -- --codex-home ~/.codex --output-dir ${smokeOutputDir}`,
    `node scripts/create-agent-awareness-local-smoke-archive.js --session-dir ${sourceSessionDir} --archive-dir ${archiveSessionDir}`,
    `npm run update-agent-awareness-local-smoke-report -- ${reportCommandPath} --dashboard-useful true --pet-speech-noise-acceptable true --redaction-looks-safe true --notes "Record the human dashboard/noise review here." --validate-complete`,
    '```',
    ''
  ].join('\n')
}

const createAgentAwarenessLocalSmokeArchive = ({
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
  const archivedResultPath = path.join(absoluteArchiveDir, DEFAULT_RESULT_NAME)
  const archivedReadmePath = path.join(absoluteArchiveDir, DEFAULT_README_NAME)

  assertPlainFile(sourceResultPath, 'agentAwarenessLocalSmokeResult', fsImpl)
  assertDoesNotExist(absoluteArchiveDir, 'archiveDir', fsImpl)
  assertDoesNotExist(absoluteOutputPath, 'archiveResult', fsImpl)

  const report = JSON.parse(fsImpl.readFileSync(sourceResultPath, 'utf-8'))
  requireSanitizedReport(report)
  assertNoSensitiveArchiveText(JSON.stringify(report), 'agentAwarenessLocalSmokeResult')

  fsImpl.mkdirSync(absoluteArchiveDir, { recursive: true })
  const files = [
    copyFile({
      sourcePath: sourceResultPath,
      targetPath: archivedResultPath,
      archiveDir: absoluteArchiveDir,
      role: 'agentAwarenessLocalSmokeResult',
      fallbackPath: DEFAULT_RESULT_NAME,
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

  const result = createAgentAwarenessLocalSmokeArchive({
    sessionDir: options.sessionDir,
    archiveDir: options.archiveDir,
    outputPath: options.outputPath
  })

  if (options.json) console.log(JSON.stringify(result, null, 2))
  else console.log(`Archived agent-awareness smoke evidence to ${result.archive.archiveDir}`)
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
  DEFAULT_ARCHIVE_RESULT_NAME,
  DEFAULT_README_NAME,
  DEFAULT_RESULT_NAME,
  assertNoSensitiveArchiveText,
  createArchiveResultValue,
  createAgentAwarenessLocalSmokeArchive,
  createReadme,
  formatManualAcceptanceStatus,
  parseArgs,
  requireSanitizedReport,
  summarizeManualAcceptance
}
