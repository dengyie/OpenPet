const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { persistGeneratedImageAttempt } = require('../../examples/plugins/creator-studio/lib/backend-runner')

const makeDataDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-backend-anchor-'))

const writeRun = ({ dataDir, run }) => {
  const runDir = path.join(dataDir, 'runs', run.runId)
  fs.mkdirSync(runDir, { recursive: true })
  fs.writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify(run, null, 2)}\n`)
}

test('backend runner persists anchor references as first-class run artifacts', () => {
  const dataDir = makeDataDir()
  const run = {
    runId: 'run-anchor-artifacts',
    status: 'generating',
    updatedAt: '2026-07-08T00:00:00.000Z',
    artifacts: {}
  }
  const anchorReferences = {
    version: 1,
    sourcePriority: 'image-first',
    compositeBoard: {
      role: 'composite-reference-board',
      relativePath: 'runs/run-anchor-artifacts/inputs/anchors/composite-reference-board.png'
    },
    characterAnchor: {
      role: 'character-anchor',
      relativePath: 'runs/run-anchor-artifacts/anchors/character-anchor/0001.png'
    },
    actionAnchors: [{
      actionId: 'waving',
      role: 'action-anchor',
      relativePath: 'runs/run-anchor-artifacts/anchors/actions/waving-anchor/0001.png'
    }]
  }
  writeRun({ dataDir, run })

  const nextRun = persistGeneratedImageAttempt({
    dataDir,
    run,
    generationResult: {
      backend: 'provider',
      model: 'gpt-image-2',
      outputs: [],
      anchorReferences
    },
    now: () => '2026-07-08T00:01:00.000Z'
  })

  assert.deepEqual(nextRun.artifacts.anchorReferences, anchorReferences)
  assert.deepEqual(nextRun.artifacts.generatedImage.anchorReferences, anchorReferences)

  const storedRun = JSON.parse(fs.readFileSync(path.join(dataDir, 'runs', run.runId, 'run.json'), 'utf-8'))
  assert.deepEqual(storedRun.artifacts.anchorReferences, anchorReferences)
})
