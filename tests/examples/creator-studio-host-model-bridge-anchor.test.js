const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { resolveRunReferenceImages } = require('../../examples/plugins/creator-studio/lib/host-model-bridge')

const makeDataDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-host-anchor-'))

const writeReferenceFile = (dataDir, relativePath) => {
  const filePath = path.join(dataDir, relativePath)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, 'reference')
  return filePath
}

const createRunWithAnchors = (dataDir) => {
  const runId = 'run-anchor'
  writeReferenceFile(dataDir, 'runs/run-anchor/inputs/references/canonical-reference.png')
  writeReferenceFile(dataDir, 'runs/run-anchor/inputs/anchors/composite-reference-board.png')
  writeReferenceFile(dataDir, 'runs/run-anchor/anchors/character-anchor.png')
  writeReferenceFile(dataDir, 'runs/run-anchor/anchors/actions/waving-anchor.png')
  writeReferenceFile(dataDir, 'runs/run-anchor/inputs/anchors/actions/waving-final-reference-board.png')
  return {
    runId,
    input: {
      referenceImage: {
        relativePath: 'runs/run-anchor/inputs/references/canonical-reference.png',
        fileName: 'canonical-reference.png',
        metadataRelativePath: 'runs/run-anchor/inputs/references/reference.json',
        contentHash: 'original-sha'
      }
    },
    artifacts: {
      anchorReferences: {
        version: 1,
        sourcePriority: 'image-first',
        compositeBoard: {
          relativePath: 'runs/run-anchor/inputs/anchors/composite-reference-board.png',
          metadataRelativePath: 'runs/run-anchor/inputs/anchors/composite-reference-board.json',
          role: 'composite-reference-board'
        },
        characterAnchor: {
          relativePath: 'runs/run-anchor/anchors/character-anchor.png',
          promptRelativePath: 'runs/run-anchor/prompts/anchors/character-anchor.md',
          role: 'character-anchor'
        },
        actionAnchors: [{
          actionId: 'waving',
          relativePath: 'runs/run-anchor/anchors/actions/waving-anchor.png',
          promptRelativePath: 'runs/run-anchor/prompts/anchors/actions/waving-anchor.md',
          role: 'action-anchor'
        }],
        finalActionBoards: [{
          actionId: 'waving',
          relativePath: 'runs/run-anchor/inputs/anchors/actions/waving-final-reference-board.png',
          metadataRelativePath: 'runs/run-anchor/inputs/anchors/actions/waving-final-reference-board.json',
          role: 'final-action-reference-board'
        }]
      }
    }
  }
}

test('final action generation uses the matching final action board as the only reference image', () => {
  const dataDir = makeDataDir()
  const run = createRunWithAnchors(dataDir)

  const references = resolveRunReferenceImages({
    dataDir,
    run,
    stage: 'final',
    actionId: 'waving'
  })

  assert.equal(references.length, 1)
  assert.equal(references[0].role, 'final-action-reference-board')
  assert.equal(references[0].relativePath, 'runs/run-anchor/inputs/anchors/actions/waving-final-reference-board.png')
  assert.equal(references[0].fileName, 'waving-final-reference-board.png')
})

test('final action generation falls back to the action anchor when final action board is unavailable', () => {
  const dataDir = makeDataDir()
  const run = createRunWithAnchors(dataDir)
  run.artifacts.anchorReferences.finalActionBoards = []

  const references = resolveRunReferenceImages({
    dataDir,
    run,
    stage: 'final',
    actionId: 'waving'
  })

  assert.equal(references.length, 1)
  assert.equal(references[0].role, 'action-anchor')
  assert.equal(references[0].relativePath, 'runs/run-anchor/anchors/actions/waving-anchor.png')
})

test('reference resolver skips stale anchor records whose local files are missing', () => {
  const dataDir = makeDataDir()
  const run = createRunWithAnchors(dataDir)
  fs.unlinkSync(path.join(dataDir, run.artifacts.anchorReferences.finalActionBoards[0].relativePath))

  const references = resolveRunReferenceImages({
    dataDir,
    run,
    stage: 'final',
    actionId: 'waving'
  })

  assert.equal(references.length, 1)
  assert.equal(references[0].role, 'action-anchor')
  assert.equal(references[0].relativePath, 'runs/run-anchor/anchors/actions/waving-anchor.png')
})

