const test = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createDesktopPickerSmokeReport } = require('../../scripts/create-desktop-picker-smoke-report')
const { createRunbook } = require('../../scripts/create-desktop-picker-smoke-runbook')
const {
  updateReport,
  validateUpdatedReport,
  writeReport: writePickerReport
} = require('../../scripts/update-desktop-picker-smoke-report')
const { REQUIRED_CHECKS: PICKER_CHECKS } = require('../../scripts/validate-desktop-picker-smoke-report')
const {
  createDesktopPickerEvidenceSummary,
  writeSummary
} = require('../../scripts/create-desktop-picker-evidence-summary')
const {
  createDesktopPickerArchiveManifest,
  writeManifest: writePickerArchiveManifest
} = require('../../scripts/create-desktop-picker-archive-manifest')
const {
  createRuntimeCheckEvidence,
  createRuntimeSmokeSession,
  applyDesktopPickerEvidence,
  loadDesktopPickerSmokeReport,
  mergeRuntimeEvidenceIntoReport
} = require('../../scripts/run-packaged-runtime-smoke')
const {
  BUILT_IN_PACKS,
  validateReport: validateRuntimeReport
} = require('../../scripts/validate-packaged-runtime-smoke-report')
const {
  createPackagedRuntimeSmokeReport,
  writeReport: writeRuntimeReport
} = require('../../scripts/create-packaged-runtime-smoke-report')
const {
  createWindowsSmokeReport,
  writeReport: writeWindowsSmokeReport
} = require('../../scripts/create-windows-smoke-report')
const { createRunbook: createWindowsSmokeRunbook } = require('../../scripts/create-windows-smoke-runbook')
const {
  updateReport: updateWindowsSmokeReport,
  validateUpdatedReport: validateWindowsSmokeReport
} = require('../../scripts/update-windows-smoke-report')
const { REQUIRED_CHECKS: WINDOWS_CHECKS } = require('../../scripts/validate-windows-smoke-report')
const {
  createWindowsSmokeEvidenceSummary,
  writeSummary: writeWindowsSmokeEvidenceSummary
} = require('../../scripts/create-windows-smoke-evidence-summary')
const {
  createManualChecklist: createWindowsManualChecklist,
  createCommandNotes: createWindowsCommandNotes
} = require('../../scripts/create-windows-smoke-collector')
const {
  createWindowsSmokeArchiveManifest,
  writeManifest: writeWindowsSmokeArchiveManifest
} = require('../../scripts/create-windows-smoke-archive-manifest')
const {
  createMacosReleaseEvidenceArchive
} = require('../../scripts/create-macos-release-evidence-archive')
const {
  createReleaseEvidenceArchiveManifest
} = require('../../scripts/create-release-evidence-archive-manifest')
const {
  createSignedReleaseClosureReport
} = require('../../scripts/create-signed-release-closure-report')

const signedCodesignOutput = () => 'OpenPet.app: valid on disk\nOpenPet.app: satisfies its Designated Requirement\n'
const signedAuthenticodeOutput = () => 'SignerCertificate : OpenPet\nStatus : Valid\n'
const fixedNow = () => new Date('2026-07-06T06:00:00.000Z')
const runScript = (scriptPath, args) => spawnSync(process.execPath, [scriptPath, ...args], {
  encoding: 'utf-8'
})

const createReleaseDir = () => {
  const releaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-mock-release-'))
  fs.mkdirSync(path.join(releaseDir, 'mac-arm64', 'OpenPet.app'), { recursive: true })
  fs.writeFileSync(path.join(releaseDir, 'OpenPet-9.9.9-mac.dmg'), 'dmg')
  fs.writeFileSync(path.join(releaseDir, 'OpenPet-9.9.9-mac.zip'), 'zip')
  fs.writeFileSync(path.join(releaseDir, 'latest-mac.yml'), 'path: OpenPet-9.9.9-mac.zip\n')
  fs.writeFileSync(path.join(releaseDir, 'OpenPet-9.9.9-win32-x64.exe'), 'installer')
  fs.writeFileSync(path.join(releaseDir, 'OpenPet-9.9.9-win32-x64.zip'), 'zip')
  fs.writeFileSync(path.join(releaseDir, 'OpenPet-9.9.9-win32-x64.exe.blockmap'), 'blockmap')
  fs.writeFileSync(path.join(releaseDir, 'latest.yml'), 'path: OpenPet-9.9.9-win32-x64.exe\n')
  return releaseDir
}

