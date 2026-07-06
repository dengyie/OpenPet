const test = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createPackagedCreateUiSmokeRun
} = require('../../scripts/run-packaged-create-ui-smoke')
const {
  createPackagedCreatorStudioEvidenceRun
} = require('../../scripts/run-packaged-creator-studio-evidence')
const {
  createPackagedCreatorStudioUiE2eRun
} = require('../../scripts/run-packaged-creator-studio-ui-e2e')

const runNodeScript = (shimPath, scriptPath, args, env = process.env) => spawnSync(process.execPath, [
  '--require',
  shimPath,
  scriptPath,
  ...args
], {
  encoding: 'utf-8',
  env
})

const createFakeExecutable = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-fake-packaged-app-'))
  const executablePath = path.join(root, 'OpenPet')
  fs.writeFileSync(executablePath, '#!/bin/sh\nexit 0\n')
  fs.chmodSync(executablePath, 0o755)
  return executablePath
}

const createCliSpawnShim = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-provider-cli-shim-'))
  const shimPath = path.join(root, 'packaged-provider-shim.cjs')
  fs.writeFileSync(shimPath, `
const fs = require('fs')
const path = require('path')
const childProcess = require('child_process')

const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\\n')
}

const writeText = (filePath, content) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
}

const createUiArtifact = () => ({
  schemaVersion: 1,
  generatedAt: '2026-07-06T14:00:00.000Z',
  hostApp: path.basename(process.env.OPENPET_PACKAGED_CREATE_UI_SMOKE_APP_PATH || 'OpenPet'),
  controlCenter: {
    opened: true,
    createTabActivated: true,
    pluginsTabActivated: true
  },
  initialCreate: {
    visible: true,
    providerReady: true,
    providerText: 'Image Provider ready',
    providerCode: 'provider_healthy',
    providerModel: 'gpt-image-2',
    creatorStudioReady: false,
    creatorStudioText: 'Creator Studio not ready',
    generateButtonDisabled: true
  },
  afterStudioStart: {
    pluginEnabled: true,
    serviceStarted: true,
    visible: true,
    providerReady: true,
    providerText: 'Image Provider ready',
    providerCode: 'provider_healthy',
    providerModel: 'gpt-image-2',
    creatorStudioReady: true,
    creatorStudioText: '',
    generateButtonDisabled: false
  }
})

const creatorRuntimeArtifact = (backend) => ({
  schemaVersion: 1,
  generatedAt: '2026-07-06T14:05:00.000Z',
  pluginId: 'openpet.creator-studio',
  pluginFound: true,
  pluginEnabledBefore: false,
  dashboard: {
    present: true,
    id: 'main',
    title: 'Creator Studio',
    url: 'http://127.0.0.1:8794'
  },
  service: {
    present: true,
    id: 'studio',
    title: 'Creator Studio Service',
    startRequested: true,
    stopRequested: true,
    healthOk: true,
    healthStatus: 'healthy',
    statusBeforeStart: 'stopped',
    statusAfterStart: 'running',
    statusAfterStop: 'stopped'
  },
  command: {
    requested: true,
    commandId: 'draft-task',
    backend,
    ok: true,
    runId: 'run-packaged-provider-runtime-1',
    status: 'draft',
    taskStatus: 'ready_for_confirmation',
    mode: 'single-action'
  }
})

const creatorUiArtifact = (backend) => ({
  schemaVersion: 1,
  generatedAt: '2026-07-06T14:10:00.000Z',
  pluginId: 'openpet.creator-studio',
  pluginFound: true,
  pluginEnabledBefore: false,
  controlCenter: {
    opened: true,
    pluginsTabActivated: true,
    pluginEnabledAfter: true,
    serviceStarted: true,
    serviceHealthOk: true,
    dashboardOpenRequested: true,
    dashboardUrl: 'http://127.0.0.1:8794'
  },
  dashboard: {
    loaded: true,
    title: 'Creator Studio',
    backend,
    draftOk: true,
    questionAnswered: true,
    confirmed: true,
    generated: true,
    approved: true,
    runId: 'run-packaged-provider-ui-1',
    status: 'approved',
    taskStatus: 'confirmed',
    importCommand: 'import-approved-action',
    qaSummary: 'Frame QA written: action-frame-validation.json',
    handoffSummary: 'Approved. Ready for host-owned import: Import Approved Action'
  },
  importResult: {
    importRequested: true,
    importCommandId: 'import-approved-action',
    importOk: true,
    importedActionId: 'roll-over',
    triggerProposalSummary: '已提交 · proposal:click:roll-over:test'
  }
})

childProcess.spawn = function spawnShim(command, args, options = {}) {
  const env = options.env || process.env
  if (env.OPENPET_USER_DATA_DIR) {
    fs.mkdirSync(env.OPENPET_USER_DATA_DIR, { recursive: true })
  }
  if (env.OPENPET_PACKAGED_CREATE_UI_SMOKE === '1') {
    writeJson(env.OPENPET_PACKAGED_CREATE_UI_SMOKE_OUTPUT, createUiArtifact())
    writeText(env.OPENPET_PACKAGED_CREATE_UI_SMOKE_STDOUT, 'packaged create ui smoke completed\\n')
    writeText(env.OPENPET_PACKAGED_CREATE_UI_SMOKE_STDERR, '')
  } else if (env.OPENPET_PACKAGED_CREATOR_STUDIO_EVIDENCE === '1') {
    writeJson(env.OPENPET_PACKAGED_CREATOR_STUDIO_OUTPUT, creatorRuntimeArtifact(env.OPENPET_PACKAGED_CREATOR_STUDIO_BACKEND || 'fixture'))
    writeText(env.OPENPET_PACKAGED_CREATOR_STUDIO_STDOUT, 'discovered openpet.creator-studio\\n')
    writeText(env.OPENPET_PACKAGED_CREATOR_STUDIO_STDERR, '')
  } else if (env.OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E === '1') {
    writeJson(env.OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_OUTPUT, creatorUiArtifact(env.OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_BACKEND || 'fixture'))
    writeText(env.OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_STDOUT, 'packaged creator studio ui e2e completed\\n')
    writeText(env.OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_STDERR, '')
  }
  return {
    pid: 4242,
    kill: () => true
  }
}
`)
  return shimPath
}

