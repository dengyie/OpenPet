const { execFileSync, spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createPackagedRuntimeSmokeReport, writeReport } = require('./create-packaged-runtime-smoke-report')
const { REQUIRED_CHECKS, validateReport } = require('./validate-packaged-runtime-smoke-report')
const { validateReport: validateDesktopPickerReport } = require('./validate-desktop-picker-smoke-report')

const DEFAULT_RELEASE_DIR = path.join(__dirname, '..', 'release')
const DEFAULT_OUTPUT_DIR = path.join(__dirname, '..', 'docs', 'release-evidence', 'packaged-runtime')
const DEFAULT_TIMEOUT_MS = 30000

const usage = () => [
  'Usage: node scripts/run-packaged-runtime-smoke.js [options]',
  '',
  'Options:',
  '  --app <OpenPet.app|exe>       Packaged app to launch; defaults to artifact discovered in --release-dir',
  '  --release-dir <dir>           Release artifact directory; default release/',
  '  --output-dir <dir>            Evidence session directory',
  '  --report-output <report.json> Write merged packaged runtime report here',
  '  --desktop-picker-report <json> Link a ready desktop picker smoke report',
  '  --timeout-ms <ms>             Wait for packaged app evidence file',
  '  --allow-pending-picker        Allow picker-linked checks to remain pending or blocked',
  '  --help',
  '',
  'This launches the packaged app with OpenPet runtime-smoke environment variables, waits for',
  'main-process evidence, and merges it into the existing packaged runtime smoke report schema.'
].join('\n')