const applySignedArtifactState = (report, platform) => {
  report.artifact.signed = true
  if (platform === 'darwin') {
    report.artifact.signatureStatus = 'Valid'
    report.artifact.signatureEvidence = signedCodesignOutput()
  } else {
    report.artifact.authenticodeStatus = 'Valid'
    report.artifact.authenticodeEvidence = signedAuthenticodeOutput()
    report.artifact.signatureEvidence = signedAuthenticodeOutput()
  }
  return report
}

const createPickerEvidenceDir = (archiveDir, platform) => {
  const evidenceDir = path.join(archiveDir, 'desktop-picker-evidence')
  fs.mkdirSync(evidenceDir, { recursive: true })
  fs.writeFileSync(path.join(evidenceDir, 'environment.txt'), `CollectedAt: 2026-07-06T06:00:00.000Z\nPlatform: ${platform}\n`)
  fs.writeFileSync(path.join(evidenceDir, 'manual-checks.md'), '# Manual Checks\n- all mock picker checks reviewed\n')
  fs.writeFileSync(path.join(evidenceDir, 'notes.txt'), 'Synthetic picker evidence for archive validation.\n')
  fs.writeFileSync(path.join(evidenceDir, 'plugin-review.txt'), 'Mock plugin review panel evidence.\n')
  fs.writeFileSync(path.join(evidenceDir, 'invalid-package.txt'), 'Mock invalid package dialog evidence.\n')
  if (platform === 'darwin') {
    fs.writeFileSync(path.join(evidenceDir, 'signature.txt'), signedCodesignOutput())
  } else {
    fs.writeFileSync(path.join(evidenceDir, 'authenticode.txt'), signedAuthenticodeOutput())
  }
  return evidenceDir
}

const createReadyPickerArchive = ({
  platform = 'darwin',
  arch = platform === 'darwin' ? 'arm64' : 'x64',
  releaseDir = createReleaseDir(),
  archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-picker-archive-'))
} = {}) => {
  fs.mkdirSync(archiveDir, { recursive: true })
  const reportPath = path.join(archiveDir, 'desktop-picker-smoke-report.json')

  const pendingReport = createDesktopPickerSmokeReport({
    releaseDir,
    platform,
    arch,
    allowAnyPlatform: true,
    execFile: signedCodesignOutput,
    hostname: () => `mock-picker-host-${platform}`,
    now: fixedNow
  })

  const runbook = createRunbook({
    report: pendingReport,
    reportPath,
    generatedAt: fixedNow()
  })
  fs.writeFileSync(path.join(archiveDir, 'desktop-picker-smoke-runbook.md'), `${runbook}\n`)

  const readyReport = PICKER_CHECKS.reduce((report, check, index) => updateReport(report, {
    envUpdates: index === 0 ? [
      { key: 'runner', value: 'mock desktop picker flow' },
      { key: 'evidence', value: 'docs/release-evidence/mock-picker-flow.md' }
    ] : [],
    fixtureUpdates: index === 0 ? [
      { key: 'pluginPackage', value: '/tmp/fixtures/focus-timer.openpet-plugin.zip' },
      { key: 'frameFolder', value: '/tmp/fixtures/wave-frames' },
      { key: 'petPack', value: '/tmp/fixtures/doro.pet-pack' }
    ] : [],
    checkId: check.id,
    status: 'pass',
    evidence: `Mock evidence for ${check.id}`,
    notes: ''
  }), pendingReport)

  applySignedArtifactState(readyReport, platform)
  const readyValidation = validateUpdatedReport(readyReport, {
    validateReady: true,
    requireSigned: true
  })
  assert.equal(readyValidation.ok, true)
  writePickerReport({ report: readyReport, outputPath: reportPath })

  const evidenceDir = createPickerEvidenceDir(archiveDir, platform)
  const summary = createDesktopPickerEvidenceSummary({
    evidenceDir,
    reportPath,
    requireSigned: true,
    now: fixedNow
  })
  assert.equal(summary.releaseReady, true)
  writeSummary({
    summary,
    outputPath: path.join(archiveDir, 'desktop-picker-evidence-summary.md')
  })

  const manifest = createDesktopPickerArchiveManifest({
    archiveDir,
    requireSigned: true,
    now: fixedNow
  })
  assert.equal(manifest.ok, true)
  assert.equal(manifest.releaseReady, true)
  writePickerArchiveManifest({
    manifest,
    outputPath: path.join(archiveDir, 'desktop-picker-archive-manifest.json')
  })

  return {
    archiveDir,
    releaseDir,
    reportPath,
    platform,
    arch
  }
}

