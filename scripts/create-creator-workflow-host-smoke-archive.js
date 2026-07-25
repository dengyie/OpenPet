#!/usr/bin/env node

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const DEFAULT_ARCHIVE_ROOT = path.join('docs', 'release-evidence', 'creator-workflow-host-smoke')
const DEFAULT_REPORT_NAME = 'creator-workflow-host-smoke-report.json'
const DEFAULT_RESULT_NAME = 'creator-workflow-host-smoke-result.json'
const DEFAULT_README_NAME = 'README.md'

const toPosixPath = (value) => String(value || '').split(path.sep).join('/')
const sanitizeText = (value, maxChars = 240) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxChars)

const usage = () => [
  'Usage: node scripts/create-creator-workflow-host-smoke-archive.js --session-dir <dir> [options]',
  '',
  'Options:',
  '  --session-dir <dir>    Source smoke session directory produced by run-creator-workflow-host-smoke',
  '  --archive-dir <dir>    Archive directory to create. Defaults to docs/release-evidence/creator-workflow-host-smoke/<session-id>',
  '  --output <file>        Archive result JSON path. Defaults to <archive-dir>/creator-workflow-host-smoke-result.json',
  '  --acceptance-scope <branch|main>',
  '  --json                 Print archive result JSON',
  '  --help',
  '',
  'Creates a sanitized host-smoke evidence archive suitable for committing into docs/release-evidence/.'
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
    acceptanceScope: '',
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
    } else if (arg === '--acceptance-scope') {
      options.acceptanceScope = readValue(argv, index, arg)
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

const createSafeArchiveDirPath = (archiveDir, sessionId) => {
  const relative = toPosixPath(path.relative(process.cwd(), String(archiveDir || '').trim()))
  if (relative && !relative.startsWith('../') && !path.isAbsolute(relative)) return sanitizeText(relative, 240)
  return `${toPosixPath(DEFAULT_ARCHIVE_ROOT)}/${sanitizeText(sessionId, 80)}`
}

const sanitizeReferenceImageSummary = (value) => {
  const fileName = sanitizeText(path.basename(String(value || '').trim()) || 'reference.png', 160)
  return {
    fileName,
    path: `[redacted-local-reference]/${fileName}`
  }
}

const sanitizeSourceSessionDir = (sessionDir) => {
  const source = toPosixPath(String(sessionDir || '').trim())
  const relative = toPosixPath(path.relative(process.cwd(), source))
  if (relative && !relative.startsWith('../') && !path.isAbsolute(relative)) return sanitizeText(relative, 240)
  const marker = 'release/creator-workflow-host-smoke/'
  const markerIndex = source.lastIndexOf(marker)
  if (markerIndex >= 0) {
    const sessionId = sanitizeText(source.slice(markerIndex + marker.length).split('/')[0], 80)
    if (/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(sessionId)) return `${marker}${sessionId}`
  }
  return 'release/creator-workflow-host-smoke/<session>'
}

const resolveAcceptanceScope = ({ acceptanceScope = '', archiveDir = '' } = {}) => {
  const normalizedScope = sanitizeText(acceptanceScope, 20).toLowerCase()
  if (normalizedScope === 'branch' || normalizedScope === 'main') return normalizedScope
  const archiveBaseName = sanitizeText(path.basename(String(archiveDir || '').trim()), 120).toLowerCase()
  if (archiveBaseName.includes('main-acceptance')) return 'main'
  return 'branch'
}

const summarizeBasicActions = (value = {}) => {
  if (!value || typeof value !== 'object') return null
  return {
    requiredRealActionIds: Array.isArray(value.requiredRealActionIds) ? value.requiredRealActionIds.map((item) => sanitizeText(item, 80)) : [],
    realActionIds: Array.isArray(value.realActionIds) ? value.realActionIds.map((item) => sanitizeText(item, 80)) : [],
    fallbackActionIds: Array.isArray(value.fallbackActionIds) ? value.fallbackActionIds.map((item) => sanitizeText(item, 80)) : [],
    missingRequiredActionIds: Array.isArray(value.missingRequiredActionIds) ? value.missingRequiredActionIds.map((item) => sanitizeText(item, 80)) : []
  }
}

const summarizeClickActionChange = (value = {}) => {
  if (!value || typeof value !== 'object') return null
  return {
    previousActionId: sanitizeText(value.previousActionId || '', 80),
    currentActionId: sanitizeText(value.currentActionId || '', 80),
    importedActionId: sanitizeText(value.importedActionId || '', 80),
    canRestore: value.canRestore === true
  }
}

const summarizeRequest = (value = {}) => {
  if (!value || typeof value !== 'object') {
    return {
      scenario: '',
      newCharacterName: '',
      newCharacterStylePrompt: '',
      existingActionName: '',
      existingActionPrompt: ''
    }
  }
  return {
    scenario: sanitizeText(value.scenario || '', 80),
    newCharacterName: sanitizeText(value.newCharacterName || '', 160),
    newCharacterStylePrompt: sanitizeText(value.newCharacterStylePrompt || '', 1000),
    existingActionName: sanitizeText(value.existingActionName || '', 160),
    existingActionPrompt: sanitizeText(value.existingActionPrompt || '', 1000)
  }
}

const summarizeScenario = (scenario = {}) => {
  const result = scenario.result && typeof scenario.result === 'object' ? scenario.result : {}
  const run = result.run && typeof result.run === 'object' ? result.run : {}
  const diagnostics = result.diagnostics && typeof result.diagnostics === 'object' ? result.diagnostics : {}
  const conditioning = diagnostics.conditioning && typeof diagnostics.conditioning === 'object'
    ? diagnostics.conditioning
    : scenario.runRecord?.conditioning && typeof scenario.runRecord.conditioning === 'object'
      ? scenario.runRecord.conditioning
      : {}
  return {
    scenario: sanitizeText(scenario.scenario || '', 80),
    ok: scenario.ok === true,
    durationMs: Number(scenario.durationMs) || 0,
    workflow: {
      state: sanitizeText(result.state || '', 80),
      code: sanitizeText(result.code || '', 80),
      message: sanitizeText(result.message || '', 240),
      mode: sanitizeText(run.mode || '', 80),
      runId: sanitizeText(run.runId || '', 120),
      importedActionId: sanitizeText(run.importedActionId || '', 120),
      importedPackId: sanitizeText(run.importedPackId || '', 120),
      activatedPackId: sanitizeText(run.activatedPackId || '', 120)
    },
    provider: {
      ready: scenario.providerAfter?.ready === true,
      code: sanitizeText(scenario.providerAfter?.code || '', 80),
      provider: sanitizeText(scenario.providerAfter?.provider || '', 80),
      model: sanitizeText(scenario.providerAfter?.model || scenario.seededSettingsSummary?.model || '', 120)
    },
    verification: {
      ok: scenario.verification?.ok === true,
      message: sanitizeText(scenario.verification?.message || '', 240)
    },
    conditioning: {
      mode: sanitizeText(conditioning.mode || '', 80),
      endpoint: sanitizeText(conditioning.endpoint || '', 80),
      referenceImageCount: Number(conditioning.referenceImageCount) || 0,
      referenceFileNames: Array.isArray(conditioning.referenceFileNames)
        ? conditioning.referenceFileNames.map((item) => sanitizeText(item, 160))
        : Array.isArray(conditioning.references)
          ? conditioning.references.map((item) => sanitizeText(item?.fileName || '', 160)).filter(Boolean)
          : []
    },
    basicActions: summarizeBasicActions(result.basicActions),
    clickActionChange: summarizeClickActionChange(result.clickActionChange)
  }
}

const createWarnings = (acceptanceScope = 'branch') => [
  'This archive proves the technical host-owned one-click chain and reference-conditioning evidence only.',
  acceptanceScope === 'main'
    ? 'Human review is still required for art quality before broadening support claims.'
    : 'Human review is still required for art quality and for deciding whether a branch acceptance run is sufficient to promote broader support claims.'
]

const createArchiveResultValue = ({
  report,
  sessionDir,
  archiveDir,
  outputPath,
  acceptanceScope,
  now = () => new Date()
}) => {
  const referenceImage = sanitizeReferenceImageSummary(report.referenceImagePath)
  return {
    schemaVersion: 1,
    ok: report.ok === true,
    generatedAt: now().toISOString(),
    evidenceType: 'creator-workflow-host-smoke',
    acceptanceScope,
    source: 'scripts/create-creator-workflow-host-smoke-archive.js',
    claimBoundary: 'Validates the real host-owned creator workflow through provider generation plus import/apply handoff, and records evidence that the run-local canonical reference image was sent into the provider request as an image-edit conditioning input. It does not guarantee provider art quality or visual fidelity.',
    archive: {
      sessionId: sanitizeText(report.sessionId || '', 80),
      archiveDir: createSafeArchiveDirPath(archiveDir, report.sessionId),
      outputPath: `${createSafeArchiveDirPath(path.dirname(outputPath), report.sessionId)}/${sanitizeText(path.basename(outputPath), 120)}`
    },
    sourceSummary: {
      sessionDir: sanitizeSourceSessionDir(report.sessionDir || sessionDir),
      reportPath: `${sanitizeSourceSessionDir(report.sessionDir || sessionDir)}/${DEFAULT_REPORT_NAME}`
    },
    request: summarizeRequest(report.request),
    referenceImage,
    scenarios: Array.isArray(report.scenarios) ? report.scenarios.map(summarizeScenario) : [],
    warnings: createWarnings(acceptanceScope)
  }
}

const createReadme = ({ report, archiveResult, archiveDir }) => {
  const scenarioLines = archiveResult.scenarios.map((scenario) => {
    const workflowTarget = scenario.workflow.activatedPackId || scenario.workflow.importedActionId || scenario.workflow.runId || 'unknown'
    const conditioning = `${scenario.conditioning.mode || 'unknown'} via ${scenario.conditioning.endpoint || 'unknown'} with ${scenario.conditioning.referenceImageCount} reference image(s)`
    return `| ${scenario.scenario} | ${scenario.ok ? 'pass' : 'fail'} | \`${workflowTarget}\` completed in \`${scenario.durationMs}ms\`; conditioning: ${conditioning}. |`
  })

  const scopeLine = archiveResult.acceptanceScope === 'main'
    ? 'This archive confirms the current supported one-click path on `main` for the supplied single-image material shape.'
    : 'This archive confirms the current supported one-click path on the current branch for the supplied single-image material shape.'
  const claimBoundaryLine = archiveResult.acceptanceScope === 'main'
    ? 'It does not by itself prove production art quality or broad multi-view support. Human review is still required before broadening support claims.'
    : 'It does not by itself prove production art quality, broad multi-view support, or main-branch acceptance. Human review is still required, and main-branch acceptance remains required before broadening support claims.'
  const request = summarizeRequest(archiveResult.request || report.request)
  const requestLines = [
    request.scenario ? `- Scenario request: \`${request.scenario}\`` : '',
    request.newCharacterName ? `- New character: \`${request.newCharacterName}\`` : '',
    request.newCharacterStylePrompt ? `- New character style prompt: ${request.newCharacterStylePrompt}` : '',
    request.existingActionName ? `- Existing action: \`${request.existingActionName}\`` : '',
    request.existingActionPrompt ? `- Existing action prompt: ${request.existingActionPrompt}` : ''
  ].filter(Boolean)

  return [
    '# Creator Workflow Host Smoke Evidence',
    '',
    `Generated: ${sanitizeText(report.generatedAt || archiveResult.generatedAt, 80)}`,
    '',
    'This evidence records a sanitized host-side one-click Creator Workflow smoke run against the saved OpenPet image Provider configuration.',
    '',
    '## Scope',
    '',
    `- Source session: \`${archiveResult.sourceSummary.sessionDir}\``,
    `- Reference image: \`${archiveResult.referenceImage.path}\``,
    `- Scenarios: ${archiveResult.scenarios.map((scenario) => `\`${scenario.scenario}\``).join(', ') || 'none'}`,
    '- Raw API key: not recorded',
    '- Local user-data path: redacted',
    '',
    ...(requestLines.length > 0
      ? [
          '## Request',
          '',
          ...requestLines,
          ''
        ]
      : []),
    '## Result',
    '',
    '| Scenario | Status | Evidence |',
    '| --- | --- | --- |',
    ...scenarioLines,
    '',
    '## Claim Boundary',
    '',
    scopeLine,
    '',
    claimBoundaryLine,
    '',
    '## Artifacts',
    '',
    `- Report: \`${path.basename(archiveResult.archive.outputPath)}\``,
    '',
    '## Reproduction Command',
    '',
    '```bash',
    `npm run smoke:creator-workflow-host -- --source-user-data-dir "[redacted-local-user-data]" --reference-image "${archiveResult.referenceImage.path}" --scenario both`,
    `node scripts/create-creator-workflow-host-smoke-archive.js --session-dir ${archiveResult.sourceSummary.sessionDir} --archive-dir ${sanitizeText(toPosixPath(path.relative(process.cwd(), archiveDir) || archiveDir), 240)}`,
    '```',
    ''
  ].join('\n')
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
  if (/\.codex\/worktrees\//.test(text)) {
    throw new Error(`${role} is not sanitized for archive: local worktree path found`)
  }
}