test('mock packaged provider-path flow records provider-ready create gating, provider-backed creator runtime, and provider-backed packaged ui flow', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-packaged-provider-flow-'))

  const createUiArchiveDir = path.join(root, 'create-ui')
  const createUiResult = await createPackagedCreateUiSmokeRun({
    appPath: '/Applications/OpenPet.app',
    archiveDir: createUiArchiveDir,
    now: () => new Date('2026-07-06T14:00:00.000Z'),
    orchestratePackagedAppImpl: ({ archiveDir: runArchiveDir }) => {
      const runtimeArtifactPath = path.join(runArchiveDir, 'packaged-create-ui-smoke.json')
      const stdoutPath = path.join(runArchiveDir, 'packaged-create-ui-smoke-stdout.txt')
      const stderrPath = path.join(runArchiveDir, 'packaged-create-ui-smoke-stderr.txt')
      const runtimeArtifact = {
        schemaVersion: 1,
        generatedAt: '2026-07-06T14:00:00.000Z',
        hostApp: 'OpenPet.app',
        controlCenter: {
          opened: true,
          createTabActivated: true,
          pluginsTabActivated: true
        },
        initialCreate: {
          visible: true,
          providerReady: true,
          providerText: 'Image Provider ready',
          providerCode: 'provider_healthy',
          providerModel: 'gpt-image-2',
          creatorStudioReady: false,
          creatorStudioText: 'Creator Studio not ready',
          generateButtonDisabled: true
        },
        afterStudioStart: {
          pluginEnabled: true,
          serviceStarted: true,
          visible: true,
          providerReady: true,
          providerText: 'Image Provider ready',
          providerCode: 'provider_healthy',
          providerModel: 'gpt-image-2',
          creatorStudioReady: true,
          creatorStudioText: '',
          generateButtonDisabled: false
        }
      }
      fs.writeFileSync(runtimeArtifactPath, `${JSON.stringify(runtimeArtifact, null, 2)}\n`)
      fs.writeFileSync(stdoutPath, 'packaged create ui smoke completed\n')
      fs.writeFileSync(stderrPath, '')
      return {
        runtimeArtifact,
        runtimeArtifactPath,
        stdoutPath,
        stderrPath,
        userDataDir: path.join(runArchiveDir, 'user-data-provider-flow'),
        errors: []
      }
    }
  })

  assert.equal(createUiResult.ok, true)
  assert.equal(createUiResult.summary.providerReadyAfterStudioStart, true)
  assert.equal(createUiResult.summary.providerStateTruthful, true)

  const creatorEvidenceArchiveDir = path.join(root, 'creator-evidence')
  const creatorEvidenceResult = await createPackagedCreatorStudioEvidenceRun({
    appPath: '/Applications/OpenPet.app',
    archiveDir: creatorEvidenceArchiveDir,
    backend: 'provider',
    now: () => new Date('2026-07-06T14:05:00.000Z'),
    orchestratePackagedAppImpl: ({ archiveDir: runArchiveDir, backend }) => {
      const runtimeArtifactPath = path.join(runArchiveDir, 'packaged-creator-studio-runtime.json')
      const stdoutPath = path.join(runArchiveDir, 'packaged-creator-studio-stdout.txt')
      const stderrPath = path.join(runArchiveDir, 'packaged-creator-studio-stderr.txt')
      const runtimeArtifact = {
        schemaVersion: 1,
        generatedAt: '2026-07-06T14:05:00.000Z',
        pluginId: 'openpet.creator-studio',
        pluginFound: true,
        pluginEnabledBefore: false,
        dashboard: {
          present: true,
          id: 'main',
          title: 'Creator Studio',
          url: 'http://127.0.0.1:8794'
        },
        service: {
          present: true,
          id: 'studio',
          title: 'Creator Studio Service',
          startRequested: true,
          stopRequested: true,
          healthOk: true,
          healthStatus: 'healthy',
          statusBeforeStart: 'stopped',
          statusAfterStart: 'running',
          statusAfterStop: 'stopped'
        },
        command: {
          requested: true,
          commandId: 'draft-task',
          backend,
          ok: true,
          runId: 'run-packaged-provider-runtime-1',
          status: 'draft',
          taskStatus: 'ready_for_confirmation',
          mode: 'single-action'
        }
      }
      fs.writeFileSync(runtimeArtifactPath, `${JSON.stringify(runtimeArtifact, null, 2)}\n`)
      fs.writeFileSync(stdoutPath, 'discovered openpet.creator-studio\n')
      fs.writeFileSync(stderrPath, '')
      return {
        runtimeArtifact,
        runtimeArtifactPath,
        stdoutPath,
        stderrPath,
        errors: []
      }
    }
  })

  assert.equal(creatorEvidenceResult.ok, true)
  assert.equal(creatorEvidenceResult.summary.backendRequested, 'provider')
  assert.equal(creatorEvidenceResult.runtimeArtifact.command.backend, 'provider')

  const creatorUiArchiveDir = path.join(root, 'creator-ui')
  const creatorUiResult = await createPackagedCreatorStudioUiE2eRun({
    appPath: '/Applications/OpenPet.app',
    archiveDir: creatorUiArchiveDir,
    backend: 'provider',
    now: () => new Date('2026-07-06T14:10:00.000Z'),
    orchestratePackagedAppImpl: ({ archiveDir: runArchiveDir, backend }) => {
      const runtimeArtifactPath = path.join(runArchiveDir, 'packaged-creator-studio-ui-e2e.json')
      const stdoutPath = path.join(runArchiveDir, 'packaged-creator-studio-ui-e2e-stdout.txt')
      const stderrPath = path.join(runArchiveDir, 'packaged-creator-studio-ui-e2e-stderr.txt')
      const runtimeArtifact = {
        schemaVersion: 1,
        generatedAt: '2026-07-06T14:10:00.000Z',
        pluginId: 'openpet.creator-studio',
        pluginFound: true,
        pluginEnabledBefore: false,
        controlCenter: {
          opened: true,
          pluginsTabActivated: true,
          pluginEnabledAfter: true,
          serviceStarted: true,
          serviceHealthOk: true,
          dashboardOpenRequested: true,
          dashboardUrl: 'http://127.0.0.1:8794'
        },
        dashboard: {
          loaded: true,
          title: 'Creator Studio',
          backend,
          draftOk: true,
          questionAnswered: true,
          confirmed: true,
          generated: true,
          approved: true,
          runId: 'run-packaged-provider-ui-1',
          status: 'approved',
          taskStatus: 'confirmed',
          importCommand: 'import-approved-action',
          qaSummary: 'Frame QA written: action-frame-validation.json',
          handoffSummary: 'Approved. Ready for host-owned import: Import Approved Action'
        },
        importResult: {
          importRequested: true,
          importCommandId: 'import-approved-action',
          importOk: true,
          importedActionId: 'roll-over',
          triggerProposalSummary: '已提交 · proposal:click:roll-over:test'
        }
      }
      fs.writeFileSync(runtimeArtifactPath, `${JSON.stringify(runtimeArtifact, null, 2)}\n`)
      fs.writeFileSync(stdoutPath, 'packaged creator studio ui e2e completed\n')
      fs.writeFileSync(stderrPath, '')
      return {
        runtimeArtifact,
        runtimeArtifactPath,
        stdoutPath,
        stderrPath,
        errors: []
      }
    }
  })

  assert.equal(creatorUiResult.ok, true)
  assert.equal(creatorUiResult.summary.backendRequested, 'provider')
  assert.equal(creatorUiResult.runtimeArtifact.dashboard.backend, 'provider')
  assert.equal(creatorUiResult.summary.importOk, true)
})

