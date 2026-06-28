const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  applyDesktopPickerEvidence,
  createRuntimeCheckEvidence,
  createRuntimeSmokeSession,
  loadDesktopPickerSmokeReport,
  mergeRuntimeEvidenceIntoReport
} = require('../../scripts/run-packaged-runtime-smoke')
const { createPackagedRuntimeSmokeReport } = require('../../scripts/create-packaged-runtime-smoke-report')
const { createDesktopPickerSmokeReport } = require('../../scripts/create-desktop-picker-smoke-report')
const { validateReport } = require('../../scripts/validate-packaged-runtime-smoke-report')

const createReleaseDir = () => {
  const releaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-packaged-runtime-capture-'))
  fs.mkdirSync(path.join(releaseDir, 'mac-arm64', 'OpenPet.app'), { recursive: true })
  fs.writeFileSync(path.join(releaseDir, 'OpenPet-1.0.1-rc.2-mac.zip'), 'mac zip')
  return releaseDir
}

const createBaseReport = () => createPackagedRuntimeSmokeReport({
  releaseDir: createReleaseDir(),
  platform: 'darwin',
  arch: 'arm64',
  allowAnyPlatform: true,
  execFile: () => 'code object is not signed at all',
  now: () => new Date('2026-06-16T00:00:00.000Z')
})

const markDesktopPickerReportReady = (report) => ({
  ...report,
  checks: report.checks.map((check) => ({
    ...check,
    status: 'pass',
    evidence: `Verified ${check.id} in packaged app`,
    notes: ''
  }))
})

const createBubbleChatEvidence = (text = 'smoke', screenshotPath = '/tmp/evidence/screenshots/runtime-bubble.png') => ({
  visible: true,
  hasWindow: true,
  text,
  source: 'packaged-runtime-smoke',
  screenshotPath,
  items: [{ kind: 'notice', role: 'system', source: 'packaged-runtime-smoke', text }],
  noticeCount: 1,
  dialogueCount: 0
})

test('mergeRuntimeEvidenceIntoReport marks automated runtime checks pass and keeps picker checks pending', () => {
  const report = createBaseReport()
  const evidence = createRuntimeCheckEvidence({
    sessionId: 'session-1',
    appPath: '/tmp/release/mac-arm64/OpenPet.app',
    screenshotPath: '/tmp/evidence/screenshots/runtime.png',
    state: {
      launch: { ok: true, pid: 1234 },
      window: { ok: true, bounds: { width: 300, height: 300 }, visible: true, transparent: true },
      renderer: {
        ok: true,
        bodyBackground: 'rgba(0, 0, 0, 0)',
        htmlBackground: 'rgba(0, 0, 0, 0)',
        transparentBackground: true,
        sprite: { visible: true, width: 128, height: 128, backgroundImage: 'url(file:///sprite.png)' },
        legacyInlineBubble: { present: true, visible: false, text: '' },
        bubbleChat: createBubbleChatEvidence(),
        action: { requested: 'idle', current: 'idle', advanced: true }
      },
      packs: [
        { id: 'legacy-cat', ok: true, actionCount: 1, spriteVisible: true },
        { id: 'doro', ok: true, actionCount: 1, spriteVisible: true },
        { id: 'duodong', ok: true, actionCount: 1, spriteVisible: true },
        { id: 'chispa', ok: true, actionCount: 1, spriteVisible: true }
      ],
      invalidPackage: { status: 'blocked', notes: 'Native picker invalid-package path requires a paired desktop picker report.' },
      finalState: { ok: true, activePackId: 'legacy-cat' }
    }
  })

  const merged = mergeRuntimeEvidenceIntoReport(report, evidence)
  const checks = Object.fromEntries(merged.checks.map((check) => [check.id, check]))

  assert.equal(checks['packaged-launch'].status, 'pass')
  assert.match(checks['packaged-launch'].evidence, /pid 1234/)
  assert.equal(checks['sprite-visible'].status, 'pass')
  assert.match(checks['sprite-visible'].evidence, /runtime\.png/)
  assert.match(checks['speech-bubble-rendered'].evidence, /"kind":"notice"/)
  assert.match(checks['speech-bubble-rendered'].evidence, /bubbleScreenshot=\/tmp\/evidence\/screenshots\/runtime-bubble\.png/)
  assert.equal(checks['pack-switch-doro'].status, 'pass')
  assert.equal(checks['plugin-picker-evidence-linked'].status, 'pending')
  assert.match(checks['plugin-picker-evidence-linked'].notes, /desktop picker smoke report/)
  assert.equal(checks['pet-picker-evidence-linked'].status, 'pending')
  assert.equal(checks['invalid-package-feedback'].status, 'blocked')
  assert.equal(merged.linkedEvidence.screenshots.includes('/tmp/evidence/screenshots/runtime.png'), true)
  assert.equal(merged.linkedEvidence.screenshots.includes('/tmp/evidence/screenshots/runtime-bubble.png'), true)

  const structural = validateReport(merged, { allowPending: true })
  assert.equal(structural.ok, true)
  const readiness = validateReport(merged)
  assert.equal(readiness.ok, false)
  assert.match(readiness.errors.join('\n'), /plugin-picker-evidence-linked must pass/)
})

