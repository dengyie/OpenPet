const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  parseDashboardCompletionSnapshot,
  isPackagedCreatorStudioUiE2eEnabled,
  runPackagedCreatorStudioUiE2e
} = require('../../src/main/packaged-creator-studio-ui-e2e-runner')

test('isPackagedCreatorStudioUiE2eEnabled only enables the explicit packaged Creator Studio UI flag', () => {
  assert.equal(isPackagedCreatorStudioUiE2eEnabled({}), false)
  assert.equal(isPackagedCreatorStudioUiE2eEnabled({ OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E: '0' }), false)
  assert.equal(isPackagedCreatorStudioUiE2eEnabled({ OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E: '1' }), true)
})

test('parseDashboardCompletionSnapshot extracts stable dashboard fields from snapshot and handoff text', () => {
  const parsed = parseDashboardCompletionSnapshot({
    approvalStatusText: 'Run approved. Use the Import Approved Action plugin command for host-owned import.',
    snapshotText: 'Phase: review Backend: fixture Task: confirmed / Step: approved Review: passed / Import: pending',
    importText: 'Approved. Ready for host-owned import: Import Approved Action Command ID: import-approved-action Payload JSON: {\"runId\":\"run-1\"}'
  })

  assert.deepEqual(parsed, {
    status: 'approved',
    taskStatus: 'confirmed',
    importCommand: 'import-approved-action'
  })
})

test('parseDashboardCompletionSnapshot does not fabricate task status or import command when dashboard text is incomplete', () => {
  const parsed = parseDashboardCompletionSnapshot({
    approvalStatusText: 'Run approved. Use the import plugin command for host-owned import.',
    snapshotText: 'Phase: review Backend: fixture Review: passed / Import: pending',
    importText: 'Approved. Ready for host-owned import.'
  })

  assert.deepEqual(parsed, {
    status: 'approved',
    taskStatus: '',
    importCommand: ''
  })
})

test('runPackagedCreatorStudioUiE2e writes a packaged UI artifact for the fixture dashboard and import flow', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-packaged-creator-studio-ui-main-'))
  const outputPath = path.join(tempDir, 'packaged-creator-studio-ui-e2e.json')
  const stdoutPath = path.join(tempDir, 'packaged-creator-studio-ui-e2e-stdout.txt')
  const stderrPath = path.join(tempDir, 'packaged-creator-studio-ui-e2e-stderr.txt')

  const controlCenterWindow = { id: 'control-center-window' }
  const dashboardWindow = { id: 'dashboard-window' }

  const artifact = await runPackagedCreatorStudioUiE2e({
    app: { getAppPath: () => '/Applications/OpenPet.app', quit: () => {} },
    pluginService: {
      listPlugins: () => [{
        id: 'openpet.creator-studio',
        enabled: false,
        entries: {
          dashboards: [{ id: 'main', title: 'Creator Studio', url: 'http://127.0.0.1:8794' }],
          services: [{ id: 'studio', title: 'Creator Studio Service', runtime: { status: 'stopped' } }]
        }
      }]
    },
    openControlCenter: () => controlCenterWindow,
    createDashboardWindow: () => dashboardWindow,
    driveControlCenterBootstrapImpl: async () => ({
      controlCenterWindow,
      opened: true,
      pluginsTabActivated: true,
      pluginEnabledAfter: true,
      serviceStarted: true,
      serviceHealthOk: true,
      dashboardOpenRequested: true,
      dashboardUrl: 'http://127.0.0.1:8794'
    }),
    driveDashboardImpl: async () => ({
      dashboardWindow,
      loaded: true,
      title: 'Creator Studio',
      draftOk: true,
      questionAnswered: true,
      confirmed: true,
      generated: true,
      approved: true,
      runId: 'run-packaged-ui-creator-1',
      status: 'approved',
      taskStatus: 'confirmed',
      importCommand: 'import-approved-action',
      qaSummary: 'Frame QA written: action-frame-validation.json',
      handoffSummary: 'Approved. Ready for host-owned import: Import Approved Action'
    }),
    driveControlCenterImportImpl: async () => ({
      importRequested: true,
      importCommandId: 'import-approved-action',
      importOk: true,
      importedActionId: 'roll-over',
      triggerProposalSummary: '已提交 · proposal:click:roll-over:test'
    }),
    env: {
      OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E: '1',
      OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_OUTPUT: outputPath,
      OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_STDOUT: stdoutPath,
      OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_STDERR: stderrPath,
      OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_APP_PATH: 'OpenPet.app',
      OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_QUIT_DELAY_MS: '0'
    }
  })

  assert.equal(artifact.pluginFound, true)
  assert.equal(artifact.pluginEnabledBefore, false)
  assert.deepEqual(artifact.controlCenter, {
    opened: true,
    pluginsTabActivated: true,
    pluginEnabledAfter: true,
    serviceStarted: true,
    serviceHealthOk: true,
    dashboardOpenRequested: true,
    dashboardUrl: 'http://127.0.0.1:8794'
  })
  assert.deepEqual(artifact.dashboard, {
    loaded: true,
    title: 'Creator Studio',
    draftOk: true,
    questionAnswered: true,
    confirmed: true,
    generated: true,
    approved: true,
    runId: 'run-packaged-ui-creator-1',
    status: 'approved',
    taskStatus: 'confirmed',
    importCommand: 'import-approved-action',
    qaSummary: 'Frame QA written: action-frame-validation.json',
    handoffSummary: 'Approved. Ready for host-owned import: Import Approved Action'
  })
  assert.deepEqual(artifact.importResult, {
    importRequested: true,
    importCommandId: 'import-approved-action',
    importOk: true,
    importedActionId: 'roll-over',
    triggerProposalSummary: '已提交 · proposal:click:roll-over:test'
  })
  assert.equal(fs.existsSync(outputPath), true)
  assert.equal(fs.existsSync(stdoutPath), true)
  assert.equal(fs.existsSync(stderrPath), true)
  assert.match(fs.readFileSync(stdoutPath, 'utf-8'), /packaged creator studio ui e2e completed/i)
  assert.equal(fs.readFileSync(stderrPath, 'utf-8'), '')
})

test('runPackagedCreatorStudioUiE2e records missing bundled Creator Studio conservatively', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-packaged-creator-studio-ui-main-missing-'))
  const outputPath = path.join(tempDir, 'packaged-creator-studio-ui-e2e.json')
  const stderrPath = path.join(tempDir, 'packaged-creator-studio-ui-e2e-stderr.txt')

  const artifact = await runPackagedCreatorStudioUiE2e({
    app: { getAppPath: () => '/Applications/OpenPet.app', quit: () => {} },
    pluginService: {
      listPlugins: () => []
    },
    openControlCenter: () => ({ id: 'unused' }),
    createDashboardWindow: () => ({ id: 'unused' }),
    env: {
      OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E: '1',
      OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_OUTPUT: outputPath,
      OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_STDERR: stderrPath,
      OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_APP_PATH: 'OpenPet.app',
      OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_QUIT_DELAY_MS: '0'
    }
  })

  assert.equal(artifact.pluginFound, false)
  assert.equal(artifact.controlCenter.opened, false)
  assert.equal(artifact.dashboard.loaded, false)
  assert.equal(artifact.importResult.importRequested, false)
  assert.match(artifact.error, /Bundled Creator Studio plugin was not found/i)
  assert.match(fs.readFileSync(stderrPath, 'utf-8'), /Bundled Creator Studio plugin was not found/i)
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf-8')).pluginFound, false)
})