test('mock packaged provider-path CLI flow records provider-ready create gating, provider-backed creator runtime, and provider-backed packaged ui flow', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-packaged-provider-cli-flow-'))
  const fakeAppPath = createFakeExecutable()
  const shimPath = createCliSpawnShim()
  const createUiScript = path.resolve(__dirname, '../../scripts/run-packaged-create-ui-smoke.js')
  const creatorEvidenceScript = path.resolve(__dirname, '../../scripts/run-packaged-creator-studio-evidence.js')
  const creatorUiScript = path.resolve(__dirname, '../../scripts/run-packaged-creator-studio-ui-e2e.js')

  const createUiArchiveDir = path.join(root, 'create-ui')
  const createUi = runNodeScript(shimPath, createUiScript, [
    '--app', fakeAppPath,
    '--archive-dir', createUiArchiveDir,
    '--json'
  ])

  assert.equal(createUi.status, 0, createUi.stderr)
  const createUiResult = JSON.parse(createUi.stdout)
  assert.equal(createUiResult.ok, true)
  assert.equal(createUiResult.summary.providerReadyAfterStudioStart, true)
  assert.equal(createUiResult.summary.providerStateTruthful, true)
  assert.equal(fs.existsSync(path.join(createUiArchiveDir, 'packaged-create-ui-smoke-summary.json')), true)

  const creatorEvidenceArchiveDir = path.join(root, 'creator-evidence')
  const creatorEvidence = runNodeScript(shimPath, creatorEvidenceScript, [
    '--app', fakeAppPath,
    '--archive-dir', creatorEvidenceArchiveDir,
    '--backend', 'provider',
    '--json'
  ])

  assert.equal(creatorEvidence.status, 0, creatorEvidence.stderr)
  const creatorEvidenceResult = JSON.parse(creatorEvidence.stdout)
  assert.equal(creatorEvidenceResult.ok, true)
  assert.equal(creatorEvidenceResult.summary.backendRequested, 'provider')
  assert.equal(creatorEvidenceResult.runtimeArtifact.command.backend, 'provider')
  assert.equal(fs.existsSync(path.join(creatorEvidenceArchiveDir, 'packaged-creator-studio-evidence-summary.json')), true)

  const creatorUiArchiveDir = path.join(root, 'creator-ui')
  const creatorUi = runNodeScript(shimPath, creatorUiScript, [
    '--app', fakeAppPath,
    '--archive-dir', creatorUiArchiveDir,
    '--backend', 'provider',
    '--json'
  ])

  assert.equal(creatorUi.status, 0, creatorUi.stderr)
  const creatorUiResult = JSON.parse(creatorUi.stdout)
  assert.equal(creatorUiResult.ok, true)
  assert.equal(creatorUiResult.summary.backendRequested, 'provider')
  assert.equal(creatorUiResult.runtimeArtifact.dashboard.backend, 'provider')
  assert.equal(creatorUiResult.summary.importOk, true)
  assert.equal(fs.existsSync(path.join(creatorUiArchiveDir, 'packaged-creator-studio-ui-e2e-summary.json')), true)
})
