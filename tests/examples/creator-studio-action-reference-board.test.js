const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')
const sharp = require('sharp')

const { createActionReferenceBoard } = require('../../examples/plugins/creator-studio/lib/action-reference-board')

const createTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-action-board-'))

test('action reference board combines anchor grid and source detail into one exact image', async () => {
  const dataDir = createTempDir()
  const anchorGridPath = path.join(dataDir, 'anchor.png')
  const sourceDetailPath = path.join(dataDir, 'source.png')
  const outputPath = path.join(dataDir, 'runs', 'run-1', 'boards', 'idle.png')
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 20, g: 120, b: 220, alpha: 1 } } }).png().toFile(anchorGridPath)
  await sharp({ create: { width: 800, height: 1000, channels: 4, background: { r: 240, g: 180, b: 40, alpha: 1 } } }).png().toFile(sourceDetailPath)

  const result = await createActionReferenceBoard({ anchorGridPath, sourceDetailPath, outputPath, dataDir, metadata: { actionId: 'idle' } })
  const image = await sharp(result.path).metadata()
  assert.equal(image.width, 1536)
  assert.equal(image.height, 1024)
  assert.deepEqual(result.regions.map(({ regionId, x, y, width, height }) => ({ regionId, x, y, width, height })), [
    { regionId: 'anchor-grid', x: 0, y: 0, width: 1024, height: 1024 },
    { regionId: 'source-detail', x: 1024, y: 0, width: 512, height: 1024 }
  ])
  assert.match(result.sha256, /^[a-f0-9]{64}$/)
})

test('action reference board rejects output paths outside dataDir', async () => {
  const dataDir = createTempDir()
  await assert.rejects(() => createActionReferenceBoard({
    anchorGridPath: path.join(dataDir, 'missing-anchor.png'),
    sourceDetailPath: path.join(dataDir, 'missing-source.png'),
    outputPath: path.join(os.tmpdir(), 'escaped-board.png'),
    dataDir
  }), /inside the Creator Studio data directory/)
})
