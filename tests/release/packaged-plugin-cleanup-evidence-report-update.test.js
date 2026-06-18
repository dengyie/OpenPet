const { test } = require('node:test')
const assert = require('node:assert')

const {
  createPluginCleanupEvidenceReport
} = require('../../scripts/create-plugin-cleanup-evidence-report')
const {
  mapPackagedCleanupEvidence
} = require('../../scripts/update-packaged-plugin-cleanup-evidence-report')

const findCheck = (report, checkId) => report.checks.find((check) => check.id === checkId)

const createReport = () => createPluginCleanupEvidenceReport({
  platform: 'darwin',
  arch: 'arm64',
  nodeVersion: 'v22.0.0',
  hostname: () => 'packaged-cleanup-host',
  env: { RUNNER_NAME: 'packaged cleanup mapper test' },
  now: () => new Date('2026-06-18T18:00:00.000Z'),
  pluginId: 'openpet.cleanup-evidence-fixture',
  hostApp: 'OpenPet.app',
  notes: 'Packaged cleanup mapper fixture'
})

const completeRuntimeArtifact = () => ({
  schemaVersion: 1,
  generatedAt: '2026-06-18T18:00:00.000Z',
  pluginId: 'openpet.cleanup-evidence-fixture',
  hostApp: 'OpenPet.app',
  setup: {
    requested: true,
    stopRequested: true,
    exitConfirmed: true,
    treeCleanupAttempted: false,
    transcriptPath: '/tmp/setup.txt'
  },
  command: {
    requested: true,
    stopRequested: true,
    exitConfirmed: true,
    treeCleanupAttempted: false,
    transcriptPath: '/tmp/command.txt'
  },
  service: {
    requested: true,
    stopRequested: true,
    exitConfirmed: true,
    processGroupCleanupAttempted: true,
    treeCleanupAttempted: false,
    forceStopAttempted: false,
    transcriptPath: '/tmp/service.txt'
  }
})

test('maps complete packaged cleanup runtime evidence into cleanup report checks', () => {
  const updated = mapPackagedCleanupEvidence({
    report: createReport(),
    runtimeArtifact: completeRuntimeArtifact()
  })

  assert.equal(findCheck(updated, 'setup-exit-confirmed-stop').status, 'pass')
  assert.equal(findCheck(updated, 'setup-tree-fallback-cleanup').status, 'pending')
  assert.equal(findCheck(updated, 'command-exit-confirmed-stop').status, 'pass')
  assert.equal(findCheck(updated, 'command-tree-fallback-cleanup').status, 'pending')
  assert.equal(findCheck(updated, 'service-exit-confirmed-stop').status, 'pass')
  assert.equal(findCheck(updated, 'service-process-group-cleanup').status, 'pass')
  assert.equal(findCheck(updated, 'service-tree-fallback-cleanup').status, 'pending')
  assert.equal(findCheck(updated, 'service-force-stop').status, 'pending')
  assert.match(findCheck(updated, 'service-process-group-cleanup').evidence, /OpenPet\.app/)
})

test('maps explicit packaged cleanup fallback and force-stop evidence when observed', () => {
  const artifact = completeRuntimeArtifact()
  artifact.setup.treeCleanupAttempted = true
  artifact.command.treeCleanupAttempted = true
  artifact.service.treeCleanupAttempted = true
  artifact.service.forceStopAttempted = true

  const updated = mapPackagedCleanupEvidence({
    report: createReport(),
    runtimeArtifact: artifact
  })

  assert.equal(findCheck(updated, 'setup-tree-fallback-cleanup').status, 'pass')
  assert.equal(findCheck(updated, 'command-tree-fallback-cleanup').status, 'pass')
  assert.equal(findCheck(updated, 'service-tree-fallback-cleanup').status, 'pass')
  assert.equal(findCheck(updated, 'service-force-stop').status, 'pass')
  assert.match(findCheck(updated, 'service-force-stop').evidence, /OpenPet\.app/)
})

test('keeps packaged cleanup checks pending when specific behavior was not observed', () => {
  const artifact = completeRuntimeArtifact()
  artifact.setup.treeCleanupAttempted = false
  artifact.command.treeCleanupAttempted = false
  artifact.service.processGroupCleanupAttempted = false
  artifact.service.treeCleanupAttempted = false
  artifact.service.forceStopAttempted = false

  const updated = mapPackagedCleanupEvidence({
    report: createReport(),
    runtimeArtifact: artifact
  })

  assert.equal(findCheck(updated, 'service-force-stop').status, 'pending')
  assert.match(findCheck(updated, 'service-force-stop').notes, /not observed in this packaged run/i)
  assert.equal(findCheck(updated, 'setup-tree-fallback-cleanup').status, 'pending')
  assert.equal(findCheck(updated, 'command-tree-fallback-cleanup').status, 'pending')
  assert.equal(findCheck(updated, 'service-process-group-cleanup').status, 'pending')
})

test('rejects packaged cleanup runtime artifacts that pre-claim readiness', () => {
  assert.throws(
    () => mapPackagedCleanupEvidence({
      report: createReport(),
      runtimeArtifact: { ...completeRuntimeArtifact(), cleanupReady: true }
    }),
    /must not claim cleanupReady/i
  )
})
