const fs = require('fs')
const path = require('path')

const { execFileSync } = require('child_process')
const os = require('os')

const { sessionIdFromDate } = require('./create-plugin-remote-source-submission-rehearsal')
const { validatePluginPackage } = require('./validate-plugin-package')
const { assertSafeRehearsalOutputDir } = require('./create-plugin-author-rehearsal')

const DEFAULT_OUTPUT_ROOT = path.join('docs', 'release-evidence', 'plugin-community-source-intake-report')

const usage = () => [
  'Usage: node scripts/create-plugin-community-source-intake-report.js --archive-url <https-url> --plugin-path <path> --community-source-url <https-url> --submitter <name> [options]',
  '',
  'Options:',
  '  --archive-url <https-url>            HTTPS zip archive URL to inspect',
  '  --plugin-path <path>                 Candidate plugin directory inside the extracted archive',
  '  --community-source-url <https-url>   Public source, PR, issue, or submission URL being reviewed',
  '  --submitter <name>                   Community submitter or source owner label',
  '  --notes <text>                       Maintainer notes about compatibility and provenance',
  '  --output-dir <dir>                   Directory for intake artifacts',
  '  --json                               Print the machine-readable intake summary',
  '  --help',
  '',
  'Creates a compatibility-first intake report for candidate community sources. The',
  'command records archive provenance and package-model compatibility, but does not',
  'install, enable, run, sign, publish, or trust the plugin.'
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
    communitySourceUrl: '',
    submitter: '',
    notes: 'Candidate source inspected for OpenPet package-model compatibility.',
    outputDir: '',
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
    } else if (arg === '--community-source-url') {
      options.communitySourceUrl = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--submitter') {
      options.submitter = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--notes') {
      options.notes = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--output-dir') {
      options.outputDir = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--json') {
      options.json = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  return options
}

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

const writeJson = (filePath, value, fsImpl = fs) => {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true })
  fsImpl.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

const writeText = (filePath, content, fsImpl = fs) => {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true })
  fsImpl.writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`)
}

const SAFE_ARCHIVE_ENTRY_PATTERN = /^[^/\\\0][^\\\0]*$/

const shellQuote = (value) => `'${String(value).replace(/'/g, "'\\''")}'`

const sha256File = (filePath, fsImpl = fs) => require('crypto').createHash('sha256').update(fsImpl.readFileSync(filePath)).digest('hex')

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

