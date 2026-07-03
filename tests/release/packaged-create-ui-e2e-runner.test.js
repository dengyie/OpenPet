const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  defaultArchiveDir,
  parseArgs,
  createPackagedCreateUiSmokeRun
} = require('../../scripts/run-packaged-create-ui-smoke')

test('packaged Create UI runner parseArgs accepts app, archive dir, and json flag', () => {
  const options = parseArgs([
    '--app', '/Applications/OpenPet.app',
    '--archive-dir', 'docs/release-evidence/create-packaged-ui/session',
    '--json'
  ])

  assert.equal(options.appPath, '/Applications/OpenPet.app')
  assert.equal(options.archiveDir, 'docs/release-evidence/create-packaged-ui/session')
  assert.equal(options.json, true)
})

test('packaged Create UI runner parseArgs rejects missing values and unexpected flags', () => {
  assert.throws(
    () => parseArgs(['--app']),
    /--app requires a value/
  )
  assert.throws(
    () => parseArgs(['--unexpected']),
    /Unexpected argument: --unexpected/
  )
})

test('packaged Create UI runner defaultArchiveDir names packaged Create UI sessions', () => {
  const archiveDir = defaultArchiveDir({
    now: () => new Date('2026-07-02T12:00:00.000Z'),
    platform: 'darwin',
    arch: 'arm64'
  })

  assert.match(archiveDir, /2026-07-02T12-00-00Z-darwin-arm64-packaged-create-ui$/)
})

test('createPackagedCreateUiSmokeRun persists runtime artifact and summary', async () => {
  const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-packaged-create-ui-'))

  const result = await createPackagedCreateUiSmokeRun({
    appPath: '/Applications/OpenPet.app',
    archiveDir,
    now: () => new Date('2026-07-02T12:00:00.000Z'),
    orchestratePackagedAppImpl: ({ archiveDir: runArchiveDir }) => {
      const runtimeArtifactPath = path.join(runArchiveDir, 'packaged-create-ui-smoke.json')
      const stdoutPath = path.join(runArchiveDir, 'packaged-create-ui-smoke-stdout.txt')
      const stderrPath = path.join(runArchiveDir, 'packaged-create-ui-smoke-stderr.txt')
      const runtimeArtifact = {
        schemaVersion: 1,
        generatedAt: '2026-07-02T12:00:00.000Z',
        hostApp: 'OpenPet.app',
        controlCenter: {
          opened: true,
          createTabActivated: true,
          pluginsTabActivated: true
        },
        initialCreate: {
          visible: true,
          providerReady: false,
          providerText: 'Image Provider not ready',
          providerCode: 'missing_api_key',
          providerModel: 'gpt-image-2',
          creatorStudioReady: false,
          creatorStudioText: 'Creator Studio not ready',
          generateButtonDisabled: true
        },
        afterStudioStart: {
          pluginEnabled: true,
          serviceStarted: true,
          visible: true,
          providerReady: false,
          providerText: 'Image Provider not ready',
          providerCode: 'missing_api_key',
          providerModel: 'gpt-image-2',
          creatorStudioReady: true,
          creatorStudioText: '',
          generateButtonDisabled: true
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
        userDataDir: path.join(runArchiveDir, 'user-data-smoke'),
        errors: []
      }
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.summary.controlCenterReady, true)
  assert.equal(result.summary.initialGatingOk, true)
  assert.equal(result.summary.studioActivationOk, true)
  assert.equal(fs.existsSync(path.join(archiveDir, 'packaged-create-ui-smoke.json')), true)
  assert.equal(fs.existsSync(path.join(archiveDir, 'packaged-create-ui-smoke-summary.json')), true)
})

test('createPackagedCreateUiSmokeRun preserves orchestration failures in summary output', async () => {
  const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-packaged-create-ui-fail-'))

  const result = await createPackagedCreateUiSmokeRun({
    appPath: '/Applications/OpenPet.app',
    archiveDir,
    now: () => new Date('2026-07-02T12:00:00.000Z'),
    orchestratePackagedAppImpl: ({ archiveDir: runArchiveDir }) => {
      const stderrPath = path.join(runArchiveDir, 'packaged-create-ui-smoke-stderr.txt')
      fs.writeFileSync(stderrPath, 'timed out waiting for packaged create ui smoke evidence\n')
      return {
        runtimeArtifact: null,
        runtimeArtifactPath: path.join(runArchiveDir, 'packaged-create-ui-smoke.json'),
        stdoutPath: path.join(runArchiveDir, 'packaged-create-ui-smoke-stdout.txt'),
        stderrPath,
        userDataDir: '',
        errors: ['timed out waiting for packaged create ui smoke evidence']
      }
    }
  })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /timed out waiting for packaged create ui smoke evidence/)
  assert.equal(fs.existsSync(path.join(archiveDir, 'packaged-create-ui-smoke-summary.json')), true)
})