const createReadyWindowsSmokeArchive = ({
  releaseDir = createReleaseDir(),
  archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-windows-smoke-archive-'))
} = {}) => {
  fs.mkdirSync(archiveDir, { recursive: true })
  const reportPath = path.join(archiveDir, 'windows-smoke-report.json')
  const pendingReport = createWindowsSmokeReport({
    releaseDir,
    allowNonWindows: true,
    now: fixedNow
  })

  const readyReport = WINDOWS_CHECKS.reduce((report, check, index) => updateWindowsSmokeReport(report, {
    envUpdates: index === 0 ? [
      { key: 'windowsVersion', value: 'Windows 11 23H2' },
      { key: 'machine', value: 'mock windows smoke vm' },
      { key: 'runner', value: 'mock windows smoke flow' },
      { key: 'evidence', value: 'docs/release-evidence/mock-windows-smoke-flow.md' }
    ] : [],
    artifactUpdates: index === 0 ? [
      { key: 'signed', value: 'true' },
      { key: 'authenticodeStatus', value: 'Valid' },
      { key: 'authenticodeEvidence', value: signedAuthenticodeOutput() }
    ] : [],
    checkId: check.id,
    status: 'pass',
    evidence: `Mock Windows evidence for ${check.id}`,
    notes: ''
  }), pendingReport)

  const readyValidation = validateWindowsSmokeReport(readyReport, {
    validateReady: true,
    requireSigned: true
  })
  assert.equal(readyValidation.ok, true)
  writeWindowsSmokeReport({ report: readyReport, outputPath: reportPath })

  const runbook = createWindowsSmokeRunbook({
    report: readyReport,
    reportPath,
    generatedAt: fixedNow()
  })
  fs.writeFileSync(path.join(archiveDir, 'windows-smoke-runbook.md'), `${runbook}\n`)
  fs.writeFileSync(path.join(archiveDir, 'windows-smoke-collector.ps1'), 'Write-Output "mock collector"\n')

  const evidenceDir = path.join(archiveDir, 'windows-smoke-evidence')
  fs.mkdirSync(evidenceDir, { recursive: true })
  fs.writeFileSync(path.join(evidenceDir, 'environment.txt'), 'CollectedAt: 2026-07-06T06:00:00.000Z\nPlatform: win32\n')
  fs.writeFileSync(path.join(evidenceDir, 'process.txt'), 'OpenPet.exe running\n')
  fs.writeFileSync(path.join(evidenceDir, 'install-registry.txt'), 'OpenPet uninstall key present\n')
  fs.writeFileSync(path.join(evidenceDir, 'manual-checks.md'), createWindowsManualChecklist())
  fs.writeFileSync(path.join(evidenceDir, 'update-report-commands.md'), createWindowsCommandNotes({ reportFileName: 'windows-smoke-report.json' }))
  fs.writeFileSync(path.join(evidenceDir, 'authenticode.txt'), signedAuthenticodeOutput())

  const summary = createWindowsSmokeEvidenceSummary({
    evidenceDir,
    reportPath,
    requireSigned: true,
    now: fixedNow
  })
  assert.equal(summary.releaseReady, true)
  writeWindowsSmokeEvidenceSummary({
    summary,
    outputPath: path.join(archiveDir, 'windows-smoke-evidence-summary.md')
  })

  const manifest = createWindowsSmokeArchiveManifest({
    archiveDir,
    requireSigned: true,
    now: fixedNow
  })
  assert.equal(manifest.ok, true)
  assert.equal(manifest.releaseReady, true)
  writeWindowsSmokeArchiveManifest({
    manifest,
    outputPath: path.join(archiveDir, 'windows-smoke-archive-manifest.json')
  })

  return {
    archiveDir,
    releaseDir,
    reportPath
  }
}

