const { execFileSync } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { validatePluginPackage } = require('./validate-plugin-package')
const { createPluginSubmissionBundle } = require('./create-plugin-submission-bundle')
const { loadBundle, validateBundle } = require('./validate-plugin-submission-bundle')
const {
  createPluginMaintainerApproval,
  VALID_DECISIONS
} = require('./create-plugin-maintainer-approval')
const {
  loadApprovalBundle,
  validateMaintainerApproval
} = require('./validate-plugin-maintainer-approval')
const {
  assertSafeRehearsalOutputDir,
  zipPluginDirectory
} = require('./create-plugin-author-rehearsal')

const DEFAULT_OUTPUT_ROOT = path.join('docs', 'release-evidence', 'plugin-remote-source-submission-rehearsal')
const SAFE_ARCHIVE_ENTRY_PATTERN = /^[^/\\\0][^\\\0]*$/

const usage = () => [
  'Usage: node scripts/create-plugin-remote-source-submission-rehearsal.js --archive-url <https-url> --plugin-path <path> [options]',
  '',
  'Options:',
  '  --archive-url <https-url>      HTTPS zip archive URL to rehearse',
  '  --plugin-path <path>           Plugin directory inside the extracted archive',
  '  --output-dir <dir>             Directory for rehearsal artifacts',
  '  --reviewer <name>              Maintainer or reviewer name',
  '  --decision <approved|changes-requested>',
  '  --notes <text>                 Review notes recorded by the maintainer',
  '  --json                         Print the machine-readable rehearsal summary',
  '  --help',
  '',
  'Downloads a public HTTPS archive, records remote-source provenance, packages the',
  'selected plugin snapshot, creates a submission bundle, records maintainer approval,',
  'and writes local evidence files without installing or running plugin code.'
].join('\n')

const readValue = (argv, index, flag) => {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

const parseArgs = (argv) => {
  const options = {
    archiveUrl: '',
    pluginPath: '',
    outputDir: '',
    reviewer: 'OpenPet Maintainer',
    decision: 'approved',
    notes: 'Remote source archive, manifest, package hash, and submission artifacts reviewed.',
    json: false,
    help: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--archive-url') {
      options.archiveUrl = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--plugin-path') {
      options.pluginPath = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--output-dir') {
      options.outputDir = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--reviewer') {
      options.reviewer = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--decision') {
      options.decision = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--notes') {
      options.notes = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--json') {
      options.json = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  if (options.decision && !VALID_DECISIONS.has(options.decision)) {
    throw new Error(`Unknown approval decision: ${options.decision}`)
  }

  return options
}

const sessionIdFromDate = (date) => date.toISOString().replace(/[:.]/g, '-').replace(/-000Z$/, 'Z')

const writeJson = (filePath, value, fsImpl = fs) => {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true })
  fsImpl.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

const writeText = (filePath, content, fsImpl = fs) => {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true })
  fsImpl.writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`)
}

const shellQuote = (value) => `'${String(value).replace(/'/g, "'\\''")}'`

const sha256Buffer = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex')

const sha256File = (filePath, fsImpl = fs) => sha256Buffer(fsImpl.readFileSync(filePath))

const validateHttpsUrl = (url, label) => {
  let parsed
  try {
    parsed = new URL(url)
  } catch (error) {
    throw new Error(`${label} must be a valid URL`)
  }
  if (parsed.protocol !== 'https:') throw new Error(`${label} must use https:`)
  return parsed.toString()
}

const assertSafeArchiveEntry = (entryName) => {
  if (
    !SAFE_ARCHIVE_ENTRY_PATTERN.test(entryName) ||
    path.isAbsolute(entryName) ||
    /^[a-zA-Z]:[\\/]/.test(entryName) ||
    entryName.split('/').includes('..')
  ) {
    throw new Error('Remote archive contains unsafe paths')
  }
}

const assertSafeRelativePath = (relativePath, label) => {
  if (!relativePath || typeof relativePath !== 'string') throw new Error(`${label} is required`)
  if (
    path.isAbsolute(relativePath) ||
    /^[a-zA-Z]:[\\/]/.test(relativePath) ||
    relativePath.split(/[\\/]/).includes('..')
  ) {
    throw new Error(`${label} must stay inside the extracted archive`)
  }
}

const listFiles = (rootPath, fsImpl = fs) => {
  const files = []
  const walk = (currentPath, relativeRoot = '') => {
    const entries = fsImpl.readdirSync(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      const relativePath = relativeRoot ? `${relativeRoot}/${entry.name}` : entry.name
      const entryPath = path.join(currentPath, entry.name)
      if (entry.isDirectory()) {
        walk(entryPath, relativePath)
      } else if (entry.isFile()) {
        files.push(relativePath)
      }
    }
  }
  walk(rootPath)
  return files.sort()
}

