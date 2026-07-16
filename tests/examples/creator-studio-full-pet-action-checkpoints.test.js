const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  readActionCheckpoints,
  resolveReusableActionResult,
  writeActionCheckpoint
} = require('../../examples/plugins/creator-studio/lib/full-pet-action-checkpoints')

const makeDataDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-action-checkpoints-'))

const createSuccessfulResult = ({ dataDir, runId, actionId = 'idle' }) => {
  const frameDir = path.join(dataDir, 'runs', runId, 'official-row-frames', actionId)
  fs.mkdirSync(frameDir, { recursive: true })
  const framePath = path.join(frameDir, '01.png')
  fs.writeFileSync(framePath, Buffer.from(`${actionId}-frame`))
  return {
    actionId,
    ok: true,
    outputCount: 1,
    model: 'pet-model',
    modelAttempts: [{ model: 'pet-model', ok: true }],
    generationStages: [{ actionId, stage: 'final-image', ok: true }],
    keyframes: [{ actionId, keyframeRole: 'start', quality: { ok: true, score: 80 } }],
    row: {
      actionId,
      sourceRelativePath: `runs/${runId}/frames/base/${actionId}-row/0001.png`,
      quality: 'row-real',
      frames: [{ index: 0, actionId, path: framePath }]
    }
  }
}

test('action checkpoint round-trips a successful row using data-relative hashed frames', () => {
  const dataDir = makeDataDir()
  const runId = 'run-checkpoint-success'
  const result = createSuccessfulResult({ dataDir, runId })

  writeActionCheckpoint({
    dataDir,
    runId,
    result,
    now: () => '2026-07-13T00:00:00.000Z'
  })

  const stored = readActionCheckpoints({ dataDir, runId })
  assert.equal(stored.actions.idle.row.frames[0].relativePath.startsWith('runs/'), true)
  assert.match(stored.actions.idle.row.frames[0].sha256, /^[a-f0-9]{64}$/)
  assert.equal(JSON.stringify(stored).includes(dataDir), false)

  const reusable = resolveReusableActionResult({ dataDir, runId, actionId: 'idle' })
  assert.equal(reusable.ok, true)
  assert.equal(path.isAbsolute(reusable.row.frames[0].path), true)
  assert.equal(fs.existsSync(reusable.row.frames[0].path), true)
})

test('action checkpoint invalidates reuse when a frame changes or disappears', () => {
  const dataDir = makeDataDir()
  const runId = 'run-checkpoint-invalidated'
  const result = createSuccessfulResult({ dataDir, runId })
  writeActionCheckpoint({ dataDir, runId, result })

  fs.writeFileSync(result.row.frames[0].path, Buffer.from('changed'))
  assert.equal(resolveReusableActionResult({ dataDir, runId, actionId: 'idle' }), null)

  writeActionCheckpoint({ dataDir, runId, result: createSuccessfulResult({ dataDir, runId }) })
  fs.rmSync(result.row.frames[0].path)
  assert.equal(resolveReusableActionResult({ dataDir, runId, actionId: 'idle' }), null)
})

test('action checkpoint preserves failure evidence but never reuses failed output', () => {
  const dataDir = makeDataDir()
  const runId = 'run-checkpoint-failure'
  writeActionCheckpoint({
    dataDir,
    runId,
    result: {
      actionId: 'waving',
      ok: false,
      outputCount: 0,
      failureConditions: ['identity-descriptor-distance-high'],
      generationStages: [{ actionId: 'waving', stage: 'action-start-keyframe', ok: false }],
      keyframes: [],
      error: 'identity drift'
    }
  })

  const stored = readActionCheckpoints({ dataDir, runId })
  assert.deepEqual(stored.actions.waving.failureConditions, ['identity-descriptor-distance-high'])
  assert.equal(resolveReusableActionResult({ dataDir, runId, actionId: 'waving' }), null)
})

test('action checkpoint rejects frame paths outside the Creator Studio data directory', () => {
  const dataDir = makeDataDir()
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-action-checkpoint-outside-'))
  const outsidePath = path.join(outsideDir, '01.png')
  fs.writeFileSync(outsidePath, 'outside')

  assert.throws(() => writeActionCheckpoint({
    dataDir,
    runId: 'run-checkpoint-escape',
    result: {
      actionId: 'idle',
      ok: true,
      row: {
        actionId: 'idle',
        quality: 'row-real',
        frames: [{ index: 0, path: outsidePath }]
      }
    }
  }), /data directory/i)
})
