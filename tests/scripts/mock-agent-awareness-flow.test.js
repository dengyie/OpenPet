const test = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  runAgentAwarenessLocalSmoke
} = require('../../scripts/run-agent-awareness-local-smoke')
const {
  createCodexRolloutPoller
} = require('../../examples/plugins/agent-awareness/service/adapters/codex-rollout-poller')
const {
  createAgentAwarenessLocalSmokeArchive
} = require('../../scripts/create-agent-awareness-local-smoke-archive')
const {
  updateAgentAwarenessLocalSmokeReport
} = require('../../scripts/update-agent-awareness-local-smoke-report')

const createTempDir = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix))
const runScript = (scriptPath, args) => spawnSync(process.execPath, [scriptPath, ...args], {
  encoding: 'utf-8'
})

const createCodexRolloutFixture = () => {
  const codexHome = createTempDir('openpet-agent-awareness-mock-codex-home-')
  const sessionsDir = path.join(codexHome, 'sessions')
  fs.mkdirSync(sessionsDir, { recursive: true })
  fs.writeFileSync(path.join(sessionsDir, 'rollout-2026-07-07T00-00-00-1.jsonl'), [
    JSON.stringify({
      type: 'session_meta',
      timestamp: '2026-07-07T00:00:00.000Z',
      payload: {
        id: 'raw-session-mock-1',
        cwd: '/Users/mango/private/project/OpenPet'
      }
    }),
    JSON.stringify({
      type: 'event_msg',
      timestamp: '2026-07-07T00:00:01.000Z',
      payload: {
        type: 'task_started'
      }
    }),
    JSON.stringify({
      type: 'event_msg',
      timestamp: '2026-07-07T00:00:02.000Z',
      payload: {
        type: 'token_count',
        input_tokens: 1200,
        output_tokens: 300,
        total_tokens: 1500,
        context_window: 200000,
        estimated_cost_usd: 0.012345
      }
    }),
    JSON.stringify({
      type: 'turn_context',
      timestamp: '2026-07-07T00:00:02.500Z',
      payload: {
        cwd: '/Users/mango/private/project/OpenPet'
      }
    }),
    JSON.stringify({
      type: 'event_msg',
      timestamp: '2026-07-07T00:00:03.000Z',
      payload: {
        type: 'tool_call',
        tool_name: 'read_file'
      }
    }),
    JSON.stringify({
      type: 'event_msg',
      timestamp: '2026-07-07T00:00:04.000Z',
      payload: {
        type: 'task_complete',
        stdout: 'secret stdout sk-test123'
      }
    })
  ].join('\n'))
  return codexHome
}