const createMacosArtifactDir = () => {
  const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-macos-release-artifact-'))
  fs.writeFileSync(path.join(artifactDir, 'macos-codesign.txt'), signedCodesignOutput())
  fs.writeFileSync(path.join(artifactDir, 'macos-notarization.txt'), 'status: Accepted\nid: mock-notary-request\n')
  fs.writeFileSync(path.join(artifactDir, 'macos-gatekeeper.txt'), 'release/mac-arm64/OpenPet.app: accepted\nsource=Notarized Developer ID\n')
  return artifactDir
}

const createMacosSourceEvidenceDir = () => {
  const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-macos-release-sources-'))
  fs.writeFileSync(path.join(sourceDir, 'source-codesign.txt'), signedCodesignOutput())
  fs.writeFileSync(path.join(sourceDir, 'source-notarization.txt'), 'status: Accepted\nid: mock-notary-request\n')
  fs.writeFileSync(path.join(sourceDir, 'source-gatekeeper.txt'), 'release/mac-arm64/OpenPet.app: accepted\nsource=Notarized Developer ID\n')
  return sourceDir
}

const createRuntimeState = ({ bubbleScreenshotPath }) => ({
  launch: { ok: true, pid: 4242 },
  window: {
    ok: true,
    visible: true,
    transparent: true,
    bounds: { width: 320, height: 320 }
  },
  renderer: {
    ok: true,
    bodyBackground: 'transparent',
    htmlBackground: 'transparent',
    transparentBackground: true,
    sprite: {
      visible: true,
      width: 128,
      height: 128,
      backgroundImage: 'url(file:///tmp/mock-sprite.png)'
    },
    legacyInlineBubble: {
      present: true,
      visible: false,
      text: ''
    },
    bubbleChat: {
      visible: true,
      hasWindow: true,
      text: 'mock smoke passed',
      source: 'packaged-runtime-smoke',
      screenshotPath: bubbleScreenshotPath,
      items: [{ kind: 'notice', role: 'system', text: 'mock smoke passed' }],
      noticeCount: 1,
      dialogueCount: 0
    },
    action: {
      requested: 'idle',
      current: 'idle',
      advanced: true
    }
  },
  packs: BUILT_IN_PACKS.map((id) => ({
    id,
    ok: true,
    actionCount: 1,
    defaultAction: 'idle',
    spriteVisible: true
  })),
  finalState: {
    ok: true,
    activePackId: 'legacy-cat'
  }
})

test('mock darwin desktop picker flow reaches a signed ready archive from a generated pending report', () => {
  const { archiveDir, reportPath } = createReadyPickerArchive({ platform: 'darwin', arch: 'arm64' })
  const writtenReport = JSON.parse(fs.readFileSync(reportPath, 'utf-8'))
  const writtenManifest = JSON.parse(fs.readFileSync(path.join(archiveDir, 'desktop-picker-archive-manifest.json'), 'utf-8'))

  assert.equal(writtenReport.checks.every((check) => check.status === 'pass'), true)
  assert.equal(writtenReport.fixture.pluginPackage, 'focus-timer.openpet-plugin.zip')
  assert.equal(writtenReport.fixture.frameFolder, 'wave-frames')
  assert.equal(writtenReport.fixture.petPack, 'doro.pet-pack')
  assert.equal(writtenManifest.releaseReady, true)
  assert.equal(writtenManifest.summary.matchesComputedSummary, true)
})