test('mergeRuntimeEvidenceIntoReport can produce a ready runtime report when picker evidence is linked', () => {
  const report = createBaseReport()
  const evidence = createRuntimeCheckEvidence({
    sessionId: 'session-2',
    appPath: '/tmp/release/mac-arm64/OpenPet.app',
    screenshotPath: '/tmp/evidence/screenshots/runtime.png',
    desktopPickerSmokeReport: '/tmp/evidence/desktop-picker-smoke-report.json',
    state: {
      launch: { ok: true, pid: 5678 },
      window: { ok: true, bounds: { width: 300, height: 300 }, visible: true, transparent: true },
      renderer: {
        ok: true,
        bodyBackground: 'transparent',
        htmlBackground: 'transparent',
        transparentBackground: true,
        sprite: { visible: true, width: 128, height: 128, backgroundImage: 'url(file:///sprite.png)' },
        legacyInlineBubble: { present: true, visible: false, text: '' },
        bubbleChat: createBubbleChatEvidence(),
        action: { requested: 'idle', current: 'idle', advanced: true }
      },
      packs: ['legacy-cat', 'doro', 'duodong', 'chispa'].map((id) => ({ id, ok: true, actionCount: 1, spriteVisible: true })),
      pluginPicker: { status: 'pass', evidence: 'desktop picker report passed plugin zip picker checks' },
      petPicker: { status: 'pass', evidence: 'desktop picker report passed pet pack picker checks' },
      invalidPackage: { status: 'pass', evidence: 'desktop picker report passed invalid-package feedback check' },
      finalState: { ok: true, activePackId: 'legacy-cat' }
    }
  })

  const merged = mergeRuntimeEvidenceIntoReport(report, evidence)
  const readiness = validateReport(merged)

  assert.equal(readiness.ok, true)
  assert.equal(readiness.summary.smokeReady, true)
  assert.equal(merged.linkedEvidence.desktopPickerSmokeReport, '/tmp/evidence/desktop-picker-smoke-report.json')
})

test('runPackagedRuntimeSmoke merges evidence into a report file', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-packaged-runtime-run-'))
  const releaseDir = createReleaseDir()
  const reportPath = path.join(tempDir, 'packaged-runtime-smoke-report.json')
  const sessionDir = path.join(tempDir, '2026-06-16T03-00-00-000Z-darwin-arm64')
  const evidencePath = path.join(sessionDir, 'packaged-runtime-smoke-evidence.json')
  const appPath = path.join(releaseDir, 'mac-arm64', 'OpenPet.app')
  const executablePath = path.join(appPath, 'Contents', 'MacOS', 'OpenPet')
  const fakeSpawn = () => ({ pid: 4321, kill: () => {} })
  fs.mkdirSync(path.dirname(executablePath), { recursive: true })
  fs.writeFileSync(executablePath, '#!/bin/sh\n')
  fs.mkdirSync(sessionDir, { recursive: true })
  const pickerReportPath = path.join(tempDir, 'desktop-picker-smoke-report.json')
  const pickerReport = markDesktopPickerReportReady(createDesktopPickerSmokeReport({
    releaseDir,
    platform: 'darwin',
    arch: 'arm64',
    allowAnyPlatform: true,
    execFile: () => 'code object is not signed at all',
    now: () => new Date('2026-06-16T03:00:00.000Z')
  }))
  fs.writeFileSync(pickerReportPath, JSON.stringify(pickerReport, null, 2))
  fs.writeFileSync(evidencePath, JSON.stringify({
    schemaVersion: 1,
    sessionId: 'session-3',
    appPath,
    screenshotPath: path.join(tempDir, 'screenshots', 'runtime.png'),
    state: {
      launch: { ok: true, pid: 4321 },
      window: { ok: true, visible: true, transparent: true, bounds: { width: 300, height: 300 } },
      renderer: {
        ok: true,
        bodyBackground: 'transparent',
        htmlBackground: 'transparent',
        transparentBackground: true,
        sprite: { visible: true, width: 96, height: 96, backgroundImage: 'url(file:///sprite.png)' },
        legacyInlineBubble: { present: true, visible: false, text: '' },
        bubbleChat: createBubbleChatEvidence(),
        action: { requested: 'idle', current: 'idle', advanced: true }
      },
      packs: ['legacy-cat', 'doro', 'duodong', 'chispa'].map((id) => ({ id, ok: true, actionCount: 1, defaultAction: 'idle', spriteVisible: true })),
      finalState: { ok: true, activePackId: 'legacy-cat' }
    }
  }, null, 2))

  const result = await require('../../scripts/run-packaged-runtime-smoke').runPackagedRuntimeSmoke({
    appPath,
    releaseDir,
    outputDir: tempDir,
    reportOutput: reportPath,
    desktopPickerSmokeReport: pickerReportPath,
    timeoutMs: 100,
    spawnImpl: fakeSpawn,
    now: () => new Date('2026-06-16T03:00:00.000Z')
  })

  const written = JSON.parse(fs.readFileSync(result.reportPath, 'utf-8'))
  assert.equal(result.validation.ok, true)
  assert.equal(written.checks.find((check) => check.id === 'packaged-launch').status, 'pass')
  assert.equal(written.linkedEvidence.desktopPickerSmokeReport, pickerReportPath)
  assert.match(written.checks.find((check) => check.id === 'sprite-visible').evidence, /runtime\.png/)
  assert.equal(written.checks.find((check) => check.id === 'invalid-package-feedback').status, 'pass')
  assert.match(written.checks.find((check) => check.id === 'invalid-package-feedback').evidence, /invalid-package-feedback/)
})