test('mock agent-awareness flow rehearses smoke, archive, and manual acceptance update without launching OpenPet', async () => {
  const root = createTempDir('openpet-agent-awareness-mock-flow-')
  const codexHome = createCodexRolloutFixture()
  const smokeOutputDir = path.join(root, 'smoke-output')
  const fixedSmokeNow = () => new Date('2026-07-07T08:00:00.000Z')

  const smokeResult = await runAgentAwarenessLocalSmoke({
    codexHome,
    outputDir: smokeOutputDir,
    scanTimeoutMs: 4000,
    sampleLimit: 3,
    now: fixedSmokeNow,
    createCodexRolloutPollerImpl: (options) => createCodexRolloutPoller({
      ...options,
      gitSummaryProvider: () => ({
        branch: 'codex/dev7',
        dirty: true,
        dirtyCount: 2,
        ahead: 1,
        behind: 0,
        repository: 'OpenPet #111111'
      })
    })
  })

  assert.equal(smokeResult.ok, true)
  assert.equal(smokeResult.sanitizedSignalDetected, true)
  assert.equal(smokeResult.redactionChecks.noRawPaths, true)
  assert.equal(smokeResult.redactionChecks.noLoopbackUrls, true)
  assert.equal(smokeResult.redactionChecks.noSecrets, true)
  assert.equal(smokeResult.sessions[0].usage.totalTokens, 1500)
  assert.equal(smokeResult.sessions[0].git.branch, 'codex/dev7')
  assert.equal(smokeResult.sessions[0].summary.title, 'OpenPet #111111 on codex/dev7')
  assert.deepEqual(smokeResult.manualAcceptanceTemplate, {
    dashboardUseful: null,
    petSpeechNoiseAcceptable: null,
    redactionLooksSafe: true,
    notes: ''
  })

  const smokeSessionDir = path.join(smokeOutputDir, smokeResult.sessionId)
  const smokeReportPath = path.join(smokeSessionDir, 'agent-awareness-local-smoke-result.json')
  assert.equal(fs.existsSync(smokeReportPath), true)

  const persistedSmokeReport = JSON.parse(fs.readFileSync(smokeReportPath, 'utf-8'))
  assert.equal(persistedSmokeReport.codexHome, '[redacted-local-codex-home]')
  assert.equal(persistedSmokeReport.healthUrl, '[local-url]')
  assert.equal(JSON.stringify(persistedSmokeReport).includes('/Users/mango/private/project/OpenPet'), false)
  assert.equal(JSON.stringify(persistedSmokeReport).includes('sk-test123'), false)

  const archiveDir = path.join(root, 'archive', smokeResult.sessionId)
  const archiveResult = createAgentAwarenessLocalSmokeArchive({
    sessionDir: smokeSessionDir,
    archiveDir,
    now: () => new Date('2026-07-07T08:05:00.000Z')
  })

  assert.equal(archiveResult.ok, true)
  assert.equal(archiveResult.smoke.sanitizedSignalDetected, true)
  assert.equal(archiveResult.smoke.manualAcceptanceTemplatePresent, true)
  assert.equal(archiveResult.smoke.manualAcceptance.dashboardUseful, 'pending')
  assert.equal(archiveResult.smoke.manualAcceptance.petSpeechNoiseAcceptable, 'pending')
  assert.equal(archiveResult.smoke.manualAcceptance.redactionLooksSafe, 'pass')

  const archivedReportPath = path.join(archiveDir, 'agent-awareness-local-smoke-result.json')
  const archivedReadmePath = path.join(archiveDir, 'README.md')
  const archivedResultPath = path.join(archiveDir, 'agent-awareness-local-smoke-archive-result.json')
  assert.equal(fs.existsSync(archivedReportPath), true)
  assert.equal(fs.existsSync(archivedReadmePath), true)
  assert.equal(fs.existsSync(archivedResultPath), true)

  const updateResult = updateAgentAwarenessLocalSmokeReport({
    reportPath: archivedReportPath,
    options: {
      dashboardUseful: true,
      petSpeechNoiseAcceptable: true,
      redactionLooksSafe: true,
      notes: 'Synthetic mock review exercised the full archive/update data path; real desktop feel remains manual.',
      validateComplete: true
    }
  })

  assert.equal(updateResult.ok, true)
  assert.equal(updateResult.summary.dashboardUseful, 'pass')
  assert.equal(updateResult.summary.petSpeechNoiseAcceptable, 'pass')
  assert.equal(updateResult.summary.redactionLooksSafe, 'pass')
  assert.equal(updateResult.reportPath, archivedReportPath)
  assert.equal(updateResult.readmePath, archivedReadmePath)
  assert.equal(updateResult.archiveResultPath, archivedResultPath)

  const updatedReport = JSON.parse(fs.readFileSync(archivedReportPath, 'utf-8'))
  assert.equal(updatedReport.manualAcceptanceTemplate.dashboardUseful, true)
  assert.equal(updatedReport.manualAcceptanceTemplate.petSpeechNoiseAcceptable, true)
  assert.equal(updatedReport.manualAcceptanceTemplate.redactionLooksSafe, true)
  assert.match(
    updatedReport.manualAcceptanceTemplate.notes,
    /Synthetic mock review exercised the full archive\/update data path/i
  )

  const updatedReadme = fs.readFileSync(archivedReadmePath, 'utf-8')
  assert.match(updatedReadme, /## Manual Acceptance/)
  assert.match(updatedReadme, /\| Dashboard usefulness \| pass \|/)
  assert.match(updatedReadme, /\| Pet speech noise \| pass \|/)
  assert.match(updatedReadme, /real desktop feel remains manual/i)
  assert.match(updatedReadme, /does not by itself prove/i)

  const updatedArchiveResult = JSON.parse(fs.readFileSync(archivedResultPath, 'utf-8'))
  assert.equal(updatedArchiveResult.smoke.manualAcceptance.dashboardUseful, 'pass')
  assert.equal(updatedArchiveResult.smoke.manualAcceptance.petSpeechNoiseAcceptable, 'pass')
  assert.equal(updatedArchiveResult.smoke.manualAcceptance.redactionLooksSafe, 'pass')
  assert.equal(updatedArchiveResult.smoke.manualAcceptance.notesPresent, true)
  assert.equal(JSON.stringify(updatedArchiveResult).includes('/Users/mango/private/project/OpenPet'), false)
  assert.equal(JSON.stringify(updatedArchiveResult).includes('127.0.0.1'), false)
  assert.equal(JSON.stringify(updatedArchiveResult).includes('sk-test123'), false)
})

test('mock agent-awareness CLI flow rehearses the shipped smoke, archive, and update commands without launching OpenPet', () => {
  const root = createTempDir('openpet-agent-awareness-mock-cli-flow-')
  const codexHome = createCodexRolloutFixture()
  const smokeOutputDir = path.join(root, 'smoke-output')
  const archiveRoot = path.join(root, 'archive')
  const smokeScript = path.resolve(__dirname, '../../scripts/run-agent-awareness-local-smoke.js')
  const archiveScript = path.resolve(__dirname, '../../scripts/create-agent-awareness-local-smoke-archive.js')
  const updateScript = path.resolve(__dirname, '../../scripts/update-agent-awareness-local-smoke-report.js')

  const smoke = runScript(smokeScript, [
    '--codex-home', codexHome,
    '--output-dir', smokeOutputDir,
    '--scan-timeout-ms', '4000',
    '--sample-limit', '3'
  ])

  assert.equal(smoke.status, 0, smoke.stderr)
  assert.match(smoke.stdout, /"ok": true/)
  assert.doesNotMatch(smoke.stdout, /\/Users\/mango\/private\/project\/OpenPet/)
  assert.doesNotMatch(smoke.stdout, /sk-test123/)

  const smokeSessions = fs.readdirSync(smokeOutputDir)
  assert.equal(smokeSessions.length, 1)

  const sessionId = smokeSessions[0]
  const smokeSessionDir = path.join(smokeOutputDir, sessionId)
  const smokeReportPath = path.join(smokeSessionDir, 'agent-awareness-local-smoke-result.json')
  const smokeReport = JSON.parse(fs.readFileSync(smokeReportPath, 'utf-8'))
  assert.equal(smokeReport.ok, true)
  assert.equal(smokeReport.sanitizedSignalDetected, true)
  assert.equal(smokeReport.redactionChecks.noRawPaths, true)
  assert.equal(smokeReport.redactionChecks.noLoopbackUrls, true)
  assert.equal(smokeReport.redactionChecks.noSecrets, true)

  const archiveDir = path.join(archiveRoot, sessionId)
  const archive = runScript(archiveScript, [
    '--session-dir', smokeSessionDir,
    '--archive-dir', archiveDir,
    '--json'
  ])

  assert.equal(archive.status, 0, archive.stderr)

  const archiveResult = JSON.parse(archive.stdout)
  assert.equal(archiveResult.ok, true)
  assert.equal(archiveResult.smoke.sanitizedSignalDetected, true)
  assert.equal(archiveResult.smoke.manualAcceptance.dashboardUseful, 'pending')
  assert.equal(archiveResult.smoke.manualAcceptance.petSpeechNoiseAcceptable, 'pending')
  assert.equal(archiveResult.smoke.manualAcceptance.redactionLooksSafe, 'pass')

  const archivedReportPath = path.join(archiveDir, 'agent-awareness-local-smoke-result.json')
  const archivedReadmePath = path.join(archiveDir, 'README.md')
  const archivedResultPath = path.join(archiveDir, 'agent-awareness-local-smoke-archive-result.json')
  assert.equal(fs.existsSync(archivedReportPath), true)
  assert.equal(fs.existsSync(archivedReadmePath), true)
  assert.equal(fs.existsSync(archivedResultPath), true)

  const update = runScript(updateScript, [
    archivedReportPath,
    '--dashboard-useful', 'true',
    '--pet-speech-noise-acceptable', 'true',
    '--redaction-looks-safe', 'true',
    '--notes', 'Synthetic CLI review exercised the full archive/update data path; real desktop feel remains manual.',
    '--validate-complete'
  ])

  assert.equal(update.status, 0, update.stderr)
  assert.match(update.stdout, /Agent-awareness smoke report updated:/)
  assert.match(update.stdout, /Manual acceptance: dashboard=pass, petSpeech=pass, redaction=pass/)
  assert.match(update.stdout, /Manual acceptance review is structurally complete\./)

  const updatedReport = JSON.parse(fs.readFileSync(archivedReportPath, 'utf-8'))
  assert.equal(updatedReport.manualAcceptanceTemplate.dashboardUseful, true)
  assert.equal(updatedReport.manualAcceptanceTemplate.petSpeechNoiseAcceptable, true)
  assert.equal(updatedReport.manualAcceptanceTemplate.redactionLooksSafe, true)
  assert.match(updatedReport.manualAcceptanceTemplate.notes, /Synthetic CLI review exercised the full archive\/update data path/i)

  const updatedReadme = fs.readFileSync(archivedReadmePath, 'utf-8')
  assert.match(updatedReadme, /## Manual Acceptance/)
  assert.match(updatedReadme, /\| Dashboard usefulness \| pass \|/)
  assert.match(updatedReadme, /\| Pet speech noise \| pass \|/)
  assert.match(updatedReadme, /real desktop feel remains manual/i)
  assert.match(updatedReadme, /does not by itself prove/i)

  const updatedArchiveResult = JSON.parse(fs.readFileSync(archivedResultPath, 'utf-8'))
  assert.equal(updatedArchiveResult.smoke.manualAcceptance.dashboardUseful, 'pass')
  assert.equal(updatedArchiveResult.smoke.manualAcceptance.petSpeechNoiseAcceptable, 'pass')
  assert.equal(updatedArchiveResult.smoke.manualAcceptance.redactionLooksSafe, 'pass')
  assert.equal(updatedArchiveResult.smoke.manualAcceptance.notesPresent, true)
  assert.equal(JSON.stringify(updatedArchiveResult).includes('/Users/mango/private/project/OpenPet'), false)
  assert.equal(JSON.stringify(updatedArchiveResult).includes('127.0.0.1'), false)
  assert.equal(JSON.stringify(updatedArchiveResult).includes('sk-test123'), false)
})