test('mock win32 desktop picker flow reaches a signed ready archive from a generated pending report', () => {
  const { archiveDir, reportPath } = createReadyPickerArchive({ platform: 'win32', arch: 'x64' })
  const writtenReport = JSON.parse(fs.readFileSync(reportPath, 'utf-8'))
  const writtenManifest = JSON.parse(fs.readFileSync(path.join(archiveDir, 'desktop-picker-archive-manifest.json'), 'utf-8'))

  assert.equal(writtenReport.platform, 'win32')
  assert.equal(writtenReport.artifact.signed, true)
  assert.equal(writtenReport.artifact.authenticodeStatus, 'Valid')
  assert.equal(writtenReport.checks.every((check) => check.status === 'pass'), true)
  assert.equal(writtenManifest.releaseReady, true)
  assert.equal(writtenManifest.summary.matchesComputedSummary, true)
})

test('mock darwin packaged runtime flow links the ready picker archive and validates signed runtime readiness', () => {
  const { releaseDir, reportPath, platform, arch } = createReadyPickerArchive({ platform: 'darwin', arch: 'arm64' })
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-runtime-output-'))
  const runtimeReportPath = path.join(outputDir, 'packaged-runtime-smoke-report.json')
  const appPath = path.join(releaseDir, 'mac-arm64', 'OpenPet.app')
  const session = createRuntimeSmokeSession({
    appPath,
    outputDir,
    platform,
    arch,
    now: fixedNow
  })

  const pickerEvidence = loadDesktopPickerSmokeReport(reportPath)
  const baseRuntimeReport = createPackagedRuntimeSmokeReport({
    releaseDir,
    platform,
    arch,
    allowAnyPlatform: true,
    execFile: signedCodesignOutput,
    hostname: () => `mock-runtime-host-${platform}`,
    now: fixedNow
  })
  const runtimeEvidence = applyDesktopPickerEvidence(createRuntimeCheckEvidence({
    sessionId: session.sessionId,
    appPath,
    screenshotPath: session.screenshotPath,
    state: createRuntimeState({ bubbleScreenshotPath: session.bubbleScreenshotPath })
  }), pickerEvidence)

  const mergedReport = mergeRuntimeEvidenceIntoReport(applySignedArtifactState(baseRuntimeReport, platform), runtimeEvidence)
  const readiness = validateRuntimeReport(mergedReport, { requireSigned: true })

  assert.equal(readiness.ok, true)
  assert.equal(readiness.summary.officialReady, true)
  assert.equal(mergedReport.linkedEvidence.desktopPickerSmokeReport, 'desktop-picker-smoke-report.json')
  assert.equal(mergedReport.linkedEvidence.screenshots.includes('packaged-runtime.png'), true)
  assert.equal(mergedReport.linkedEvidence.screenshots.includes('packaged-runtime-bubble-chat.png'), true)

  writeRuntimeReport({ report: mergedReport, outputPath: runtimeReportPath })
  const written = JSON.parse(fs.readFileSync(runtimeReportPath, 'utf-8'))
  assert.equal(written.checks.find((check) => check.id === 'plugin-picker-evidence-linked').status, 'pass')
  assert.match(
    written.checks.find((check) => check.id === 'plugin-picker-evidence-linked').evidence,
    /plugin-picker-cancel/
  )
  assert.equal(written.checks.find((check) => check.id === 'invalid-package-feedback').status, 'pass')
})

