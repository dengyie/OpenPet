const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  isPackagedCreateUiSmokeEnabled,
  runPackagedCreateUiSmoke
} = require('../../src/main/packaged-create-ui-smoke-runner')

test('isPackagedCreateUiSmokeEnabled only enables the explicit packaged Create UI flag', () => {
  assert.equal(isPackagedCreateUiSmokeEnabled({}), false)
  assert.equal(isPackagedCreateUiSmokeEnabled({ OPENPET_PACKAGED_CREATE_UI_SMOKE: '0' }), false)
  assert.equal(isPackagedCreateUiSmokeEnabled({ OPENPET_PACKAGED_CREATE_UI_SMOKE: '1' }), true)
})

test('runPackagedCreateUiSmoke writes a packaged Create UI artifact for non-demo readiness gating', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-packaged-create-ui-main-'))
  const outputPath = path.join(tempDir, 'packaged-create-ui-smoke.json')
  const stdoutPath = path.join(tempDir, 'packaged-create-ui-smoke-stdout.txt')
  const stderrPath = path.join(tempDir, 'packaged-create-ui-smoke-stderr.txt')

  const artifact = await runPackagedCreateUiSmoke({
    app: { getAppPath: () => '/Applications/OpenPet.app', quit: () => {} },
    openControlCenter: () => ({ id: 'control-center-window' }),
    driveControlCenterImpl: async () => ({
      controlCenter: {
        opened: true,
        createTabActivated: true,
        pluginsTabActivated: true
      },
      initialCreate: {
        visible: true,
        providerReady: false,
        providerText: 'Image Provider not ready Go to AI -> 模型 Provider -> 图片模型',
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
        providerText: 'Image Provider not ready Go to AI -> 模型 Provider -> 图片模型',
        providerCode: 'missing_api_key',
        providerModel: 'gpt-image-2',
        creatorStudioReady: true,
        creatorStudioText: '',
        generateButtonDisabled: true
      }
    }),
    env: {
      OPENPET_PACKAGED_CREATE_UI_SMOKE: '1',
      OPENPET_PACKAGED_CREATE_UI_SMOKE_OUTPUT: outputPath,
      OPENPET_PACKAGED_CREATE_UI_SMOKE_STDOUT: stdoutPath,
      OPENPET_PACKAGED_CREATE_UI_SMOKE_STDERR: stderrPath,
      OPENPET_PACKAGED_CREATE_UI_SMOKE_APP_PATH: 'OpenPet.app',
      OPENPET_PACKAGED_CREATE_UI_SMOKE_QUIT_DELAY_MS: '0'
    }
  })

  assert.equal(artifact.controlCenter.opened, true)
  assert.equal(artifact.initialCreate.providerReady, false)
  assert.equal(artifact.initialCreate.creatorStudioReady, false)
  assert.equal(artifact.afterStudioStart.pluginEnabled, true)
  assert.equal(artifact.afterStudioStart.serviceStarted, true)
  assert.equal(artifact.afterStudioStart.creatorStudioReady, true)
  assert.equal(fs.existsSync(outputPath), true)
  assert.equal(fs.existsSync(stdoutPath), true)
  assert.equal(fs.existsSync(stderrPath), true)
  assert.match(fs.readFileSync(stdoutPath, 'utf-8'), /packaged create ui smoke completed/i)
  assert.equal(fs.readFileSync(stderrPath, 'utf-8'), '')
})

test('runPackagedCreateUiSmoke records failures conservatively', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-packaged-create-ui-main-fail-'))
  const outputPath = path.join(tempDir, 'packaged-create-ui-smoke.json')
  const stderrPath = path.join(tempDir, 'packaged-create-ui-smoke-stderr.txt')

  const artifact = await runPackagedCreateUiSmoke({
    app: { getAppPath: () => '/Applications/OpenPet.app', quit: () => {} },
    openControlCenter: () => ({ id: 'unused' }),
    driveControlCenterImpl: async () => {
      throw new Error('Create pane was not visible')
    },
    env: {
      OPENPET_PACKAGED_CREATE_UI_SMOKE: '1',
      OPENPET_PACKAGED_CREATE_UI_SMOKE_OUTPUT: outputPath,
      OPENPET_PACKAGED_CREATE_UI_SMOKE_STDERR: stderrPath,
      OPENPET_PACKAGED_CREATE_UI_SMOKE_APP_PATH: 'OpenPet.app',
      OPENPET_PACKAGED_CREATE_UI_SMOKE_QUIT_DELAY_MS: '0'
    }
  })

  assert.match(artifact.error, /Create pane was not visible/i)
  assert.match(fs.readFileSync(stderrPath, 'utf-8'), /Create pane was not visible/i)
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf-8')).controlCenter.opened, false)
})
