const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const { macosEvidenceStatus } = require('./create-release-evidence-archive-manifest')

const DEFAULT_OUTPUT_ROOT = path.join('docs', 'release-evidence', 'macos-release-evidence-archive')
const DEFAULT_MANIFEST_NAME = 'macos-release-evidence-artifact-manifest.json'

const REQUIRED_FILES = [
  { role: 'macosCodesignEvidence', fileName: 'macos-codesign.txt', kind: 'codesign' },
  { role: 'macosNotarizationEvidence', fileName: 'macos-notarization.txt', kind: 'notarization' },
  { role: 'macosGatekeeperEvidence', fileName: 'macos-gatekeeper.txt', kind: 'gatekeeper' }
]

const OPTIONAL_FILES = [
  { role: 'macosReleaseEvidenceMarkdownSummary', fileName: 'macos-release-evidence-summary.md' },
  { role: 'macosReleaseEvidenceJsonSummary', fileName: 'macos-release-evidence-summary.json' }
]

const usage = () => [
  'Usage: node scripts/create-macos-release-evidence-archive.js --artifact-dir <dir> [options]',
  '',
  'Options:',
  '  --artifact-dir <dir>       Downloaded macOS workflow evidence artifact directory',
  '  --archive-dir <dir>        Permanent release archive directory to write into',
  '  --artifact-name <name>     GitHub Actions artifact name, for provenance',
  '  --release-tag <tag>        Release tag associated with the artifact',
  '  --workflow-run-url <url>   GitHub Actions run URL associated with the artifact',
  '  --output <manifest.json>   Manifest path; defaults inside archive dir',
  '  --json                    Print manifest JSON',
  '  --help',
  '',
  'Copies the downloaded macOS release evidence Actions artifact into a permanent',
  'release evidence archive and writes hashes/provenance. This records evidence',
  'transfer only; official readiness remains gated by release archive and closure reports.'
].join('\n')

