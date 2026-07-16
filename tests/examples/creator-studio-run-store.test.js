const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  GENERATION_COMMAND_TERMINATED_REASON,
  createRun,
  readRun,
  recoverStaleGeneratingRuns,
  resolveRunId,
  writeRun
} = require('../../examples/plugins/creator-studio/lib/run-store')

const makeDataDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-run-store-'))

test('stale generating run recovery preserves evidence and enables retries', () => {
  const dataDir = makeDataDir()
  const run = createRun({
    dataDir,
    input: {
      petName: 'Lease Cat',
      backend: 'provider',
      generationTask: {
        mode: 'full-pet',
        actions: [{ actionId: 'idle', name: 'Idle', motionPrompt: 'idle', frameCount: 1, transparentBackground: true }],
        questions: []
      }
    },
    now: () => '2026-07-15T00:00:00.000Z'
  })
  const checkpointPath = path.join(dataDir, 'runs', run.runId, 'full-pet-action-checkpoints.json')
  fs.writeFileSync(checkpointPath, JSON.stringify({ checkpoints: [{ actionId: 'idle', evidence: 'kept' }] }))
  writeRun({
    dataDir,
    run: {
      ...readRun({ dataDir, runId: run.runId }),
      status: 'generating',
      updatedAt: '2026-07-15T00:00:00.000Z',
      generationLease: {
        commandId: 'run-step',
        startedAt: '2026-07-15T00:00:00.000Z',
        heartbeatAt: '2026-07-15T00:00:00.000Z'
      },
      artifacts: { generatedImage: { outputs: [{ dataRelativePath: 'runs/kept.png' }] } }
    }
  })

  const recovered = recoverStaleGeneratingRuns({
    dataDir,
    now: () => '2026-07-15T00:06:00.000Z'
  })
  const recoveredRun = readRun({ dataDir, runId: run.runId })

  assert.deepEqual(recovered, [run.runId])
  assert.equal(recoveredRun.status, 'failed')
  assert.equal(recoveredRun.error, GENERATION_COMMAND_TERMINATED_REASON)
  assert.equal(recoveredRun.backendStatus.message, GENERATION_COMMAND_TERMINATED_REASON)
  assert.deepEqual(recoveredRun.artifacts.generatedImage.outputs, [{ dataRelativePath: 'runs/kept.png' }])
  assert.equal(JSON.parse(fs.readFileSync(checkpointPath, 'utf-8')).checkpoints[0].evidence, 'kept')
  assert.equal(resolveRunId({ dataDir, runId: run.runId, statuses: ['failed'] }), run.runId)
})

test('fresh generation leases are not recovered while their command is active', () => {
  const dataDir = makeDataDir()
  const run = createRun({
    dataDir,
    input: { petName: 'Active Lease Cat', backend: 'provider' },
    now: () => '2026-07-15T00:00:00.000Z'
  })
  writeRun({
    dataDir,
    run: {
      ...readRun({ dataDir, runId: run.runId }),
      status: 'generating',
      generationLease: {
        commandId: 'run-step',
        startedAt: '2026-07-15T00:00:00.000Z',
        heartbeatAt: '2026-07-15T00:05:30.000Z'
      }
    }
  })

  assert.deepEqual(recoverStaleGeneratingRuns({
    dataDir,
    now: () => '2026-07-15T00:06:00.000Z'
  }), [])
  assert.equal(readRun({ dataDir, runId: run.runId }).status, 'generating')
})
