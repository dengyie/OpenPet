const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')
const sharp = require('sharp')

const { createCharacterAnchorGrid } = require('../../examples/plugins/creator-studio/lib/character-anchor-grid')
const { getSpriteLayout } = require('../../examples/plugins/creator-studio/lib/action-sheet-layout')

const createTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-anchor-grid-'))

test('character anchor grid repeats one accepted master into exact used cells', async () => {
  const dataDir = createTempDir()
  const masterPath = path.join(dataDir, 'master.png')
  const outputPath = path.join(dataDir, 'runs', 'run-1', 'anchors', '2x2.png')
  await sharp({ create: { width: 200, height: 300, channels: 4, background: { r: 220, g: 40, b: 60, alpha: 1 } } }).png().toFile(masterPath)

  const result = await createCharacterAnchorGrid({
    masterPath,
    layout: getSpriteLayout(4),
    outputPath,
    dataDir,
    planRevision: 1
  })

  const metadata = await sharp(result.path).metadata()
  assert.equal(metadata.width, 1024)
  assert.equal(metadata.height, 1024)
  assert.equal(result.regions.length, 4)
  assert.deepEqual(result.regions.map(({ x, y, width, height }) => ({ x, y, width, height })), [
    { x: 0, y: 0, width: 512, height: 512 },
    { x: 512, y: 0, width: 512, height: 512 },
    { x: 0, y: 512, width: 512, height: 512 },
    { x: 512, y: 512, width: 512, height: 512 }
  ])
  assert.match(result.sha256, /^[a-f0-9]{64}$/)
  assert.equal(path.isAbsolute(result.relativePath), false)
})