const readValue = (argv, index, flag) => {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

const parseArgs = (argv) => {
  const options = {
    artifactDir: '',
    archiveDir: '',
    artifactName: '',
    releaseTag: '',
    workflowRunUrl: '',
    outputPath: '',
    json: false,
    help: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--artifact-dir') {
      options.artifactDir = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--archive-dir') {
      options.archiveDir = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--artifact-name') {
      options.artifactName = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--release-tag') {
      options.releaseTag = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--workflow-run-url') {
      options.workflowRunUrl = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--output') {
      options.outputPath = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--json') {
      options.json = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  if (!options.help && !options.artifactDir) throw new Error('--artifact-dir is required')
  return options
}

const sessionIdFromDate = (date) => date.toISOString().replace(/[:.]/g, '-').replace(/-000Z$/, 'Z')

const sha256 = (content) => crypto.createHash('sha256').update(content).digest('hex')

const safeChildPath = (rootDir, fileName) => {
  const root = path.resolve(rootDir)
  const filePath = path.resolve(root, fileName)
  const relative = path.relative(root, filePath)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Unsafe artifact file path: ${fileName}`)
  }
  return filePath
}

const assertPlainFile = ({ filePath, role, fsImpl = fs }) => {
  let stat
  try {
    stat = fsImpl.lstatSync(filePath)
  } catch (err) {
    throw new Error(`Missing ${role}: ${filePath}`)
  }
  if (!stat.isFile()) throw new Error(`${role} must be a regular file: ${filePath}`)
}

const validateSourceFile = ({ artifactRoot, descriptor, required, fsImpl = fs }) => {
  const sourcePath = safeChildPath(artifactRoot, descriptor.fileName)
  if (!fsImpl.existsSync(sourcePath)) {
    if (required) throw new Error(`Missing ${descriptor.role}: ${sourcePath}`)
    return null
  }
  assertPlainFile({ filePath: sourcePath, role: descriptor.role, fsImpl })
  return sourcePath
}

const assertTargetDoesNotExist = ({ filePath, role, fsImpl = fs }) => {
  if (fsImpl.existsSync(filePath)) {
    throw new Error(`${role} already exists in archive: ${filePath}`)
  }
}

const copyEvidenceFile = ({ artifactRoot, archiveRoot, descriptor, required, fsImpl = fs }) => {
  const sourcePath = safeChildPath(artifactRoot, descriptor.fileName)
  const archivedPath = safeChildPath(archiveRoot, descriptor.fileName)

  if (!fsImpl.existsSync(sourcePath)) {
    if (required) throw new Error(`Missing ${descriptor.role}: ${sourcePath}`)
    return null
  }

  assertPlainFile({ filePath: sourcePath, role: descriptor.role, fsImpl })
  const content = fsImpl.readFileSync(sourcePath)
  fsImpl.mkdirSync(path.dirname(archivedPath), { recursive: true })
  fsImpl.writeFileSync(archivedPath, content)

  const file = {
    role: descriptor.role,
    fileName: descriptor.fileName,
    sourcePath,
    archivedPath,
    bytes: content.length,
    sha256: sha256(content)
  }

  if (descriptor.kind) {
    file.status = macosEvidenceStatus({ kind: descriptor.kind, content: content.toString('utf-8') })
    file.releaseReady = file.status === 'pass'
  }

  return file
}

const createMacosReleaseEvidenceArchive = ({
  artifactDir,
  archiveDir = '',
  artifactName = '',
  releaseTag = '',
  workflowRunUrl = '',
  outputPath = '',
  now = () => new Date(),
  fsImpl = fs
} = {}) => {
  if (!artifactDir) throw new Error('artifactDir is required')

  const generatedAt = now().toISOString()
  const absoluteArtifactDir = path.resolve(artifactDir)
  const absoluteArchiveDir = path.resolve(archiveDir || path.join(DEFAULT_OUTPUT_ROOT, sessionIdFromDate(new Date(generatedAt))))
  const absoluteOutputPath = path.resolve(outputPath || path.join(absoluteArchiveDir, DEFAULT_MANIFEST_NAME))

  const artifactStat = fsImpl.statSync(absoluteArtifactDir)
  if (!artifactStat.isDirectory()) throw new Error(`artifactDir must be a directory: ${absoluteArtifactDir}`)

  for (const descriptor of REQUIRED_FILES) {
    validateSourceFile({ artifactRoot: absoluteArtifactDir, descriptor, required: true, fsImpl })
  }
  for (const descriptor of OPTIONAL_FILES) {
    validateSourceFile({ artifactRoot: absoluteArtifactDir, descriptor, required: false, fsImpl })
  }
  for (const descriptor of [...REQUIRED_FILES, ...OPTIONAL_FILES]) {
    assertTargetDoesNotExist({
      filePath: safeChildPath(absoluteArchiveDir, descriptor.fileName),
      role: descriptor.role,
      fsImpl
    })
  }
  assertTargetDoesNotExist({
    filePath: absoluteOutputPath,
    role: 'macosReleaseEvidenceArtifactManifest',
    fsImpl
  })

  fsImpl.mkdirSync(absoluteArchiveDir, { recursive: true })

  const requiredFiles = REQUIRED_FILES.map((descriptor) => copyEvidenceFile({
    artifactRoot: absoluteArtifactDir,
    archiveRoot: absoluteArchiveDir,
    descriptor,
    required: true,
    fsImpl
  }))
  const optionalFiles = OPTIONAL_FILES.map((descriptor) => copyEvidenceFile({
    artifactRoot: absoluteArtifactDir,
    archiveRoot: absoluteArchiveDir,
    descriptor,
    required: false,
    fsImpl
  })).filter(Boolean)

  const macosEvidenceReady = requiredFiles.every((file) => file.releaseReady)
  const warnings = macosEvidenceReady
    ? ['macOS evidence files look passing; official release readiness still requires release archive and signed closure validation']
    : ['macOS evidence is archived but does not prove official signed release readiness']

  const manifest = {
    generatedAt,
    ok: true,
    macosEvidenceReady,
    archive: {
      archiveDir: absoluteArchiveDir,
      outputPath: absoluteOutputPath
    },
    source: {
      artifactDir: absoluteArtifactDir,
      artifactName,
      releaseTag,
      workflowRunUrl
    },
    files: [...requiredFiles, ...optionalFiles],
    warnings
  }

  writeManifest({ manifest, outputPath: absoluteOutputPath, fsImpl })
  return manifest
}

const writeManifest = ({ manifest, outputPath, fsImpl = fs }) => {
  const absoluteOutputPath = path.resolve(outputPath)
  fsImpl.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true })
  fsImpl.writeFileSync(absoluteOutputPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return absoluteOutputPath
}

const main = () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const manifest = createMacosReleaseEvidenceArchive(options)
  if (options.json) {
    console.log(JSON.stringify(manifest, null, 2))
  } else {
    console.log(`macOS release evidence archived: ${manifest.archive.archiveDir}`)
    console.log(`Manifest: ${manifest.archive.outputPath}`)
    console.log(`macOS evidence ready: ${manifest.macosEvidenceReady ? 'yes' : 'no'}`)
    for (const warning of manifest.warnings) console.warn(`Warning: ${warning}`)
  }
}

if (require.main === module) {
  try {
    main()
  } catch (err) {
    console.error(err.message || err)
    process.exit(1)
  }
}

module.exports = {
  createMacosReleaseEvidenceArchive,
  parseArgs,
  writeManifest
}
