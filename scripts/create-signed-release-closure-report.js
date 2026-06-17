const fs = require('fs')
const path = require('path')

const {
  createReleaseEvidenceArchiveManifest,
  resolveArchivePaths,
  writeManifest
} = require('./create-release-evidence-archive-manifest')

const usage = () => [
  'Usage: node scripts/create-signed-release-closure-report.js [options]',
  '',
  'Options:',
  '  --archive-dir <dir>                 Evidence archive directory',
  '  --manifest <manifest.json>          Read an existing release evidence archive manifest',
  '  --manifest-output <manifest.json>   Write the generated archive manifest',
  '  --windows-smoke-report <report.json>',
  '  --windows-smoke-archive-manifest <manifest.json>',
  '  --desktop-picker-report <report.json>',
  '  --desktop-picker-archive-manifest <manifest.json>',
  '  --packaged-runtime-report <report.json>',
  '  --macos-codesign <evidence.txt>',
  '  --macos-notarization <evidence.txt>',
  '  --macos-gatekeeper <evidence.txt>',
  '  --output <report.md>                Write the Markdown closure report',
  '  --json-output <report.json>         Write the JSON closure report',
  '  --fail-on-not-ready                 Exit non-zero when the closure is not release-ready',
  '  --json                              Print the JSON closure report',
  '  --help',
  '',
  'The closure report turns archive evidence into release-claim language. It never',
  'upgrades pending, unsigned, or missing evidence into a release-ready claim.'
].join('\n')

