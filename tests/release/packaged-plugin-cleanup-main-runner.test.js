const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  isPackagedCleanupEvidenceEnabled,
  runPackagedPluginCleanupEvidence
} = require('../../src/main/packaged-plugin-cleanup-evidence-runner')

test('isPackagedCleanupEvidenceEnabled only enables the explicit packaged cleanup flag', () => {
  assert.equal(isPackagedCleanupEvidenceEnabled({}), false)
  assert.equal(isPackagedCleanupEvidenceEnabled({ OPENPET_PACKAGED_PLUGIN_CLEANUP_EVIDENCE: '0' }), false)
  assert.equal(isPackagedCleanupEvidenceEnabled({ OPENPET_PACKAGED_PLUGIN_CLEANUP_EVIDENCE: '1' }), true)
})

test('runPackagedPluginCleanupEvidence writes runtime artifact and transcripts for observed packaged cleanup flows', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-packaged-cleanup-main-'))
  const outputPath = path.join(tempDir, 'packaged-plugin-cleanup-runtime.json')
  const stdoutPath = path.join(tempDir, 'packaged-plugin-cleanup-stdout.txt')
  const stderrPath = path.join(tempDir, 'packaged-plugin-cleanup-stderr.txt')

  const logs = []
  const pluginService = {
    setEnabled: (pluginId, enabled) => {
      logs.push({
        pluginId,
        level: 'info',
        message: enabled ? 'Plugin enabled' : 'Plugin disabled',
        timestamp: '2026-06-18T20:00:00.000Z'
      })
    },
    runSetup: async (pluginId, setupId) => {
      logs.push({ pluginId, commandId: `setup:${setupId}`, level: 'info', message: 'Setup started', timestamp: '2026-06-18T20:00:00.100Z' })
      logs.push({ pluginId, commandId: `setup:${setupId}`, level: 'error', message: 'Setup stopped', timestamp: '2026-06-18T20:00:00.200Z' })
      return { ok: true }
    },
    runCommand: async (pluginId, commandId) => {
      logs.push({ pluginId, commandId, level: 'info', message: 'Command started', timestamp: '2026-06-18T20:00:00.300Z' })
      logs.push({ pluginId, commandId, level: 'error', message: 'Command stop requested', timestamp: '2026-06-18T20:00:00.350Z' })
      logs.push({ pluginId, commandId, level: 'error', message: 'Command stopped', timestamp: '2026-06-18T20:00:00.400Z' })
      return { ok: true }
    },
    startService: (pluginId, serviceId) => {
      logs.push({ pluginId, commandId: `service:${serviceId}`, level: 'info', message: 'Service started', timestamp: '2026-06-18T20:00:00.500Z' })
      return { ok: true }
    },
    stopService: (pluginId, serviceId) => {
      logs.push({ pluginId, commandId: `service:${serviceId}`, level: 'info', message: 'Service stop requested', timestamp: '2026-06-18T20:00:00.550Z' })
      logs.push({ pluginId, commandId: `service:${serviceId}`, level: 'info', message: 'Service stopped', timestamp: '2026-06-18T20:00:00.650Z' })
      return { ok: true }
    },
    getLogs: () => logs
  }
  const pluginInstallService = {
    inspectPluginPackage: () => ({ selectionId: 'selection-1' }),
    installPlugin: () => ({ pluginId: 'openpet.cleanup-evidence-fixture' })
  }
  let quitCalled = false

  const artifact = await runPackagedPluginCleanupEvidence({
    app: { getAppPath: () => '/Applications/OpenPet.app', quit: () => { quitCalled = true } },
    pluginInstallService,
    pluginService,
    env: {
      OPENPET_PACKAGED_PLUGIN_CLEANUP_EVIDENCE: '1',
      OPENPET_PACKAGED_PLUGIN_CLEANUP_OUTPUT: outputPath,
      OPENPET_PACKAGED_PLUGIN_CLEANUP_PLUGIN_SOURCE: '/tmp/cleanup-evidence-plugin',
      OPENPET_PACKAGED_PLUGIN_CLEANUP_APP_PATH: 'OpenPet.app',
      OPENPET_PACKAGED_PLUGIN_CLEANUP_STDOUT: stdoutPath,
      OPENPET_PACKAGED_PLUGIN_CLEANUP_STDERR: stderrPath,
      OPENPET_PACKAGED_PLUGIN_CLEANUP_QUIT_DELAY_MS: '0'
    }
  })

  assert.equal(artifact.pluginId, 'openpet.cleanup-evidence-fixture')
  assert.equal(artifact.setup.exitConfirmed, true)
  assert.equal(artifact.setup.treeCleanupAttempted, false)
  assert.equal(artifact.command.exitConfirmed, true)
  assert.equal(artifact.command.treeCleanupAttempted, false)
  assert.equal(artifact.service.exitConfirmed, true)
  assert.equal(artifact.service.treeCleanupAttempted, false)
  assert.equal(fs.existsSync(outputPath), true)
  assert.equal(fs.existsSync(stdoutPath), true)
  assert.equal(fs.existsSync(stderrPath), true)
  assert.match(fs.readFileSync(stdoutPath, 'utf-8'), /installed openpet\.cleanup-evidence-fixture/)
  assert.equal(fs.readFileSync(stderrPath, 'utf-8'), '')
  assert.equal(quitCalled, false)
})

test('runPackagedPluginCleanupEvidence records packaged cleanup failures conservatively', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-packaged-cleanup-main-fail-'))
  const outputPath = path.join(tempDir, 'packaged-plugin-cleanup-runtime.json')
  const stderrPath = path.join(tempDir, 'packaged-plugin-cleanup-stderr.txt')

  const artifact = await runPackagedPluginCleanupEvidence({
    app: { getAppPath: () => '/Applications/OpenPet.app', quit: () => {} },
    pluginInstallService: {
      inspectPluginPackage: () => {
        throw new Error('plugin review failed')
      }
    },
    pluginService: {
      getLogs: () => []
    },
    env: {
      OPENPET_PACKAGED_PLUGIN_CLEANUP_EVIDENCE: '1',
      OPENPET_PACKAGED_PLUGIN_CLEANUP_OUTPUT: outputPath,
      OPENPET_PACKAGED_PLUGIN_CLEANUP_PLUGIN_SOURCE: '/tmp/cleanup-evidence-plugin',
      OPENPET_PACKAGED_PLUGIN_CLEANUP_APP_PATH: 'OpenPet.app',
      OPENPET_PACKAGED_PLUGIN_CLEANUP_STDERR: stderrPath,
      OPENPET_PACKAGED_PLUGIN_CLEANUP_QUIT_DELAY_MS: '0'
    }
  })

  assert.equal(artifact.error, 'plugin review failed')
  assert.equal(artifact.setup.requested, false)
  assert.match(fs.readFileSync(stderrPath, 'utf-8'), /plugin review failed/)
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf-8')).error, 'plugin review failed')
})