const createCreatorWorkflowHostSmokeArchive = ({
  sessionDir,
  archiveDir = '',
  outputPath = '',
  acceptanceScope = '',
  now = () => new Date()
} = {}) => {
  const absoluteSessionDir = path.resolve(String(sessionDir || '').trim())
  assertDirectory(absoluteSessionDir, 'sessionDir')
  const sessionId = path.basename(absoluteSessionDir)
  const reportPath = path.join(absoluteSessionDir, DEFAULT_REPORT_NAME)
  assertPlainFile(reportPath, 'creatorWorkflowHostSmokeReport')
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'))
  if (report?.evidenceType !== 'creator-workflow-host-smoke') {
    throw new Error(`Unexpected evidenceType: ${report?.evidenceType || 'unknown'}`)
  }

  const absoluteArchiveDir = path.resolve(String(archiveDir || path.join(DEFAULT_ARCHIVE_ROOT, sessionId)).trim())
  const absoluteOutputPath = path.resolve(String(outputPath || path.join(absoluteArchiveDir, DEFAULT_RESULT_NAME)).trim())
  const resolvedAcceptanceScope = resolveAcceptanceScope({ acceptanceScope, archiveDir: absoluteArchiveDir })
  assertDoesNotExist(absoluteArchiveDir, 'archiveDir')
  fs.mkdirSync(absoluteArchiveDir, { recursive: true })

  const archiveResult = createArchiveResultValue({
    report,
    sessionDir: absoluteSessionDir,
    archiveDir: absoluteArchiveDir,
    outputPath: absoluteOutputPath,
    acceptanceScope: resolvedAcceptanceScope,
    now
  })
  const archiveResultContent = `${JSON.stringify(archiveResult, null, 2)}\n`
  const readmeContent = `${createReadme({ report, archiveResult, archiveDir: absoluteArchiveDir })}\n`
  assertNoSensitiveArchiveText(archiveResultContent, 'archiveResult')
  assertNoSensitiveArchiveText(readmeContent, 'archiveReadme')

  fs.writeFileSync(absoluteOutputPath, archiveResultContent, 'utf-8')
  fs.writeFileSync(path.join(absoluteArchiveDir, DEFAULT_README_NAME), readmeContent, 'utf-8')

  return {
    ...archiveResult,
    files: [
      {
        path: path.basename(absoluteOutputPath),
        sha256: sha256(archiveResultContent),
        sizeBytes: Buffer.byteLength(archiveResultContent)
      },
      {
        path: DEFAULT_README_NAME,
        sha256: sha256(readmeContent),
        sizeBytes: Buffer.byteLength(readmeContent)
      }
    ]
  }
}

const main = () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const result = createCreatorWorkflowHostSmokeArchive({
    sessionDir: options.sessionDir,
    archiveDir: options.archiveDir,
    outputPath: options.outputPath,
    acceptanceScope: options.acceptanceScope
  })

  if (options.json) console.log(JSON.stringify(result, null, 2))
  else console.log(`creator workflow host smoke archive: ${result.ok ? 'ok' : 'failed'}`)
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error.message || String(error))
    process.exitCode = 1
  }
}

module.exports = {
  createCreatorWorkflowHostSmokeArchive,
  createReadme,
  parseArgs,
  resolveAcceptanceScope,
  createWarnings
}
