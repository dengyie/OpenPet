const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const sharp = require('sharp')

const {
  buildHostGeneratedActionOutput,
  persistGeneratedImageAttempt
} = require('../../examples/plugins/creator-studio/lib/backend-runner')

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

test('backend runner rejects host generated action output before review when QA fails', async () => {
  const dataDir = makeDataDir()
  const runId = 'run-action-qa-fail'
  const sourceRelativePath = `runs/${runId}/frames/base/static-one-frame-keyframe-row/0001.png`
  const sourcePath = path.join(dataDir, sourceRelativePath)
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true })
  const cellWidth = 256
  const cellHeight = 256
  const staticFrameSvg = '<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg"><circle cx="128" cy="96" r="48" fill="#e7b65f"/><ellipse cx="128" cy="165" rx="56" ry="60" fill="#d7a14b"/></svg>'
  await sharp({
    create: {
      width: cellWidth * 3,
      height: cellHeight * 2,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(Array.from({ length: 6 }, (_entry, index) => ({
      input: Buffer.from(staticFrameSvg),
      left: (index % 3) * cellWidth,
      top: Math.floor(index / 3) * cellHeight
    })))
    .png()
    .toFile(sourcePath)

  const run = {
    runId,
    status: 'generating',
    currentStep: 'generate',
    updatedAt: '2026-07-08T00:00:00.000Z',
    artifacts: {},
    input: {
      petName: 'QA Gate Cat',
      prompt: 'Generate one frame only, which should fail motion QA.'
    },
    generationTask: {
      mode: 'single-action',
      actions: [{
        actionId: 'static-row',
        name: 'Static Row',
        frameCount: 6,
        loop: false
      }]
    }
  }

  await assert.rejects(
    () => buildHostGeneratedActionOutput({
      dataDir,
      run,
      generationResult: {
        backend: 'provider',
        model: 'gpt-image-2',
        outputs: [{ dataRelativePath: sourceRelativePath, mimeType: 'image/png' }],
        keyframeSpriteRow: {
          ok: true,
          actionId: 'static-row',
          outputRelativePath: sourceRelativePath,
          referenceBoard: {
            role: 'keyframe-action-reference-board',
            relativePath: `runs/${runId}/inputs/keyframes/actions/static-row-reference-board.png`
          }
        }
      },
      now: () => '2026-07-08T00:01:00.000Z'
    }),
    /Action frame QA must pass before review/
  )

  const qaPath = path.join(dataDir, `runs/${runId}/qa/action-frame-validation.json`)
  const qa = JSON.parse(fs.readFileSync(qaPath, 'utf-8'))
  assert.equal(qa.ok, false)
  assert.equal(qa.extraction.mode, 'provider-keyframe-row')
  assert.match(qa.errors.join('\n'), /action_repeated_static|action_motion_below_minimum/)
})
