const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  defaultArchiveDir,
  parseArgs,
  createPackagedCreatorStudioUiE2eRun
} = require('../../scripts/run-packaged-creator-studio-ui-e2e')

test('packaged creator studio UI runner parseArgs accepts app, archive dir, and json flag', () => {
  const options = parseArgs([
    '--app', '/Applications/OpenPet.app',
    '--archive-dir', 'docs/release-evidence/creator-studio-packaged-ui/session',
    '--json'
  ])

  assert.equal(options.appPath, '/Applications/OpenPet.app')
  assert.equal(options.archiveDir, 'docs/release-evidence/creator-studio-packaged-ui/session')
  assert.equal(options.json, true)
})

test('packaged creator studio UI runner parseArgs rejects missing values and unexpected flags', () => {
  assert.throws(
    () => parseArgs(['--app']),
    /--app requires a value/
  )
  assert.throws(
    () => parseArgs(['--unexpected']),
    /Unexpected argument: --unexpected/
  )
})

test('packaged creator studio UI runner defaultArchiveDir names packaged creator studio ui sessions', () => {
  const archiveDir = defaultArchiveDir({
    now: () => new Date('2026-06-29T12:00:00.000Z'),
    platform: 'darwin',
    arch: 'arm64'
  })

  assert.match(archiveDir, /2026-06-29T12-00-00Z-darwin-arm64-packaged-creator-studio-ui$/)
})

test('createPackagedCreatorStudioUiE2eRun persists runtime artifact and summary', async () => {
  const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-packaged-creator-studio-ui-'))

  const result = await createPackagedCreatorStudioUiE2eRun({
    appPath: '/Applications/OpenPet.app',
    archiveDir,
    now: () => new Date('2026-06-29T12:00:00.000Z'),
    orchestratePackagedAppImpl: ({ archiveDir: runArchiveDir }) => {
      const runtimeArtifactPath = path.join(runArchiveDir, 'packaged-creator-studio-ui-e2e.json')
      const stdoutPath = path.join(runArchiveDir, 'packaged-creator-studio-ui-e2e-stdout.txt')
      const stderrPath = path.join(runArchiveDir, 'packaged-creator-studio-ui-e2e-stderr.txt')
      const runtimeArtifact = {
        schemaVersion: 1,
        generatedAt: '2026-06-29T12:00:00.000Z',
        pluginId: 'openpet.creator-studio',
        pluginFound: true,
        pluginEnabledBefore: false,
        hostApp: 'OpenPet.app',
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

  assert.equal(result.ok, true)
  assert.equal(result.runtimeArtifact.pluginFound, true)
  assert.equal(result.summary.controlCenterReady, true)
  assert.equal(result.summary.dashboardFlowOk, true)
  assert.equal(result.summary.importOk, true)
  assert.equal(result.summary.runId, 'run-packaged-ui-creator-1')
  assert.equal(fs.existsSync(path.join(archiveDir, 'packaged-creator-studio-ui-e2e.json')), true)
  assert.equal(fs.existsSync(path.join(archiveDir, 'packaged-creator-studio-ui-e2e-stdout.txt')), true)
  assert.equal(fs.existsSync(path.join(archiveDir, 'packaged-creator-studio-ui-e2e-stderr.txt')), true)
  assert.equal(fs.existsSync(path.join(archiveDir, 'packaged-creator-studio-ui-e2e-summary.json')), true)
})

test('createPackagedCreatorStudioUiE2eRun preserves orchestration failures in summary output', async () => {
  const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-packaged-creator-studio-ui-fail-'))

  const result = await createPackagedCreatorStudioUiE2eRun({
    appPath: '/Applications/OpenPet.app',
    archiveDir,
    now: () => new Date('2026-06-29T12:00:00.000Z'),
    orchestratePackagedAppImpl: ({ archiveDir: runArchiveDir }) => {
      const stderrPath = path.join(runArchiveDir, 'packaged-creator-studio-ui-e2e-stderr.txt')
      fs.writeFileSync(stderrPath, 'timed out waiting for packaged creator studio ui e2e evidence\n')
      return {
        runtimeArtifact: null,
        runtimeArtifactPath: path.join(runArchiveDir, 'packaged-creator-studio-ui-e2e.json'),
        stdoutPath: path.join(runArchiveDir, 'packaged-creator-studio-ui-e2e-stdout.txt'),
        stderrPath,
        errors: ['timed out waiting for packaged creator studio ui e2e evidence']
      }
    }
  })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /timed out waiting for packaged creator studio ui e2e evidence/)
  assert.equal(fs.existsSync(path.join(archiveDir, 'packaged-creator-studio-ui-e2e-summary.json')), true)
})

test('createPackagedCreatorStudioUiE2eRun fails conservatively when dashboard taskStatus is missing', async () => {
  const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-packaged-creator-studio-ui-missing-task-'))

  const result = await createPackagedCreatorStudioUiE2eRun({
    appPath: '/Applications/OpenPet.app',
    archiveDir,
    now: () => new Date('2026-06-29T12:00:00.000Z'),
    orchestratePackagedAppImpl: ({ archiveDir: runArchiveDir }) => {
      const runtimeArtifactPath = path.join(runArchiveDir, 'packaged-creator-studio-ui-e2e.json')
      const stdoutPath = path.join(runArchiveDir, 'packaged-creator-studio-ui-e2e-stdout.txt')
      const stderrPath = path.join(runArchiveDir, 'packaged-creator-studio-ui-e2e-stderr.txt')
      const runtimeArtifact = {
        schemaVersion: 1,
        generatedAt: '2026-06-29T12:00:00.000Z',
        pluginId: 'openpet.creator-studio',
        pluginFound: true,
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
          draftOk: true,
          questionAnswered: true,
          confirmed: true,
          generated: true,
          approved: true,
          runId: 'run-packaged-ui-creator-2',
          status: 'approved',
          taskStatus: '',
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

  assert.equal(result.ok, false)
  assert.equal(result.summary.dashboardFlowOk, false)
  assert.match(result.errors.join('\n'), /dashboard fixture packaged UI flow did not complete/i)
})