test('character anchor generation uses the composite board as the only reference image', () => {
  const dataDir = makeDataDir()
  const run = createRunWithAnchors(dataDir)

  const references = resolveRunReferenceImages({
    dataDir,
    run,
    stage: 'character-anchor'
  })

  assert.equal(references.length, 1)
  assert.equal(references[0].role, 'composite-reference-board')
  assert.equal(references[0].relativePath, 'runs/run-anchor/inputs/anchors/composite-reference-board.png')
})

test('action anchor generation uses the character anchor as the only reference image', () => {
  const dataDir = makeDataDir()
  const run = createRunWithAnchors(dataDir)

  const references = resolveRunReferenceImages({
    dataDir,
    run,
    stage: 'action-anchor',
    actionId: 'waving'
  })

  assert.equal(references.length, 1)
  assert.equal(references[0].role, 'character-anchor')
  assert.equal(references[0].relativePath, 'runs/run-anchor/anchors/character-anchor.png')
})

test('reference resolver falls back to original reference when anchors are unavailable', () => {
  const dataDir = makeDataDir()
  const run = createRunWithAnchors(dataDir)
  run.artifacts.anchorReferences = null

  const references = resolveRunReferenceImages({
    dataDir,
    run,
    stage: 'final',
    actionId: 'waving'
  })

  assert.equal(references.length, 1)
  assert.equal(references[0].role, 'canonical-reference')
  assert.equal(references[0].relativePath, 'runs/run-anchor/inputs/references/canonical-reference.png')
})

test('reference resolver rejects anchor paths that escape through bare parent segments', () => {
  const dataDir = makeDataDir()
  const run = createRunWithAnchors(dataDir)
  run.artifacts.anchorReferences.actionAnchors[0].relativePath = '..'
  run.artifacts.anchorReferences.finalActionBoards[0].relativePath = '..'
  run.artifacts.anchorReferences.characterAnchor.relativePath = '..'
  run.artifacts.anchorReferences.compositeBoard.relativePath = '..'

  const references = resolveRunReferenceImages({
    dataDir,
    run,
    stage: 'final',
    actionId: 'waving'
  })

  assert.equal(references.length, 1)
  assert.equal(references[0].role, 'canonical-reference')
  assert.equal(references[0].relativePath, 'runs/run-anchor/inputs/references/canonical-reference.png')
})

test('reference resolver rejects anchor symlinks that escape the data directory', () => {
  const dataDir = makeDataDir()
  const run = createRunWithAnchors(dataDir)
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-host-anchor-outside-'))
  const outsidePath = path.join(outsideDir, 'outside.png')
  fs.writeFileSync(outsidePath, 'outside reference')
  const escapedRelativePath = 'runs/run-anchor/anchors/actions/escaped-anchor.png'
  const escapedPath = path.join(dataDir, escapedRelativePath)
  fs.unlinkSync(path.join(dataDir, run.artifacts.anchorReferences.finalActionBoards[0].relativePath))
  fs.unlinkSync(path.join(dataDir, run.artifacts.anchorReferences.actionAnchors[0].relativePath))
  fs.symlinkSync(outsidePath, escapedPath)
  run.artifacts.anchorReferences.actionAnchors[0].relativePath = escapedRelativePath

  const references = resolveRunReferenceImages({
    dataDir,
    run,
    stage: 'final',
    actionId: 'waving'
  })

  assert.equal(references.length, 1)
  assert.equal(references[0].role, 'character-anchor')
  assert.equal(references[0].relativePath, 'runs/run-anchor/anchors/character-anchor.png')
})

test('reference resolver rejects a recorded source image after its sha256 content changes', () => {
  const dataDir = makeDataDir()
  const run = createRunWithAnchors(dataDir)
  const sourcePath = path.join(dataDir, run.input.referenceImage.relativePath)
  run.artifacts.anchorReferences = null
  run.input.referenceImage.contentHash = require('node:crypto')
    .createHash('sha256')
    .update(fs.readFileSync(sourcePath))
    .digest('hex')
  fs.writeFileSync(sourcePath, 'replaced reference')

  const references = resolveRunReferenceImages({
    dataDir,
    run,
    stage: 'final',
    actionId: 'waving'
  })

  assert.deepEqual(references, [])
})