test('mock win32 packaged runtime flow links the ready picker archive and validates signed runtime readiness', () => {
  const { releaseDir, reportPath, platform, arch } = createReadyPickerArchive({ platform: 'win32', arch: 'x64' })
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-runtime-output-win32-'))
  const runtimeReportPath = path.join(outputDir, 'packaged-runtime-smoke-report.json')
  const appPath = path.join(releaseDir, 'OpenPet-9.9.9-win32-x64.exe')
  const session = createRuntimeSmokeSession({
    appPath,
    outputDir,
    platform,
    arch,
    now: fixedNow
  })

  const pickerEvidence = loadDesktopPickerSmokeReport(reportPath)
  const baseRuntimeReport = createPackagedRuntimeSmokeReport({
    releaseDir,
    platform,
    arch,
    allowAnyPlatform: true,
    hostname: () => `mock-runtime-host-${platform}`,
    now: fixedNow
  })
  const runtimeEvidence = applyDesktopPickerEvidence(createRuntimeCheckEvidence({
    sessionId: session.sessionId,
    appPath,
    screenshotPath: session.screenshotPath,
    state: createRuntimeState({ bubbleScreenshotPath: session.bubbleScreenshotPath })
  }), pickerEvidence)

  const mergedReport = mergeRuntimeEvidenceIntoReport(applySignedArtifactState(baseRuntimeReport, platform), runtimeEvidence)
  const readiness = validateRuntimeReport(mergedReport, { requireSigned: true })

  assert.equal(readiness.ok, true)
  assert.equal(readiness.summary.officialReady, true)
  assert.equal(mergedReport.platform, 'win32')
  assert.equal(mergedReport.artifact.authenticodeStatus, 'Valid')

  writeRuntimeReport({ report: mergedReport, outputPath: runtimeReportPath })
  const written = JSON.parse(fs.readFileSync(runtimeReportPath, 'utf-8'))
  assert.equal(written.checks.find((check) => check.id === 'plugin-picker-evidence-linked').status, 'pass')
  assert.equal(written.checks.find((check) => check.id === 'pet-picker-evidence-linked').status, 'pass')
  assert.equal(written.checks.find((check) => check.id === 'invalid-package-feedback').status, 'pass')
})

test('mock signed release chain turns generated pending archives into a ready closure report', () => {
  const releaseDir = createReleaseDir()
  const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-release-chain-'))
  const { reportPath: windowsSmokeReportPath } = createReadyWindowsSmokeArchive({ releaseDir, archiveDir })
  const { reportPath: desktopPickerReportPath } = createReadyPickerArchive({
    platform: 'win32',
    arch: 'x64',
    releaseDir,
    archiveDir
  })

  const runtimeSessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-runtime-chain-'))
  const runtimeReportPath = path.join(archiveDir, 'packaged-runtime-smoke-report.json')
  const appPath = path.join(releaseDir, 'mac-arm64', 'OpenPet.app')
  const session = createRuntimeSmokeSession({
    appPath,
    outputDir: runtimeSessionDir,
    platform: 'darwin',
    arch: 'arm64',
    now: fixedNow
  })
  const pickerEvidence = loadDesktopPickerSmokeReport(desktopPickerReportPath)
  const baseRuntimeReport = createPackagedRuntimeSmokeReport({
    releaseDir,
    platform: 'darwin',
    arch: 'arm64',
    allowAnyPlatform: true,
    execFile: signedCodesignOutput,
    now: fixedNow
  })
  const runtimeEvidence = applyDesktopPickerEvidence(createRuntimeCheckEvidence({
    sessionId: session.sessionId,
    appPath,
    screenshotPath: session.screenshotPath,
    state: createRuntimeState({ bubbleScreenshotPath: session.bubbleScreenshotPath })
  }), pickerEvidence)
  const mergedRuntimeReport = mergeRuntimeEvidenceIntoReport(applySignedArtifactState(baseRuntimeReport, 'darwin'), runtimeEvidence)
  const runtimeValidation = validateRuntimeReport(mergedRuntimeReport, { requireSigned: true })
  assert.equal(runtimeValidation.ok, true)
  writeRuntimeReport({ report: mergedRuntimeReport, outputPath: runtimeReportPath })

  const macosArtifactDir = createMacosArtifactDir()
  createMacosReleaseEvidenceArchive({
    artifactDir: macosArtifactDir,
    archiveDir,
    artifactName: 'openpet-macos-release-evidence-v9.9.9',
    releaseTag: 'v9.9.9',
    workflowRunUrl: 'https://github.com/dengyie/OpenPet/actions/runs/999',
    now: fixedNow
  })

  const manifest = createReleaseEvidenceArchiveManifest({
    archiveDir,
    requireSigned: true,
    now: fixedNow
  })
  const closure = createSignedReleaseClosureReport({ manifest, now: fixedNow })

  assert.equal(manifest.ok, true)
  assert.equal(manifest.releaseReady, true)
  assert.equal(manifest.reports.windowsSmoke.readinessValidation.summary.officialReady, true)
  assert.equal(manifest.reports.desktopPicker.readinessValidation.summary.officialReady, true)
  assert.equal(manifest.reports.packagedRuntime.readinessValidation.summary.officialReady, true)
  assert.equal(manifest.archives.windowsSmoke.releaseReady, true)
  assert.equal(manifest.archives.desktopPicker.releaseReady, true)
  assert.equal(manifest.archives.macosArtifact.ok, true)
  assert.equal(closure.releaseReady, true)
  assert.equal(closure.claims.officialDesktopRelease.status, 'ready')
  assert.equal(closure.claims.macos.status, 'ready')
  assert.equal(closure.claims.windows.status, 'ready')
  assert.equal(path.basename(windowsSmokeReportPath), 'windows-smoke-report.json')
})