test('createRuntimeSmokeSession writes launch environment without mutating the packaged app', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-runtime-session-'))
  const session = createRuntimeSmokeSession({
    appPath: '/tmp/release/mac-arm64/OpenPet.app',
    outputDir: tempDir,
    platform: 'darwin',
    arch: 'arm64',
    now: () => new Date('2026-06-16T01:02:03.000Z')
  })

  assert.equal(session.sessionId, '2026-06-16T01-02-03-000Z-darwin-arm64')
  assert.equal(session.evidencePath.endsWith('packaged-runtime-smoke-evidence.json'), true)
  assert.equal(session.screenshotPath.endsWith(path.join('screenshots', 'packaged-runtime.png')), true)
  assert.equal(session.env.OPENPET_PACKAGED_RUNTIME_SMOKE, '1')
  assert.equal(session.env.OPENPET_PACKAGED_RUNTIME_SMOKE_OUTPUT, session.evidencePath)
  assert.equal(session.env.OPENPET_PACKAGED_RUNTIME_SMOKE_SCREENSHOT, session.screenshotPath)
  assert.equal(session.env.OPENPET_PACKAGED_RUNTIME_SMOKE_BUBBLE_SCREENSHOT, session.bubbleScreenshotPath)
})

test('mergeRuntimeEvidenceIntoReport fails transparent background without renderer evidence', () => {
  const report = createBaseReport()
  const evidence = createRuntimeCheckEvidence({
    sessionId: 'session-transparent-regression',
    appPath: '/tmp/release/mac-arm64/OpenPet.app',
    state: {
      launch: { ok: true, pid: 1234 },
      window: { ok: true, bounds: { width: 300, height: 300 }, visible: true, transparent: true },
      renderer: {
        ok: true,
        bodyBackground: 'rgb(255, 255, 255)',
        htmlBackground: 'transparent',
        transparentBackground: false,
        sprite: { visible: true, width: 128, height: 128, backgroundImage: 'url(file:///sprite.png)' },
        legacyInlineBubble: { present: true, visible: false, text: '' },
        bubbleChat: createBubbleChatEvidence(),
        action: { requested: 'idle', current: 'idle', advanced: true }
      },
      packs: ['legacy-cat', 'doro', 'duodong', 'chispa'].map((id) => ({ id, ok: true, actionCount: 1, spriteVisible: true })),
      finalState: { ok: true, activePackId: 'legacy-cat' }
    }
  })

  const merged = mergeRuntimeEvidenceIntoReport(report, evidence)
  const check = merged.checks.find((item) => item.id === 'transparent-background')

  assert.equal(check.status, 'fail')
  assert.match(check.notes, /renderer background evidence/)
})