const readValue = (argv, index, flag) => {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

const parseArgs = (argv) => {
  const options = {
    archiveDir: 'release-evidence-archive',
    manifestPath: '',
    manifestOutput: '',
    windowsSmokeReportPath: null,
    windowsSmokeArchiveManifestPath: null,
    desktopPickerReportPath: null,
    desktopPickerArchiveManifestPath: null,
    packagedRuntimeReportPath: null,
    macosCodesignPath: null,
    macosNotarizationPath: null,
    macosGatekeeperPath: null,
    outputPath: '',
    jsonOutputPath: '',
    failOnNotReady: false,
    json: false,
    help: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--archive-dir') {
      options.archiveDir = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--manifest') {
      options.manifestPath = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--manifest-output') {
      options.manifestOutput = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--windows-smoke-report') {
      options.windowsSmokeReportPath = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--windows-smoke-archive-manifest') {
      options.windowsSmokeArchiveManifestPath = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--desktop-picker-report') {
      options.desktopPickerReportPath = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--desktop-picker-archive-manifest') {
      options.desktopPickerArchiveManifestPath = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--packaged-runtime-report') {
      options.packagedRuntimeReportPath = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--macos-codesign') {
      options.macosCodesignPath = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--macos-notarization') {
      options.macosNotarizationPath = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--macos-gatekeeper') {
      options.macosGatekeeperPath = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--output') {
      options.outputPath = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--json-output') {
      options.jsonOutputPath = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--fail-on-not-ready') {
      options.failOnNotReady = true
    } else if (arg === '--json') {
      options.json = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  if (!options.archiveDir) throw new Error('--archive-dir requires a value')
  return options
}

const hasText = (value) => String(value || '').trim().length > 0

const reportPlatform = (section) => section?.report?.platform || ''

const validationErrors = (section) => [
  ...(section?.structuralValidation?.errors || []),
  ...(section?.readinessValidation?.errors || []),
  ...(section?.errors || [])
]

const reportBlockers = ({ label, section, requiredPlatform }) => {
  const blockers = []
  if (!section?.file?.exists) {
    blockers.push(`${label} is missing`)
    return blockers
  }
  if (requiredPlatform && reportPlatform(section) !== requiredPlatform) {
    blockers.push(`${label} is for ${reportPlatform(section) || 'unknown platform'}, not ${requiredPlatform}`)
  }
  if (section.releaseReady !== true) {
    const errors = validationErrors(section).filter(hasText)
    if (errors.length) blockers.push(...errors.map((error) => `${label}: ${error}`))
    else blockers.push(`${label} is archived but not signed release-ready`)
  }
  return blockers
}

const archiveBlockers = ({ label, section, matchLabel = 'archived report' }) => {
  const blockers = []
  if (!section?.file?.exists) {
    blockers.push(`${label} is missing`)
    return blockers
  }
  const matchesReport = section.matchesReport ?? section.matchesDesktopPickerReport
  if (matchesReport !== true) {
    const errors = (section.errors || []).filter(hasText)
    if (errors.length) blockers.push(...errors.map((error) => `${label}: ${error}`))
    else blockers.push(`${label} does not match the ${matchLabel}`)
  }
  if (section.releaseReady !== true) {
    const errors = (section.errors || []).filter(hasText)
    if (errors.length) blockers.push(...errors.map((error) => `${label}: ${error}`))
    else blockers.push(`${label} is archived but not signed release-ready`)
  }
  return blockers
}

const macosBlockers = (manifest) => {
  const blockers = []
  const macos = manifest.macos || {}
  for (const [label, section] of [
    ['macOS codesign evidence', macos.codesign],
    ['macOS notarization evidence', macos.notarization],
    ['macOS Gatekeeper evidence', macos.gatekeeper]
  ]) {
    if (!section?.file?.exists) blockers.push(`${label} is missing`)
    else if (section.status !== 'pass') blockers.push(`${label} status is ${section.status || 'not pass'}`)
  }
  return blockers
}

const unique = (items) => [...new Set(items.filter(hasText))]

const createClaim = ({ key, ready, claim, blockedClaim, blockers }) => ({
  key,
  status: ready ? 'ready' : 'not-ready',
  claim: ready ? claim : blockedClaim,
  blockers: unique(blockers)
})

const createSignedReleaseClosureReport = ({ manifest, now = () => new Date() }) => {
  const packagedRuntime = manifest.reports?.packagedRuntime
  const desktopPicker = manifest.reports?.desktopPicker
  const windowsSmoke = manifest.reports?.windowsSmoke
  const windowsSmokeArchive = manifest.archives?.windowsSmoke
  const desktopPickerArchive = manifest.archives?.desktopPicker

  const macosClaimBlockers = unique([
    ...macosBlockers(manifest),
    ...reportBlockers({
      label: 'macOS packaged runtime evidence',
      section: packagedRuntime,
      requiredPlatform: 'darwin'
    })
  ])
  const windowsClaimBlockers = unique([
    ...reportBlockers({
      label: 'Windows smoke evidence',
      section: windowsSmoke,
      requiredPlatform: 'win32'
    }),
    ...archiveBlockers({
      label: 'Windows smoke archive evidence',
      section: windowsSmokeArchive,
      matchLabel: 'archived Windows smoke report'
    }),
    ...reportBlockers({
      label: 'Windows desktop picker evidence',
      section: desktopPicker,
      requiredPlatform: 'win32'
    }),
    ...archiveBlockers({
      label: 'Windows desktop picker archive evidence',
      section: desktopPickerArchive,
      matchLabel: 'archived desktop picker report'
    }),
    ...reportBlockers({
      label: 'Windows packaged runtime evidence',
      section: packagedRuntime,
      requiredPlatform: 'win32'
    })
  ])

  const manifestBlockers = unique([
    ...(manifest.errors || []).map((error) => `Archive manifest: ${error}`),
    ...(manifest.releaseReady ? [] : ['Archive manifest releaseReady is false'])
  ])

  const macosReady = macosClaimBlockers.length === 0
  const windowsReady = windowsClaimBlockers.length === 0
  const officialDesktopReady = manifest.releaseReady === true && macosReady && windowsReady && manifestBlockers.length === 0

  return {
    schemaVersion: 1,
    generatedAt: now().toISOString(),
    releaseReady: officialDesktopReady,
    manifest: {
      ok: manifest.ok === true,
      releaseReady: manifest.releaseReady === true,
      requireSigned: manifest.requireSigned === true,
      archiveDir: manifest.archive?.archiveDir || '',
      outputPath: manifest.archive?.outputPath || ''
    },
    claims: {
      officialDesktopRelease: createClaim({
        key: 'officialDesktopRelease',
        ready: officialDesktopReady,
        claim: 'OpenPet may claim official signed desktop release readiness for the archived evidence set.',
        blockedClaim: 'Do not claim official signed desktop release readiness for this evidence set.',
        blockers: [...manifestBlockers, ...macosClaimBlockers, ...windowsClaimBlockers]
      }),
      macos: createClaim({
        key: 'macos',
        ready: macosReady,
        claim: 'OpenPet may claim macOS signed, notarized, Gatekeeper-accepted runtime readiness for this archived artifact.',
        blockedClaim: 'Do not claim macOS signed release readiness for this archived artifact.',
        blockers: macosClaimBlockers
      }),
      windows: createClaim({
        key: 'windows',
        ready: windowsReady,
        claim: 'OpenPet may claim Windows signed smoke readiness for this archived artifact.',
        blockedClaim: 'Do not claim Windows release readiness for this archived artifact.',
        blockers: windowsClaimBlockers
      })
    },
    smartScreen: {
      status: windowsReady ? 'document-observed-result' : 'not-proven',
      claim: 'SmartScreen reputation must be documented as an observed result only; Authenticode and smoke evidence do not prove reputation trust.'
    },
    nextActions: officialDesktopReady
      ? ['Attach the closure report and archive manifest to the release notes before publishing.']
      : unique([
          ...macosClaimBlockers.length ? ['Capture signed macOS codesign, notarization, Gatekeeper, and packaged runtime launch evidence.'] : [],
          ...windowsClaimBlockers.length ? ['Capture signed Windows Authenticode, clean-machine smoke, desktop picker, and packaged runtime evidence.'] : [],
          ...manifestBlockers.length ? ['Regenerate the release evidence archive manifest with --require-signed after all evidence is ready.'] : []
        ])
  }
}

const renderMarkdown = (report) => {
  const lines = []
  lines.push('# Signed Release Evidence Closure')
  lines.push('')
  lines.push(`Generated: ${report.generatedAt}`)
  lines.push(`Overall release-ready: ${report.releaseReady ? 'yes' : 'no'}`)
  lines.push(`Archive manifest ok: ${report.manifest.ok ? 'yes' : 'no'}`)
  lines.push(`Archive manifest releaseReady: ${report.manifest.releaseReady ? 'yes' : 'no'}`)
  lines.push('')
  lines.push('| Claim | Status | Release wording |')
  lines.push('|------|--------|-----------------|')
  for (const claim of [
    report.claims.officialDesktopRelease,
    report.claims.macos,
    report.claims.windows
  ]) {
    lines.push(`| ${claim.key} | ${claim.status} | ${claim.claim} |`)
  }
  lines.push('')
  lines.push('## Blockers')
  for (const claim of [
    report.claims.officialDesktopRelease,
    report.claims.macos,
    report.claims.windows
  ]) {
    lines.push('')
    lines.push(`### ${claim.key}`)
    if (claim.blockers.length === 0) {
      lines.push('- None.')
    } else {
      for (const blocker of claim.blockers) lines.push(`- ${blocker}`)
    }
  }
  lines.push('')
  lines.push('## SmartScreen')
  lines.push('')
  lines.push(`- Status: ${report.smartScreen.status}`)
  lines.push(`- Claim: ${report.smartScreen.claim}`)
  lines.push('')
  lines.push('## Next Actions')
  lines.push('')
  for (const action of report.nextActions) lines.push(`- ${action}`)
  lines.push('')
  return `${lines.join('\n')}\n`
}

const writeText = ({ outputPath, content, fsImpl = fs }) => {
  const absolutePath = path.resolve(outputPath)
  fsImpl.mkdirSync(path.dirname(absolutePath), { recursive: true })
  fsImpl.writeFileSync(absolutePath, content)
  return absolutePath
}

const loadManifest = ({ options, fsImpl = fs, now = () => new Date() }) => {
  if (options.manifestPath) {
    return JSON.parse(fsImpl.readFileSync(path.resolve(options.manifestPath), 'utf-8'))
  }
  return createReleaseEvidenceArchiveManifest({
    archiveDir: options.archiveDir,
    windowsSmokeReportPath: options.windowsSmokeReportPath,
    windowsSmokeArchiveManifestPath: options.windowsSmokeArchiveManifestPath,
    desktopPickerReportPath: options.desktopPickerReportPath,
    desktopPickerArchiveManifestPath: options.desktopPickerArchiveManifestPath,
    packagedRuntimeReportPath: options.packagedRuntimeReportPath,
    macosCodesignPath: options.macosCodesignPath,
    macosNotarizationPath: options.macosNotarizationPath,
    macosGatekeeperPath: options.macosGatekeeperPath,
    outputPath: options.manifestOutput || null,
    requireSigned: true,
    now,
    fsImpl
  })
}

const defaultOutputPath = (options) => path.join(path.resolve(options.archiveDir), 'signed-release-closure-report.md')

const runSignedReleaseClosureReport = ({ options, fsImpl = fs, now = () => new Date() }) => {
  const manifest = loadManifest({ options, fsImpl, now })
  if (options.manifestOutput && !options.manifestPath) {
    writeManifest({ manifest, outputPath: resolveArchivePaths({ archiveDir: options.archiveDir, outputPath: options.manifestOutput }).outputPath, fsImpl })
  }
  const report = createSignedReleaseClosureReport({ manifest, now })
  const outputPath = options.outputPath || defaultOutputPath(options)
  const writtenMarkdown = writeText({ outputPath, content: renderMarkdown(report), fsImpl })
  const writtenJson = options.jsonOutputPath
    ? writeText({ outputPath: options.jsonOutputPath, content: `${JSON.stringify(report, null, 2)}\n`, fsImpl })
    : ''
  return { manifest, report, outputPath: writtenMarkdown, jsonOutputPath: writtenJson }
}

const main = () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }
  const result = runSignedReleaseClosureReport({ options })
  if (options.json) {
    console.log(JSON.stringify(result.report, null, 2))
  } else {
    console.log(`Signed release closure report: ${result.outputPath}`)
    if (result.jsonOutputPath) console.log(`Signed release closure JSON: ${result.jsonOutputPath}`)
    console.log(`Release-ready: ${result.report.releaseReady ? 'yes' : 'no'}`)
  }
  if (options.failOnNotReady && !result.report.releaseReady) process.exit(1)
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
  createSignedReleaseClosureReport,
  parseArgs,
  renderMarkdown,
  runSignedReleaseClosureReport
}