const resolveInside = (rootDir, relativePath) => {
  const resolved = path.resolve(rootDir, relativePath || '.')
  const relative = path.relative(rootDir, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Candidate path escapes the extracted archive: ${relativePath}`)
  }
  return resolved
}

const listFiles = (rootPath, fsImpl = fs) => {
  if (!fsImpl.existsSync(rootPath) || !fsImpl.statSync(rootPath).isDirectory()) return []
  const files = []
  const walk = (currentPath, relativeRoot = '') => {
    const entries = fsImpl.readdirSync(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      const relativePath = relativeRoot ? `${relativeRoot}/${entry.name}` : entry.name
      const entryPath = path.join(currentPath, entry.name)
      if (entry.isDirectory()) walk(entryPath, relativePath)
      else if (entry.isFile()) files.push(relativePath)
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
    archiveUrl: normalizedArchiveUrl,
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
  const extractRoot = fsImpl.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-community-intake-'))
  execFile('unzip', ['-qq', archivePath, '-d', extractRoot])
  return { extractRoot, entries }
}

const commandList = ({
  archiveUrl,
  pluginPath,
  communitySourceUrl,
  submitter,
  notes,
  outputDir
}) => [
  `curl -L --fail --output <archive.zip> ${shellQuote(archiveUrl)}`,
  `unzip -qq <archive.zip> -d <extract-dir>`,
  `npm run validate:plugin -- <extract-dir>/${shellQuote(pluginPath)}`,
  `npm run create-plugin-community-source-submission-evidence -- --archive-url ${shellQuote(archiveUrl)} --plugin-path ${shellQuote(pluginPath)} --community-source-url ${shellQuote(communitySourceUrl)} --submitter ${shellQuote(submitter)} --independence-notes ${shellQuote(notes)} --output-dir ${shellQuote(outputDir)}`,
  'Review the output. If status is ready-for-community-evidence, continue into Phase 99.'
]

const renderReadme = ({ generatedAt, summary, commands }) => [
  '# OpenPet Plugin Community-Source Intake Report',
  '',
  `Generated: ${generatedAt}`,
  '',
  'This intake report inspects a public candidate source before it enters the community-source submission evidence flow. It distinguishes compatible OpenPet packages from neighboring ecosystem repositories that only mention OpenPet/OpenPets.',
  '',
  '## Candidate Source',
  '',
  `- Source URL: ${summary.communitySource.url}`,
  `- Submitter: ${summary.communitySource.submitter}`,
  `- Status: ${summary.status}`,
  `- Compatibility: ${summary.compatibility.summary}`,
  '',
  '## Archive Snapshot',
  '',
  `- Archive URL: ${summary.archive.archiveUrl}`,
  `- Final URL: ${summary.archive.finalUrl}`,
  `- Archive SHA-256: ${summary.archive.archiveSha256}`,
  `- Archive byte size: ${summary.archive.archiveByteSize}`,
  `- Candidate plugin path: ${summary.archive.pluginPath}`,
  `- Resolved archive plugin path: ${summary.archive.archivePluginPath || '(none)'}`,
  `- Source plugin id: ${summary.plugin?.id || '(none)'}`,
  '',
  '## Commands',
  '',
  '```bash',
  ...commands,
  '```',
  '',
  '## Boundary',
  '',
  '- This does not prove community plugin compatibility beyond the recorded candidate path and archive snapshot.',
  '- This does not prove community-source submission evidence by itself.',
  '- This does not prove signing trust, catalog publication, runtime safety, or release readiness.',
  '- If the candidate is compatible, run the Phase 99 command next.',
  '- If the candidate is incompatible, keep the archive as evidence of the gap instead of forcing it through the submission flow.',
  ''
].join('\n')

const renderChecklist = ({ summary }) => [
  '# Community-Source Intake Checklist',
  '',
  `- [${summary.communitySource.url ? 'x' : ' '}] Public candidate source URL recorded.`,
  `- [${summary.communitySource.submitter ? 'x' : ' '}] Submitter or source owner label recorded.`,
  `- [${summary.archive.archiveSha256 ? 'x' : ' '}] HTTPS archive URL, final URL, byte size, and SHA-256 recorded.`,
  `- [${summary.status ? 'x' : ' '}] Compatibility status recorded.`,
  `- [${summary.compatibility.reasonCode ? 'x' : ' '}] Compatibility reason code recorded.`,
  `- [${summary.compatibility.ok ? 'x' : ' '}] Candidate is ready for Phase 99 evidence flow.`,
  '- [ ] Reviewer separately decides whether the candidate should enter the Phase 99 submission chain.',
  '',
  'Review reminder: this report captures compatibility and provenance, not trust or readiness.',
  ''
].join('\n')

const resolvePluginCandidate = ({ extractRoot, pluginPath, entries, fsImpl = fs }) => {
  assertSafeRelativePath(pluginPath, 'Plugin path')
  const candidates = []
  if (pluginPath) candidates.push(pluginPath)
  const topLevelDirs = [...new Set((entries || []).map((entry) => entry.split('/')[0]).filter(Boolean))]
  for (const topLevelDir of topLevelDirs) {
    candidates.push(pluginPath === '.' ? topLevelDir : `${topLevelDir}/${pluginPath}`)
  }

  const existingCandidates = []
  for (const candidate of candidates) {
    const absoluteCandidate = resolveInside(extractRoot, candidate)
    if (fsImpl.existsSync(absoluteCandidate)) {
      existingCandidates.push({
        absoluteCandidate,
        archivePluginPath: candidate
      })
    }
  }

  return existingCandidates.find((candidate) => fsImpl.existsSync(path.join(candidate.absoluteCandidate, 'plugin.json'))) ||
    existingCandidates[0] ||
    null
}

const createPluginCommunitySourceIntakeReport = async ({
  archiveUrl,
  pluginPath,
  communitySourceUrl,
  submitter,
  notes = 'Candidate source inspected for OpenPet package-model compatibility.',
  outputDir = '',
  now = () => new Date(),
  fsImpl = fs,
  execFile = execFileSync,
  downloadArchive
} = {}) => {
  if (!archiveUrl) throw new Error('Archive URL is required')
  if (!pluginPath) throw new Error('Plugin path is required')
  if (!communitySourceUrl) throw new Error('Community source URL is required')
  if (!submitter) throw new Error('Submitter is required')

  const normalizedArchiveUrl = validateHttpsUrl(archiveUrl, 'Archive URL')
  const normalizedCommunitySourceUrl = validateHttpsUrl(communitySourceUrl, 'Community source URL')
  const generatedAt = now().toISOString()
  const resolvedOutputDir = outputDir || path.join(DEFAULT_OUTPUT_ROOT, sessionIdFromDate(new Date(generatedAt)))
  const absoluteOutputDir = assertSafeRehearsalOutputDir(resolvedOutputDir)

  const downloadDir = fsImpl.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-community-intake-download-'))
  const archivePath = path.join(downloadDir, 'candidate.zip')
  let extractRoot = ''
  try {
    const archive = downloadArchive
      ? downloadArchive({ archiveUrl: normalizedArchiveUrl, archivePath, fsImpl, execFile })
      : downloadHttpsArchive({ archiveUrl: normalizedArchiveUrl, archivePath, fsImpl, execFile })
    const extraction = extractArchiveToTemp({ archivePath, fsImpl, execFile })
    extractRoot = extraction.extractRoot

    const archivePluginCandidate = resolvePluginCandidate({
      extractRoot,
      pluginPath,
      entries: extraction.entries,
      fsImpl
    })

    const compatibility = {
      ok: false,
      reasonCode: 'plugin-path-not-found',
      summary: 'Candidate plugin path was not found inside the archive.'
    }

    let plugin = null
    let extractedFileHashes = {}
    if (archivePluginCandidate) {
      extractedFileHashes = getFileHashes(archivePluginCandidate.absoluteCandidate, fsImpl)
      const pluginJsonPath = path.join(archivePluginCandidate.absoluteCandidate, 'plugin.json')
      if (!fsImpl.existsSync(pluginJsonPath)) {
        compatibility.reasonCode = 'plugin-json-missing'
        compatibility.summary = 'Candidate archive is incompatible with the current OpenPet plugin model because it requires a package rooted by plugin.json.'
      } else {
        const validation = validatePluginPackage(archivePluginCandidate.absoluteCandidate)
        if (validation.ok) {
          plugin = {
            id: validation.review.plugin.id,
            name: validation.review.plugin.name,
            version: validation.review.plugin.version,
            permissions: validation.review.plugin.permissions,
            networkAllowlist: validation.review.plugin.network.allowlist
          }
          compatibility.ok = true
          compatibility.reasonCode = 'openpet-plugin-package'
          compatibility.summary = 'Candidate archive contains a valid OpenPet plugin package rooted by plugin.json.'
        } else {
          compatibility.reasonCode = 'plugin-json-invalid'
          compatibility.summary = `Candidate package is structurally incompatible with the current OpenPet plugin model: ${validation.errors.join('; ')}`
        }
      }
    } else {
      compatibility.reasonCode = 'plugin-path-not-found'
      compatibility.summary = 'Candidate plugin path was not found inside the archive.'
    }

    const status = compatibility.ok ? 'ready-for-community-evidence' : 'incompatible-package-model'
    const files = {
      readme: path.join(absoluteOutputDir, 'README-community-intake.md'),
      checklist: path.join(absoluteOutputDir, 'community-intake-checklist.md'),
      commands: path.join(absoluteOutputDir, 'community-intake-commands.json'),
      intake: path.join(absoluteOutputDir, 'community-source-intake.json'),
      summary: path.join(absoluteOutputDir, 'plugin-community-source-intake-report-summary.json')
    }
    const summary = {
      generatedAt,
      outputDir: absoluteOutputDir,
      communitySource: {
        kind: 'community-source',
        url: normalizedCommunitySourceUrl,
        submitter: submitter.trim()
      },
      archive: {
        kind: 'https-archive',
        archiveUrl: archive.archiveUrl || normalizedArchiveUrl,
        finalUrl: archive.finalUrl,
        archiveSha256: archive.archiveSha256,
        archiveByteSize: archive.archiveByteSize,
        pluginPath,
        archivePluginPath: archivePluginCandidate?.archivePluginPath || '',
        extractedFileHashes
      },
      plugin,
      compatibility,
      status,
      notes: notes.trim(),
      files
    }
    const commands = commandList({
      archiveUrl: normalizedArchiveUrl,
      pluginPath,
      communitySourceUrl: normalizedCommunitySourceUrl,
      submitter: summary.communitySource.submitter,
      notes: summary.notes,
      outputDir: absoluteOutputDir
    })

    writeText(files.readme, renderReadme({ generatedAt, summary, commands }), fsImpl)
    writeText(files.checklist, renderChecklist({ summary }), fsImpl)
    writeJson(files.commands, { commands }, fsImpl)
    writeJson(files.intake, summary, fsImpl)
    writeJson(files.summary, summary, fsImpl)

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

  const summary = await createPluginCommunitySourceIntakeReport(options)
  if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  } else {
    console.log(`Plugin community-source intake report created: ${summary.outputDir}`)
    console.log(`README: ${summary.files.readme}`)
    console.log(`Checklist: ${summary.files.checklist}`)
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error)
    process.exit(1)
  })
}

module.exports = {
  createPluginCommunitySourceIntakeReport,
  parseArgs,
  renderChecklist,
  renderReadme,
  resolvePluginCandidate
}