test('mergeRuntimeEvidenceIntoReport fails action playback without frame advancement', () => {
  const report = createBaseReport()
  const evidence = createRuntimeCheckEvidence({
    sessionId: 'session-action-regression',
    appPath: '/tmp/release/mac-arm64/OpenPet.app',
    state: {
      launch: { ok: true, pid: 1234 },
      window: { ok: true, bounds: { width: 300, height: 300 }, visible: true, transparent: true },
      renderer: {
        ok: true,
        bodyBackground: 'transparent',
        htmlBackground: 'transparent',
        transparentBackground: true,
        sprite: { visible: true, width: 128, height: 128, backgroundImage: 'url(file:///sprite.png)' },
        legacyInlineBubble: { present: true, visible: false, text: '' },
        bubbleChat: createBubbleChatEvidence(),
        action: { requested: 'idle', current: 'idle', advanced: false }
      },
      packs: ['legacy-cat', 'doro', 'duodong', 'chispa'].map((id) => ({ id, ok: true, actionCount: 1, spriteVisible: true })),
      finalState: { ok: true, activePackId: 'legacy-cat' }
    }
  })

  const merged = mergeRuntimeEvidenceIntoReport(report, evidence)
  const check = merged.checks.find((item) => item.id === 'default-action-playback')

  assert.equal(check.status, 'fail')
  assert.match(check.notes, /frame advancement/)
})

test('mergeRuntimeEvidenceIntoReport fails speech bubble check when popup has no rendered items', () => {
  const report = createBaseReport()
  const evidence = createRuntimeCheckEvidence({
    sessionId: 'session-bubble-items-regression',
    appPath: '/tmp/release/mac-arm64/OpenPet.app',
    state: {
      launch: { ok: true, pid: 1234 },
      window: { ok: true, bounds: { width: 300, height: 300 }, visible: true, transparent: true },
      renderer: {
        ok: true,
        bodyBackground: 'transparent',
        htmlBackground: 'transparent',
        transparentBackground: true,
        sprite: { visible: true, width: 128, height: 128, backgroundImage: 'url(file:///sprite.png)' },
        legacyInlineBubble: { present: true, visible: false, text: '' },
        bubbleChat: { visible: true, hasWindow: true, text: 'smoke', source: 'packaged-runtime-smoke', screenshotPath: '/tmp/evidence/screenshots/runtime-bubble.png', items: [] },
        action: { requested: 'idle', current: 'idle', advanced: true }
      },
      packs: ['legacy-cat', 'doro', 'duodong', 'chispa'].map((id) => ({ id, ok: true, actionCount: 1, spriteVisible: true })),
      finalState: { ok: true, activePackId: 'legacy-cat' }
    }
  })

  const merged = mergeRuntimeEvidenceIntoReport(report, evidence)
  const check = merged.checks.find((item) => item.id === 'speech-bubble-rendered')

  assert.equal(check.status, 'fail')
  assert.match(check.notes, /missing rendered items/)
})

test('loadDesktopPickerSmokeReport rejects missing or pending picker reports', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-picker-link-'))
  const missingPath = path.join(tempDir, 'missing.json')
  assert.throws(() => loadDesktopPickerSmokeReport(missingPath), /not found/)

  const releaseDir = createReleaseDir()
  const pendingReport = createDesktopPickerSmokeReport({
    releaseDir,
    platform: 'darwin',
    arch: 'arm64',
    allowAnyPlatform: true,
    execFile: () => 'code object is not signed at all',
    now: () => new Date('2026-06-16T04:00:00.000Z')
  })
  const pendingPath = path.join(tempDir, 'pending-picker.json')
  fs.writeFileSync(pendingPath, JSON.stringify(pendingReport, null, 2))

  assert.throws(() => loadDesktopPickerSmokeReport(pendingPath), /not ready/)
})

test('applyDesktopPickerEvidence maps ready picker checks to runtime evidence', () => {
  const pickerReport = markDesktopPickerReportReady(createDesktopPickerSmokeReport({
    releaseDir: createReleaseDir(),
    platform: 'darwin',
    arch: 'arm64',
    allowAnyPlatform: true,
    execFile: () => 'code object is not signed at all',
    now: () => new Date('2026-06-16T05:00:00.000Z')
  }))
  const runtimeEvidence = createRuntimeCheckEvidence({
    sessionId: 'session-picker-map',
    state: { invalidPackage: { status: 'blocked', notes: 'pending picker evidence' } }
  })

  const mapped = applyDesktopPickerEvidence(runtimeEvidence, {
    absolutePath: '/tmp/desktop-picker-smoke-report.json',
    report: pickerReport
  })

  assert.equal(mapped.desktopPickerSmokeReport, '/tmp/desktop-picker-smoke-report.json')
  assert.equal(mapped.state.pluginPicker.status, 'pass')
  assert.match(mapped.state.pluginPicker.evidence, /plugin-picker-cancel/)
  assert.equal(mapped.state.petPicker.status, 'pass')
  assert.match(mapped.state.petPicker.evidence, /pet-pack-picker-cancel/)
  assert.equal(mapped.state.invalidPackage.status, 'pass')
  assert.match(mapped.state.invalidPackage.evidence, /invalid-package-feedback/)
})
