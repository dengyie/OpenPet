const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const sharp = require('sharp')

const { buildAnchorReferenceBoard } = require('../../examples/plugins/creator-studio/lib/anchor-reference-board')

const makeDataDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-anchor-board-'))

const writeSourceImage = async (filePath) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  await sharp({
    create: {
      width: 240,
      height: 260,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
    .composite([{
      input: Buffer.from(`
        <svg width="240" height="260" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="120" cy="150" rx="70" ry="82" fill="#d8a24a"/>
          <circle cx="120" cy="78" r="54" fill="#e8b75f"/>
          <circle cx="84" cy="40" r="20" fill="#d8a24a"/>
          <circle cx="156" cy="40" r="20" fill="#d8a24a"/>
          <ellipse cx="99" cy="78" rx="8" ry="10" fill="#3f8a42"/>
          <ellipse cx="141" cy="78" rx="8" ry="10" fill="#3f8a42"/>
          <ellipse cx="120" cy="168" rx="36" ry="54" fill="#f3dfbd"/>
        </svg>
      `),
      left: 0,
      top: 0
    }])
    .png()
    .toFile(filePath)
}

test('anchor reference board creates one 1024 conditioning image and metadata', async () => {
  const dataDir = makeDataDir()
  const sourcePath = path.join(dataDir, 'inputs/source/cat.png')
  await writeSourceImage(sourcePath)

  const result = await buildAnchorReferenceBoard({
    dataDir,
    runId: 'run-anchor',
    sourceReferences: [{
      path: sourcePath,
      fileName: 'cat.png',
      relativePath: 'inputs/source/cat.png',
      role: 'canonical-reference'
    }],
    characterBrief: 'Golden British Shorthair with green eyes.'
  })

  assert.equal(result.role, 'composite-reference-board')
  assert.equal(result.width, 1024)
  assert.equal(result.height, 1024)
  assert.equal(result.sourceCount, 1)
  assert.equal(result.relativePath, 'runs/run-anchor/inputs/anchors/composite-reference-board.png')
  assert.equal(result.metadataRelativePath, 'runs/run-anchor/inputs/anchors/composite-reference-board.json')
  assert.equal(fs.existsSync(result.path), true)
  assert.equal(fs.existsSync(result.metadataPath), true)

  const metadata = JSON.parse(fs.readFileSync(result.metadataPath, 'utf-8'))
  assert.equal(metadata.role, 'composite-reference-board')
  assert.equal(metadata.sourceCount, 1)
  assert.equal(metadata.characterBrief, 'Golden British Shorthair with green eyes.')
  assert.deepEqual(metadata.sources.map((source) => source.role), ['canonical-reference'])

  const imageMetadata = await sharp(result.path).metadata()
  assert.equal(imageMetadata.width, 1024)
  assert.equal(imageMetadata.height, 1024)
})

test('anchor reference board rejects output paths outside the Creator Studio data directory', async () => {
  const dataDir = makeDataDir()
  const sourcePath = path.join(dataDir, 'inputs/source/cat.png')
  await writeSourceImage(sourcePath)

  await assert.rejects(
    () => buildAnchorReferenceBoard({
      dataDir,
      runId: 'run-anchor',
      sourceReferences: [{ path: sourcePath, fileName: 'cat.png' }],
      characterBrief: 'Golden cat.',
      outputRelativeDir: '../escape'
    }),
    /Anchor reference board output path escaped the Creator Studio data directory/
  )
})
