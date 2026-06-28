const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  isPackagedCreatorStudioEvidenceEnabled,
  runPackagedCreatorStudioEvidence
} = require('../../src/main/packaged-creator-studio-evidence-runner')

test('isPackagedCreatorStudioEvidenceEnabled only enables the explicit packaged Creator Studio flag', () => {
  assert.equal(isPackagedCreatorStudioEvidenceEnabled({}), false)
  assert.equal(isPackagedCreatorStudioEvidenceEnabled({ OPENPET_PACKAGED_CREATOR_STUDIO_EVIDENCE: '0' }), false)
  assert.equal(isPackagedCreatorStudioEvidenceEnabled({ OPENPET_PACKAGED_CREATOR_STUDIO_EVIDENCE: '1' }), true)
})

test('runPackagedCreatorStudioEvidence writes packaged Creator Studio runtime artifact for discovery command and service health', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-packaged-creator-studio-main-'))
  const outputPath = path.join(tempDir, 'packaged-creator-studio-runtime.json')
  const stdoutPath = path.join(tempDir, 'packaged-creator-studio-stdout.txt')
  const stderrPath = path.join(tempDir, 'packaged-creator-studio-stderr.txt')

  const calls = []
  const pluginService = {
    listPlugins: () => [{
      id: 'openpet.creator-studio',
      enabled: false,
      entries: {
        dashboards: [{ id: 'main', title: 'Creator Studio', url: 'http://127.0.0.1:8794' }],
        services: [{ id: 'studio', title: 'Creator Studio Service', runtime: { status: 'stopped' } }]
      }
    }],
    setEnabled: (pluginId, enabled) => {
      calls.push(['setEnabled', pluginId, enabled])
      return { pluginId, enabled }
    },
    startService: (pluginId, serviceId) => {
      calls.push(['startService', pluginId, serviceId])
      return { ok: true, runtime: { status: 'running' } }
    },
    checkServiceHealth: async (pluginId, serviceId) => {
      calls.push(['checkServiceHealth', pluginId, serviceId])
      return {
        ok: true,
        statusCode: 200,
        runtime: {
          status: 'running',
          health: {
            status: 'healthy',
            url: 'http://127.0.0.1:8794/health'
          }
        }
      }
    },
    runCommand: async (pluginId, commandId, payload) => {
      calls.push(['runCommand', pluginId, commandId, payload])
      return {
        ok: true,
        result: {
          ok: true,
          run: {
            runId: 'run-packaged-creator-1',
            status: 'draft',
            taskStatus: 'ready_for_confirmation',
            generationTask: {
              mode: 'single-action'
            }
          }
        }
      }
    },
    stopService: (pluginId, serviceId) => {
      calls.push(['stopService', pluginId, serviceId])
      return { ok: true, runtime: { status: 'stopped' } }
    }
  }

  let quitCalled = false

  const artifact = await runPackagedCreatorStudioEvidence({
    app: { getAppPath: () => '/Applications/OpenPet.app', quit: () => { quitCalled = true } },
    pluginService,
    env: {
      OPENPET_PACKAGED_CREATOR_STUDIO_EVIDENCE: '1',
      OPENPET_PACKAGED_CREATOR_STUDIO_OUTPUT: outputPath,
      OPENPET_PACKAGED_CREATOR_STUDIO_STDOUT: stdoutPath,
      OPENPET_PACKAGED_CREATOR_STUDIO_STDERR: stderrPath,
      OPENPET_PACKAGED_CREATOR_STUDIO_APP_PATH: 'OpenPet.app',
      OPENPET_PACKAGED_CREATOR_STUDIO_QUIT_DELAY_MS: '0'
    }
  })

  assert.equal(artifact.pluginId, 'openpet.creator-studio')
  assert.equal(artifact.pluginFound, true)
  assert.equal(artifact.pluginEnabledBefore, false)
  assert.deepEqual(artifact.dashboard, {
    present: true,
    id: 'main',
    title: 'Creator Studio',
    url: 'http://127.0.0.1:8794'
  })
  assert.equal(artifact.service.present, true)
  assert.equal(artifact.service.id, 'studio')
  assert.equal(artifact.service.startRequested, true)
  assert.equal(artifact.service.healthOk, true)
  assert.equal(artifact.service.healthStatus, 'healthy')
  assert.equal(artifact.service.statusAfterStop, 'stopped')
  assert.equal(artifact.command.requested, true)
  assert.equal(artifact.command.commandId, 'draft-task')
  assert.equal(artifact.command.ok, true)
  assert.equal(artifact.command.runId, 'run-packaged-creator-1')
  assert.equal(artifact.command.taskStatus, 'ready_for_confirmation')
  assert.equal(artifact.command.mode, 'single-action')
  assert.equal(fs.existsSync(outputPath), true)
  assert.equal(fs.existsSync(stdoutPath), true)
  assert.equal(fs.existsSync(stderrPath), true)
  assert.match(fs.readFileSync(stdoutPath, 'utf-8'), /discovered openpet\.creator-studio/)
  assert.equal(fs.readFileSync(stderrPath, 'utf-8'), '')
  assert.deepEqual(calls, [
    ['setEnabled', 'openpet.creator-studio', true],
    ['startService', 'openpet.creator-studio', 'studio'],
    ['checkServiceHealth', 'openpet.creator-studio', 'studio'],
    ['runCommand', 'openpet.creator-studio', 'draft-task', {
      prompt: '新增一个自定义动作：原地打滚，动作要循环。',
      backend: 'fixture'
    }],
    ['stopService', 'openpet.creator-studio', 'studio']
  ])
  assert.equal(quitCalled, false)
})

test('runPackagedCreatorStudioEvidence records missing bundled Creator Studio conservatively', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-packaged-creator-studio-main-missing-'))
  const outputPath = path.join(tempDir, 'packaged-creator-studio-runtime.json')
  const stderrPath = path.join(tempDir, 'packaged-creator-studio-stderr.txt')

  const artifact = await runPackagedCreatorStudioEvidence({
    app: { getAppPath: () => '/Applications/OpenPet.app', quit: () => {} },
    pluginService: {
      listPlugins: () => []
    },
    env: {
      OPENPET_PACKAGED_CREATOR_STUDIO_EVIDENCE: '1',
      OPENPET_PACKAGED_CREATOR_STUDIO_OUTPUT: outputPath,
      OPENPET_PACKAGED_CREATOR_STUDIO_STDERR: stderrPath,
      OPENPET_PACKAGED_CREATOR_STUDIO_APP_PATH: 'OpenPet.app',
      OPENPET_PACKAGED_CREATOR_STUDIO_QUIT_DELAY_MS: '0'
    }
  })

  assert.equal(artifact.pluginFound, false)
  assert.equal(artifact.command.requested, false)
  assert.equal(artifact.service.startRequested, false)
  assert.match(artifact.error, /Bundled Creator Studio plugin was not found/i)
  assert.match(fs.readFileSync(stderrPath, 'utf-8'), /Bundled Creator Studio plugin was not found/i)
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf-8')).pluginFound, false)
})