const readValue = (argv, index, flag) => {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

const parseArgs = (argv) => {
  const options = {
    appPath: '',
    releaseDir: DEFAULT_RELEASE_DIR,
    outputDir: DEFAULT_OUTPUT_DIR,
    reportOutput: '',
    desktopPickerSmokeReport: '',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    allowPendingPicker: false,
    help: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--app') {
      options.appPath = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--release-dir') {
      options.releaseDir = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--output-dir') {
      options.outputDir = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--report-output') {
      options.reportOutput = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--desktop-picker-report') {
      options.desktopPickerSmokeReport = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--timeout-ms') {
      options.timeoutMs = Number(readValue(argv, index, arg))
      index += 1
    } else if (arg === '--allow-pending-picker') {
      options.allowPendingPicker = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) throw new Error('--timeout-ms must be a positive number')
  return options
}

const sessionTimestamp = (date) => date.toISOString().replace(/[:.]/g, '-')

const createRuntimeSmokeSession = ({ appPath, outputDir = DEFAULT_OUTPUT_DIR, platform = process.platform, arch = process.arch, now = () => new Date(), env = process.env } = {}) => {
  const generatedAt = now()
  const sessionId = `${sessionTimestamp(generatedAt)}-${platform}-${arch}`
  const sessionDir = path.resolve(outputDir, sessionId)
  const evidencePath = path.join(sessionDir, 'packaged-runtime-smoke-evidence.json')
  const screenshotPath = path.join(sessionDir, 'screenshots', 'packaged-runtime.png')
  return {
    sessionId,
    sessionDir,
    evidencePath,
    screenshotPath,
    env: {
      ...env,
      OPENPET_PACKAGED_RUNTIME_SMOKE: '1',
      OPENPET_PACKAGED_RUNTIME_SMOKE_SESSION_ID: sessionId,
      OPENPET_PACKAGED_RUNTIME_SMOKE_OUTPUT: evidencePath,
      OPENPET_PACKAGED_RUNTIME_SMOKE_SCREENSHOT: screenshotPath,
      OPENPET_PACKAGED_RUNTIME_SMOKE_APP_PATH: appPath || ''
    }
  }
}

const normalizePath = (value) => value ? path.resolve(value) : ''

const hasText = (value) => String(value || '').trim().length > 0

const findCheck = (report, id) => report.checks.find((check) => check.id === id)

const setCheck = (report, id, status, evidence, notes = '') => {
  const check = findCheck(report, id)
  if (!check) throw new Error(`Missing packaged runtime check: ${id}`)
  check.status = status
  check.evidence = evidence || ''
  check.notes = notes || check.notes || REQUIRED_CHECKS.find((item) => item.id === id)?.label || ''
}

const packById = (evidence, packId) => (Array.isArray(evidence.state?.packs)
  ? evidence.state.packs.find((pack) => pack.id === packId)
  : null)

const createRuntimeCheckEvidence = ({ sessionId, appPath, screenshotPath, desktopPickerSmokeReport = '', state = {} } = {}) => ({
  sessionId: sessionId || '',
  appPath: appPath || '',
  screenshotPath: screenshotPath || '',
  desktopPickerSmokeReport: desktopPickerSmokeReport || '',
  state: state || {}
})

const loadDesktopPickerSmokeReport = (reportPath, fsImpl = fs) => {
  if (!reportPath) return null
  const absolutePath = path.resolve(reportPath)
  if (!fsImpl.existsSync(absolutePath)) {
    throw new Error(`Linked desktop picker smoke report not found: ${absolutePath}`)
  }
  const report = JSON.parse(fsImpl.readFileSync(absolutePath, 'utf-8'))
  const validation = validateDesktopPickerReport(report)
  if (!validation.ok) {
    throw new Error(`Linked desktop picker smoke report is not ready: ${validation.errors.join('; ')}`)
  }
  return { absolutePath, report, validation }
}

const desktopPickerCheckEvidence = (desktopPickerEvidence, checkIds) => {
  if (!desktopPickerEvidence?.report || !Array.isArray(desktopPickerEvidence.report.checks)) return ''
  const checksById = new Map(desktopPickerEvidence.report.checks.map((check) => [check.id, check]))
  return checkIds
    .map((checkId) => {
      const check = checksById.get(checkId)
      if (!check?.evidence) return ''
      return `${checkId}: ${check.evidence}`
    })
    .filter(Boolean)
    .join(' | ')
}

const mergeRuntimeEvidenceIntoReport = (report, evidence) => {
  const merged = JSON.parse(JSON.stringify(report))
  const screenshot = normalizePath(evidence.screenshotPath)
  const session = evidence.sessionId ? `session ${evidence.sessionId}` : 'packaged runtime smoke session'
  const prefix = `${session}${evidence.appPath ? ` for ${evidence.appPath}` : ''}`
  const state = evidence.state || {}
  const renderer = state.renderer || {}
  const windowState = state.window || {}
  const bubbleChat = renderer.bubbleChat || {}
  const legacyInlineBubble = renderer.legacyInlineBubble || {}
  const bubbleItems = Array.isArray(bubbleChat.items) ? bubbleChat.items : []
  const hasRenderedBubbleItem = bubbleItems.some((item) => hasText(item?.text))
  const floatingBubbleVisible = Boolean(
    bubbleChat.visible
    && renderer.sprite?.visible
    && legacyInlineBubble.visible !== true
    && hasRenderedBubbleItem
  )

  if (!merged.linkedEvidence || typeof merged.linkedEvidence !== 'object') merged.linkedEvidence = {}
  if (!Array.isArray(merged.linkedEvidence.screenshots)) merged.linkedEvidence.screenshots = []
  if (screenshot && !merged.linkedEvidence.screenshots.includes(screenshot)) merged.linkedEvidence.screenshots.push(screenshot)
  if (evidence.desktopPickerSmokeReport) merged.linkedEvidence.desktopPickerSmokeReport = evidence.desktopPickerSmokeReport

  setCheck(
    merged,
    'packaged-launch',
    state.launch?.ok ? 'pass' : 'fail',
    state.launch?.ok ? `${prefix}; launched with pid ${state.launch.pid}` : '',
    state.launch?.ok ? 'Packaged app launched under runtime smoke mode.' : 'Packaged app did not report a successful launch.'
  )
  setCheck(
    merged,
    'pet-window-created',
    windowState.ok && windowState.visible ? 'pass' : 'fail',
    windowState.ok ? `Pet BrowserWindow visible=${Boolean(windowState.visible)} bounds=${JSON.stringify(windowState.bounds || {})}` : '',
    windowState.ok ? 'Main process observed the packaged pet window.' : 'No usable pet BrowserWindow was observed.'
  )
  setCheck(
    merged,
    'transparent-background',
    windowState.transparent && renderer.transparentBackground === true ? 'pass' : 'fail',
    windowState.transparent && renderer.transparentBackground === true ? `Window configured transparent; renderer background body=${renderer.bodyBackground || ''}, html=${renderer.htmlBackground || ''}${screenshot ? `; screenshot=${screenshot}` : ''}` : '',
    windowState.transparent && renderer.transparentBackground === true ? 'Transparent window and renderer backgrounds were checked.' : 'Transparent window or renderer background evidence is missing.'
  )
  setCheck(
    merged,
    'sprite-visible',
    renderer.sprite?.visible ? 'pass' : 'fail',
    renderer.sprite?.visible ? `Sprite visible ${renderer.sprite.width}x${renderer.sprite.height}; background=${renderer.sprite.backgroundImage || ''}${screenshot ? `; screenshot=${screenshot}` : ''}` : '',
    renderer.sprite?.visible ? 'Renderer reported a visible sprite with a non-empty background image.' : 'Renderer did not report a visible sprite.'
  )
  setCheck(
    merged,
    'speech-bubble-rendered',
    floatingBubbleVisible ? 'pass' : 'fail',
    floatingBubbleVisible
      ? `Floating bubble chat visible with text=${JSON.stringify(bubbleChat.text || '')}; items=${JSON.stringify(bubbleItems)}; noticeCount=${Number(bubbleChat.noticeCount || 0)}; dialogueCount=${Number(bubbleChat.dialogueCount || 0)}; spriteVisible=${Boolean(renderer.sprite?.visible)}; legacyInlineVisible=${Boolean(legacyInlineBubble.visible)}${screenshot ? `; screenshot=${screenshot}` : ''}`
      : '',
    floatingBubbleVisible
      ? 'Floating bubble chat rendered item content while the old inline pet bubble stayed hidden.'
      : 'Floating bubble chat evidence is missing rendered items or the old inline bubble is still visible.'
  )
  setCheck(
    merged,
    'default-action-playback',
    renderer.action?.advanced ? 'pass' : 'fail',
    hasText(renderer.action?.requested) || hasText(renderer.action?.current) ? `Requested action=${renderer.action.requested || ''}; current=${renderer.action.current || ''}; frameAdvanced=${Boolean(renderer.action.advanced)}` : '',
    renderer.action?.advanced ? 'Renderer frame position advanced during smoke run.' : 'Renderer reported an action but frame advancement could not be proven.'
  )

  for (const packId of ['legacy-cat', 'doro', 'duodong', 'chispa']) {
    const pack = packById(evidence, packId)
    setCheck(
      merged,
      `pack-switch-${packId}`,
      pack?.ok ? 'pass' : 'fail',
      pack?.ok ? `Pack ${packId} activated with ${pack.actionCount} actions; default=${pack.defaultAction || ''}; spriteVisible=${Boolean(pack.spriteVisible)}` : '',
      pack?.ok ? `Built-in pack ${packId} rendered in the packaged app.` : (pack?.error || `Built-in pack ${packId} did not render.`)
    )
  }

  const pluginPicker = state.pluginPicker || {}
  const petPicker = state.petPicker || {}
  const invalidPackage = state.invalidPackage || {}
  setCheck(
    merged,
    'plugin-picker-evidence-linked',
    pluginPicker.status || (evidence.desktopPickerSmokeReport ? 'pass' : 'pending'),
    pluginPicker.evidence || (evidence.desktopPickerSmokeReport ? `Linked desktop picker smoke report: ${evidence.desktopPickerSmokeReport}` : ''),
    pluginPicker.notes || 'Native plugin picker evidence must come from a paired desktop picker smoke report.'
  )
  setCheck(
    merged,
    'pet-picker-evidence-linked',
    petPicker.status || (evidence.desktopPickerSmokeReport ? 'pass' : 'pending'),
    petPicker.evidence || (evidence.desktopPickerSmokeReport ? `Linked desktop picker smoke report: ${evidence.desktopPickerSmokeReport}` : ''),
    petPicker.notes || 'Native pet pack picker evidence must come from a paired desktop picker smoke report.'
  )
  setCheck(
    merged,
    'invalid-package-feedback',
    invalidPackage.status || 'blocked',
    invalidPackage.evidence || '',
    invalidPackage.notes || 'Invalid-package feedback requires a paired picker smoke report or manual packaged-app evidence.'
  )
  setCheck(
    merged,
    'state-after-runtime-smoke',
    state.finalState?.ok ? 'pass' : 'fail',
    state.finalState?.ok ? `Final state ok; activePackId=${state.finalState.activePackId || ''}` : '',
    state.finalState?.ok ? 'Runtime smoke restored a stable active pet pack.' : (state.finalState?.error || 'Runtime final state was not stable.')
  )

  return merged
}

const applyDesktopPickerEvidence = (runtimeEvidence, desktopPickerEvidence) => {
  if (!desktopPickerEvidence) return runtimeEvidence
  return {
    ...runtimeEvidence,
    desktopPickerSmokeReport: desktopPickerEvidence.absolutePath,
    state: {
      ...runtimeEvidence.state,
      pluginPicker: {
        status: 'pass',
        evidence: desktopPickerCheckEvidence(desktopPickerEvidence, [
          'plugin-picker-cancel',
          'plugin-picker-zip-review',
          'plugin-install-disabled'
        ]) || `Linked ready desktop picker smoke report: ${desktopPickerEvidence.absolutePath}`
      },
      petPicker: {
        status: 'pass',
        evidence: desktopPickerCheckEvidence(desktopPickerEvidence, [
          'pet-pack-picker-cancel',
          'action-frame-picker-cancel'
        ]) || `Linked ready desktop picker smoke report: ${desktopPickerEvidence.absolutePath}`
      },
      invalidPackage: {
        status: 'pass',
        evidence: desktopPickerCheckEvidence(desktopPickerEvidence, [
          'invalid-package-feedback'
        ]) || `Linked ready desktop picker smoke report: ${desktopPickerEvidence.absolutePath}`
      }
    }
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const waitForEvidenceFile = async (filePath, timeoutMs = DEFAULT_TIMEOUT_MS, fsImpl = fs) => {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (fsImpl.existsSync(filePath)) return JSON.parse(fsImpl.readFileSync(filePath, 'utf-8'))
    await sleep(250)
  }
  throw new Error(`Timed out waiting for packaged runtime smoke evidence: ${filePath}`)
}

const resolveMacExecutable = (appPath) => {
  const absoluteAppPath = path.resolve(appPath)
  if (!/\.app$/i.test(absoluteAppPath)) return absoluteAppPath
  const plistPath = path.join(absoluteAppPath, 'Contents', 'Info.plist')
  let executableName = 'OpenPet'
  if (fs.existsSync(plistPath)) {
    try {
      const output = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleExecutable', plistPath], { encoding: 'utf-8' }).trim()
      if (output) executableName = output
    } catch (_) {}
  }
  return path.join(absoluteAppPath, 'Contents', 'MacOS', executableName)
}

const discoverAppPath = (report) => {
  const releaseDir = report.artifact?.releaseDir || DEFAULT_RELEASE_DIR
  const artifactPath = report.artifact?.appPath || report.artifact?.installer || ''
  if (!artifactPath) throw new Error('No packaged app artifact discovered; pass --app explicitly')
  return path.resolve(releaseDir, artifactPath)
}

const runPackagedRuntimeSmoke = async ({
  appPath = '',
  releaseDir = DEFAULT_RELEASE_DIR,
  outputDir = DEFAULT_OUTPUT_DIR,
  reportOutput = '',
  desktopPickerSmokeReport = '',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  allowPendingPicker = false,
  spawnImpl = spawn,
  fsImpl = fs,
  now = () => new Date()
} = {}) => {
  const baseReport = createPackagedRuntimeSmokeReport({ releaseDir, platform: process.platform, arch: process.arch })
  const resolvedAppPath = appPath ? path.resolve(appPath) : discoverAppPath(baseReport)
  const session = createRuntimeSmokeSession({ appPath: resolvedAppPath, outputDir, platform: process.platform, arch: process.arch, now })
  fsImpl.mkdirSync(session.sessionDir, { recursive: true })

  const executable = process.platform === 'darwin' ? resolveMacExecutable(resolvedAppPath) : resolvedAppPath
  if (!fsImpl.existsSync(executable)) throw new Error(`Packaged app executable not found: ${executable}`)

  const desktopPickerEvidence = desktopPickerSmokeReport
    ? loadDesktopPickerSmokeReport(desktopPickerSmokeReport, fsImpl)
    : null
  const child = spawnImpl(executable, [], {
    env: session.env,
    stdio: 'ignore',
    detached: false
  })
  try {
    const evidence = await waitForEvidenceFile(session.evidencePath, timeoutMs, fsImpl)
    const runtimeEvidence = createRuntimeCheckEvidence({
      sessionId: session.sessionId,
      appPath: resolvedAppPath,
      screenshotPath: evidence.screenshotPath || session.screenshotPath,
      desktopPickerSmokeReport: desktopPickerEvidence?.absolutePath || '',
      state: evidence.state || {}
    })
    const merged = mergeRuntimeEvidenceIntoReport(baseReport, applyDesktopPickerEvidence(runtimeEvidence, desktopPickerEvidence))
    const reportPath = reportOutput || path.join(session.sessionDir, 'packaged-runtime-smoke-report.json')
    writeReport({ report: merged, outputPath: reportPath, fsImpl })
    const validation = validateReport(merged, { allowPending: allowPendingPicker })
    if (!validation.ok) {
      throw new Error(`Packaged runtime smoke report did not validate: ${validation.errors.join('; ')}`)
    }
    return { session, evidence, report: merged, reportPath, validation }
  } finally {
    if (child?.pid && typeof child.kill === 'function') child.kill()
  }
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }
  const result = await runPackagedRuntimeSmoke(options)
  console.log(`Packaged runtime smoke report: ${result.reportPath}`)
  console.log(`Evidence session: ${result.session.sessionDir}`)
  console.log(`Checks: ${result.validation.summary.passed}/${result.validation.summary.total} passed`)
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error)
    process.exit(1)
  })
}

module.exports = {
  createRuntimeCheckEvidence,
  createRuntimeSmokeSession,
  mergeRuntimeEvidenceIntoReport,
  parseArgs,
  runPackagedRuntimeSmoke,
  loadDesktopPickerSmokeReport,
  applyDesktopPickerEvidence,
  desktopPickerCheckEvidence,
  waitForEvidenceFile
}