test('mock signed release CLI flow turns synthetic signed evidence into ready archive and closure outputs', () => {
  const releaseDir = createReleaseDir()
  const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-release-cli-chain-'))
  const { reportPath: windowsSmokeReportPath } = createReadyWindowsSmokeArchive({ releaseDir, archiveDir })
  const { reportPath: desktopPickerReportPath } = createReadyPickerArchive({
    platform: 'win32',
    arch: 'x64',
    releaseDir,
    archiveDir
  })

  const runtimeSessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-runtime-cli-chain-'))
  const runtimeReportPath = path.join(archiveDir, 'packaged-runtime-smoke-report.json')
  const appPath = path.join(releaseDir, 'mac-arm64', 'OpenPet.app')
  const session = createRuntimeSmokeSession({
    appPath,
    outputDir: runtimeSessionDir,
    platform: 'darwin',
    arch: 'arm64',
    now: fixedNow
  })
  const pickerEvidence = loadDesktopPickerSmokeReport(desktopPickerReportPath)
  const baseRuntimeReport = createPackagedRuntimeSmokeReport({
    releaseDir,
    platform: 'darwin',
    arch: 'arm64',
    allowAnyPlatform: true,
    execFile: signedCodesignOutput,
    now: fixedNow
  })
  const runtimeEvidence = applyDesktopPickerEvidence(createRuntimeCheckEvidence({
    sessionId: session.sessionId,
    appPath,
    screenshotPath: session.screenshotPath,
    state: createRuntimeState({ bubbleScreenshotPath: session.bubbleScreenshotPath })
  }), pickerEvidence)
  const mergedRuntimeReport = mergeRuntimeEvidenceIntoReport(applySignedArtifactState(baseRuntimeReport, 'darwin'), runtimeEvidence)
  const runtimeValidation = validateRuntimeReport(mergedRuntimeReport, { requireSigned: true })
  assert.equal(runtimeValidation.ok, true)
  writeRuntimeReport({ report: mergedRuntimeReport, outputPath: runtimeReportPath })

  const macosSourceDir = createMacosSourceEvidenceDir()
  const macosArtifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-macos-release-cli-artifact-'))
  const macosEvidenceScript = path.resolve(__dirname, '../../scripts/create-macos-release-evidence.js')
  const macosArchiveScript = path.resolve(__dirname, '../../scripts/create-macos-release-evidence-archive.js')
  const releaseManifestScript = path.resolve(__dirname, '../../scripts/create-release-evidence-archive-manifest.js')
  const signedClosureScript = path.resolve(__dirname, '../../scripts/create-signed-release-closure-report.js')

  const macosEvidence = runScript(macosEvidenceScript, [
    '--output-dir', macosArtifactDir,
    '--codesign-source', path.join(macosSourceDir, 'source-codesign.txt'),
    '--notarization-source', path.join(macosSourceDir, 'source-notarization.txt'),
    '--gatekeeper-source', path.join(macosSourceDir, 'source-gatekeeper.txt'),
    '--skip-codesign',
    '--skip-spctl',
    '--json'
  ])

  assert.equal(macosEvidence.status, 0, macosEvidence.stderr)
  const macosEvidenceSummary = JSON.parse(macosEvidence.stdout)
  assert.equal(macosEvidenceSummary.ok, true)
  assert.equal(macosEvidenceSummary.releaseReady, true)

  const macosArchive = runScript(macosArchiveScript, [
    '--artifact-dir', macosArtifactDir,
    '--archive-dir', archiveDir,
    '--artifact-name', 'openpet-macos-release-evidence-v9.9.9',
    '--release-tag', 'v9.9.9',
    '--workflow-run-url', 'https://github.com/dengyie/OpenPet/actions/runs/999',
    '--json'
  ])

  assert.equal(macosArchive.status, 0, macosArchive.stderr)
  const macosArchiveManifest = JSON.parse(macosArchive.stdout)
  assert.equal(macosArchiveManifest.ok, true)
  assert.equal(macosArchiveManifest.source.artifactName, 'openpet-macos-release-evidence-v9.9.9')
  assert.equal(macosArchiveManifest.source.releaseTag, 'v9.9.9')
  assert.equal(macosArchiveManifest.macosEvidenceReady, true)

  const releaseManifest = runScript(releaseManifestScript, [
    '--archive-dir', archiveDir,
    '--require-signed',
    '--json'
  ])

  assert.equal(releaseManifest.status, 0, releaseManifest.stderr)
  const releaseManifestJson = JSON.parse(releaseManifest.stdout)
  assert.equal(releaseManifestJson.ok, true)
  assert.equal(releaseManifestJson.releaseReady, true)
  assert.equal(releaseManifestJson.reports.windowsSmoke.readinessValidation.summary.officialReady, true)
  assert.equal(releaseManifestJson.reports.desktopPicker.readinessValidation.summary.officialReady, true)
  assert.equal(releaseManifestJson.reports.packagedRuntime.readinessValidation.summary.officialReady, true)
  assert.equal(releaseManifestJson.archives.macosArtifact.ok, true)

  const manifestPath = path.join(archiveDir, 'release-evidence-archive-manifest.json')
  assert.equal(fs.existsSync(manifestPath), true)

  const closureJsonPath = path.join(archiveDir, 'signed-release-closure-report.json')
  const signedClosure = runScript(signedClosureScript, [
    '--archive-dir', archiveDir,
    '--manifest', manifestPath,
    '--json-output', closureJsonPath,
    '--json'
  ])

  assert.equal(signedClosure.status, 0, signedClosure.stderr)
  const signedClosureReport = JSON.parse(signedClosure.stdout)
  assert.equal(signedClosureReport.releaseReady, true)
  assert.equal(signedClosureReport.claims.officialDesktopRelease.status, 'ready')
  assert.equal(signedClosureReport.claims.macos.status, 'ready')
  assert.equal(signedClosureReport.claims.windows.status, 'ready')

  const writtenClosureJson = JSON.parse(fs.readFileSync(closureJsonPath, 'utf-8'))
  assert.equal(writtenClosureJson.releaseReady, true)
  assert.equal(fs.existsSync(path.join(archiveDir, 'signed-release-closure-report.md')), true)
  assert.equal(path.basename(windowsSmokeReportPath), 'windows-smoke-report.json')
})