const getFileHashes = (rootPath, fsImpl = fs) => Object.fromEntries(
  listFiles(rootPath, fsImpl).map((relativePath) => [
    relativePath,
    sha256File(path.join(rootPath, relativePath), fsImpl)
  ])
)

const resolveInside = (rootDir, relativePath) => {
  const resolved = path.resolve(rootDir, relativePath || '.')
  const relative = path.relative(rootDir, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Plugin path escapes the extracted archive: ${relativePath}`)
  }
  return resolved
}

const downloadHttpsArchive = ({ archiveUrl, archivePath, execFile = execFileSync, fsImpl = fs }) => {
  const normalizedArchiveUrl = validateHttpsUrl(archiveUrl, 'Archive URL')
  fsImpl.mkdirSync(path.dirname(archivePath), { recursive: true })
  const finalUrl = String(execFile('curl', [
    '--location',
    '--fail',
    '--silent',
    '--show-error',
    '--output',
    archivePath,
    '--write-out',
    '%{url_effective}',
    normalizedArchiveUrl
  ], { encoding: 'utf-8' })).trim()
  const normalizedFinalUrl = validateHttpsUrl(finalUrl || normalizedArchiveUrl, 'Final archive URL')
  return {
    archivePath,
    finalUrl: normalizedFinalUrl,
    archiveSha256: sha256File(archivePath, fsImpl),
    archiveByteSize: fsImpl.statSync(archivePath).size
  }
}

const extractArchiveToTemp = ({ archivePath, execFile = execFileSync, fsImpl = fs }) => {
  const entries = String(execFile('unzip', ['-Z1', archivePath], { encoding: 'utf-8' }))
    .split(/\r?\n/)
    .filter(Boolean)
  entries.forEach(assertSafeArchiveEntry)
  const extractRoot = fsImpl.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-remote-source-'))
  execFile('unzip', ['-qq', archivePath, '-d', extractRoot])
  return { extractRoot, entries }
}

const findPluginDirectory = ({ extractRoot, entries, pluginPath, fsImpl = fs }) => {
  assertSafeRelativePath(pluginPath, 'Plugin path')
  const candidates = [pluginPath]
  const topLevelDirs = [...new Set(entries.map((entry) => entry.split('/')[0]).filter(Boolean))]
  for (const topLevelDir of topLevelDirs) {
    candidates.push(`${topLevelDir}/${pluginPath}`)
  }

  for (const candidate of candidates) {
    const pluginDir = resolveInside(extractRoot, candidate)
    if (fsImpl.existsSync(path.join(pluginDir, 'plugin.json'))) {
      return {
        pluginDir,
        archivePluginPath: candidate,
        archiveRootPrefix: candidate === pluginPath ? '' : candidate.slice(0, -pluginPath.length).replace(/\/$/, '')
      }
    }
  }

  throw new Error(`Plugin directory not found inside remote archive: ${pluginPath}`)
}

const commandList = ({
  archiveUrl,
  pluginPath,
  archivePluginPath,
  packagePath,
  bundleDir,
  reviewer,
  decision,
  notes
}) => {
  const pluginPathHint = `<extract-dir>/${archivePluginPath || pluginPath}`
  return [
    `curl -L --fail --output <archive.zip> ${shellQuote(archiveUrl)}`,
    'unzip -qq <archive.zip> -d <extract-dir>',
    `npm run validate:plugin -- ${shellQuote(pluginPathHint)}`,
    `cd ${shellQuote(pluginPathHint)} && zip -qr ${shellQuote(packagePath)} .`,
    `npm run validate:plugin -- ${shellQuote(packagePath)}`,
    `npm run create-plugin-submission-bundle -- ${shellQuote(packagePath)} --output-dir ${shellQuote(bundleDir)}`,
    `npm run validate-plugin-submission-bundle -- ${shellQuote(bundleDir)} --require-ready`,
    `npm run create-plugin-maintainer-approval -- ${shellQuote(bundleDir)} --reviewer ${shellQuote(reviewer)} --decision ${decision} --notes ${shellQuote(notes)}`,
    `npm run validate-plugin-maintainer-approval -- ${shellQuote(bundleDir)} --require-approved`
  ]
}

const renderReadme = ({ generatedAt, summary, commands }) => [
  '# OpenPet Plugin Remote-Source Submission Rehearsal',
  '',
  `Generated: ${generatedAt}`,
  '',
  'This rehearsal starts from a public HTTPS archive, records remote-source provenance, packages the selected plugin snapshot, and records maintainer approval without installing, enabling, or running plugin code.',
  '',
  '## Remote Source',
  '',
  `- Archive URL: ${summary.sourceArchive.archiveUrl}`,
  `- Final URL: ${summary.sourceArchive.finalUrl}`,
  `- Archive SHA-256: ${summary.sourceArchive.archiveSha256}`,
  `- Archive size: ${summary.sourceArchive.archiveByteSize} bytes`,
  `- Requested plugin path: ${summary.sourceArchive.pluginPath}`,
  `- Resolved archive plugin path: ${summary.sourceArchive.archivePluginPath}`,
  '',
  '## Source Plugin',
  '',
  `- Name: ${summary.sourcePlugin.name}`,
  `- Id: ${summary.sourcePlugin.id}`,
  `- Version: ${summary.sourcePlugin.version}`,
  `- Package: ${summary.packagePath}`,
  `- Submission bundle: ${summary.submission.bundleDir}`,
  `- Approval decision: ${summary.approval.record.decision}`,
  '',
  '## Commands',
  '',
  '```bash',
  ...commands,
  '```',
  '',
  '## Boundary',
  '',
  '- This is remote-source workflow evidence, not proof of independent public community ownership.',
  '- Maintainer approval is a human review artifact.',
  '- The archive does not prove signing trust, catalog publication, runtime safety, or release readiness.',
  ''
].join('\n')

const renderChecklist = ({ summary }) => [
  '# Remote-Source Plugin Submission Checklist',
  '',
  `- [${summary.sourceArchive.archiveSha256 ? 'x' : ' '}] HTTPS archive URL, final URL, byte size, and SHA-256 recorded.`,
  `- [${Object.keys(summary.sourceArchive.extractedFileHashes).length ? 'x' : ' '}] Selected plugin file hashes recorded.`,
  `- [${summary.sourceValidation.ok ? 'x' : ' '}] Extracted source plugin validated.`,
  `- [${summary.packageValidation.ok ? 'x' : ' '}] Plugin packaged as .openpet-plugin.zip and validated.`,
  `- [${summary.submission.bundleValidation.ok ? 'x' : ' '}] Submission bundle created and validated.`,
  `- [${summary.approval.validation.ok ? 'x' : ' '}] Maintainer approval record created and validated.`,
  '- [ ] Reviewer verifies that the remote source is acceptable for the intended community workflow.',
  '- [ ] Maintainer verifies signature/trust policy before catalog distribution.',
  '',
  'Review reminder: remote-source capture is workflow evidence and does not establish signing trust or catalog publication.',
  ''
].join('\n')

const createPluginRemoteSourceSubmissionRehearsal = async ({
  archiveUrl,
  pluginPath,
  outputDir = '',
  reviewer = 'OpenPet Maintainer',
  decision = 'approved',
  notes = 'Remote source archive, manifest, package hash, and submission artifacts reviewed.',
  now = () => new Date(),
  fsImpl = fs,
  execFile = execFileSync,
  downloadArchive = downloadHttpsArchive
} = {}) => {
  if (!archiveUrl) throw new Error('Archive URL is required')
  if (!pluginPath) throw new Error('Plugin path is required')
  validateHttpsUrl(archiveUrl, 'Archive URL')
  assertSafeRelativePath(pluginPath, 'Plugin path')
  if (!VALID_DECISIONS.has(decision)) throw new Error(`Unknown approval decision: ${decision || '(missing)'}`)

  const generatedAt = now().toISOString()
  const resolvedOutputDir = outputDir || path.join(DEFAULT_OUTPUT_ROOT, sessionIdFromDate(new Date(generatedAt)))
  const absoluteOutputDir = assertSafeRehearsalOutputDir(resolvedOutputDir)
  const packagesDir = path.join(absoluteOutputDir, 'packages')
  const bundleDir = path.join(absoluteOutputDir, 'submission-bundle')
  const downloadDir = fsImpl.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-remote-archive-'))
  const archivePath = path.join(downloadDir, 'source-archive.zip')

  fsImpl.rmSync(absoluteOutputDir, { recursive: true, force: true })
  fsImpl.mkdirSync(packagesDir, { recursive: true })

  let extractRoot = ''
  try {
    const downloaded = await downloadArchive({ archiveUrl, archivePath, fsImpl, execFile })
    const archiveSha256 = downloaded.archiveSha256 || sha256File(downloaded.archivePath, fsImpl)
    const archiveByteSize = downloaded.archiveByteSize || fsImpl.statSync(downloaded.archivePath).size
    const finalUrl = validateHttpsUrl(downloaded.finalUrl || archiveUrl, 'Final archive URL')
    const extracted = extractArchiveToTemp({ archivePath: downloaded.archivePath, execFile, fsImpl })
    extractRoot = extracted.extractRoot
    const source = findPluginDirectory({
      extractRoot,
      entries: extracted.entries,
      pluginPath,
      fsImpl
    })

    const sourceValidation = validatePluginPackage(source.pluginDir)
    if (!sourceValidation.ok) {
      throw new Error(`Source plugin validation failed: ${sourceValidation.errors.join('; ')}`)
    }

    const sourcePlugin = {
      id: sourceValidation.review.plugin.id,
      name: sourceValidation.review.plugin.name,
      version: sourceValidation.review.plugin.version,
      permissions: sourceValidation.review.plugin.permissions,
      networkAllowlist: sourceValidation.review.plugin.network.allowlist
    }

    const packagePath = zipPluginDirectory({
      pluginDir: source.pluginDir,
      outputDir: packagesDir,
      pluginId: sourcePlugin.id,
      execFile,
      fsImpl
    })
    const packageValidation = validatePluginPackage(packagePath)
    if (!packageValidation.ok) {
      throw new Error(`Packaged plugin validation failed: ${packageValidation.errors.join('; ')}`)
    }

    const bundle = createPluginSubmissionBundle({
      sourcePath: packagePath,
      outputDir: bundleDir,
      now: () => new Date(generatedAt),
      fsImpl
    })
    const bundleValidation = validateBundle(loadBundle({ bundleDir, fsImpl }), { requireReady: true })
    if (!bundleValidation.ok) {
      throw new Error(`Submission bundle validation failed: ${bundleValidation.errors.join('; ')}`)
    }

    const approvalRecord = createPluginMaintainerApproval({
      bundleDir,
      reviewer,
      decision,
      notes,
      now: () => new Date(generatedAt),
      fsImpl
    })
    const approvalValidation = validateMaintainerApproval(loadApprovalBundle({ bundleDir, fsImpl }), { requireApproved: true })
    if (!approvalValidation.ok) {
      throw new Error(`Maintainer approval validation failed: ${approvalValidation.errors.join('; ')}`)
    }

    const commands = commandList({
      archiveUrl,
      pluginPath,
      archivePluginPath: source.archivePluginPath,
      packagePath,
      bundleDir,
      reviewer,
      decision,
      notes
    })
    const summary = {
      generatedAt,
      outputDir: absoluteOutputDir,
      sourceArchive: {
        kind: 'https-archive',
        archiveUrl,
        finalUrl,
        archiveSha256,
        archiveByteSize,
        pluginPath,
        archivePluginPath: source.archivePluginPath,
        archiveRootPrefix: source.archiveRootPrefix,
        extractedFileHashes: getFileHashes(source.pluginDir, fsImpl),
        downloadedAt: generatedAt
      },
      sourcePlugin,
      sourceValidation: {
        ok: sourceValidation.ok,
        warnings: sourceValidation.warnings,
        errors: sourceValidation.errors,
        riskLevel: sourceValidation.review.riskLevel
      },
      packagePath,
      packageValidation: {
        ok: packageValidation.ok,
        warnings: packageValidation.warnings,
        errors: packageValidation.errors,
        riskLevel: packageValidation.review.riskLevel,
        sha256: packageValidation.review.packageHash
      },
      submission: {
        bundleDir,
        bundle,
        bundleValidation
      },
      approval: {
        record: approvalRecord,
        validation: approvalValidation
      },
      files: {
        readme: path.join(absoluteOutputDir, 'README.md'),
        checklist: path.join(absoluteOutputDir, 'submission-checklist.md'),
        commands: path.join(absoluteOutputDir, 'commands.json'),
        provenance: path.join(absoluteOutputDir, 'source-provenance.json'),
        summary: path.join(absoluteOutputDir, 'plugin-remote-source-submission-rehearsal-summary.json')
      }
    }

    writeText(summary.files.readme, renderReadme({ generatedAt, summary, commands }), fsImpl)
    writeText(summary.files.checklist, renderChecklist({ summary }), fsImpl)
    writeJson(summary.files.commands, { commands }, fsImpl)
    writeJson(summary.files.provenance, summary.sourceArchive, fsImpl)
    writeJson(summary.files.summary, summary, fsImpl)

    return summary
  } finally {
    if (extractRoot) fsImpl.rmSync(extractRoot, { recursive: true, force: true })
    fsImpl.rmSync(downloadDir, { recursive: true, force: true })
  }
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const summary = await createPluginRemoteSourceSubmissionRehearsal(options)
  if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  } else {
    console.log(`Plugin remote-source submission rehearsal created: ${summary.outputDir}`)
    console.log(`README: ${summary.files.readme}`)
    console.log(`Checklist: ${summary.files.checklist}`)
    console.log(`Submission bundle: ${summary.submission.bundleDir}`)
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error)
    process.exit(1)
  })
}

module.exports = {
  createPluginRemoteSourceSubmissionRehearsal,
  downloadHttpsArchive,
  findPluginDirectory,
  parseArgs,
  renderChecklist,
  renderReadme,
  sessionIdFromDate
}
