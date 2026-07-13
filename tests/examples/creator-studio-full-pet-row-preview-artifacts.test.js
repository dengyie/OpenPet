const fs = require('fs')
const os = require('os')
const path = require('path')
const test = require('node:test')
const assert = require('node:assert/strict')
const sharp = require('sharp')

const {
  OFFICIAL_FULL_PET_ROWS
} = require('../../examples/plugins/creator-studio/lib/full-pet-row-contract')
const {
  createOfficialRowPreviewArtifacts
} = require('../../examples/plugins/creator-studio/lib/full-pet-row-preview-artifacts')

const CELL_WIDTH = 192
const CELL_HEIGHT = 208
const ATLAS_WIDTH = 1536
const ATLAS_HEIGHT = 1872

const makeTempDataDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-row-preview-artifacts-'))

const writeFrame = async ({ outputPath, rowIndex, frameIndex }) => {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  await sharp(Buffer.from(
    `<svg width="${CELL_WIDTH}" height="${CELL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${58 + rowIndex}" y="${96 - (frameIndex % 3)}" width="${46 + (frameIndex % 4)}" height="58" fill="#f6b73c"/>
      <rect x="${78 + frameIndex * 3}" y="${74 + (rowIndex % 4)}" width="12" height="${26 + (frameIndex % 5)}" fill="#1c7ed6"/>
      <rect x="${90 - (frameIndex % 2)}" y="150" width="${20 + (rowIndex % 3)}" height="8" fill="#2f9e44"/>
    </svg>`
  ))
    .ensureAlpha()
    .png()
    .toFile(outputPath)
}

const writeOfficialRowFrames = async ({ dataDir }) => {
  const rowFramesByActionId = new Map()
  for (const row of OFFICIAL_FULL_PET_ROWS) {
    const frames = []
    const frameDir = path.join(dataDir, 'runs', 'run-1', 'rows', row.id, 'frames')
    for (let index = 0; index < row.frameCount; index += 1) {
      const framePath = path.join(frameDir, `${String(index + 1).padStart(2, '0')}.png`)
      await writeFrame({ outputPath: framePath, rowIndex: row.row, frameIndex: index })
      frames.push({ index, path: framePath })
    }
    rowFramesByActionId.set(row.id, frames)
  }
  return rowFramesByActionId
}

test('creates contact sheet and gif previews for official row frames', async () => {
  const dataDir = makeTempDataDir()
  const rowFramesByActionId = await writeOfficialRowFrames({ dataDir })
  const outputDir = path.join(dataDir, 'runs', 'run-1', 'qa')

  const result = await createOfficialRowPreviewArtifacts({
    dataDir,
    rowFramesByActionId,
    outputDir
  })

  assert.equal(result.contactSheetRelativePath, 'runs/run-1/qa/full-pet-contact-sheet.png')
  assert.equal(fs.existsSync(result.contactSheetPath), true)
  const contactSheetMetadata = await sharp(result.contactSheetPath).metadata()
  assert.equal(contactSheetMetadata.width, ATLAS_WIDTH)
  assert.equal(contactSheetMetadata.height, ATLAS_HEIGHT)
  assert.equal(result.previews.length, OFFICIAL_FULL_PET_ROWS.length)

  for (const preview of result.previews) {
    const row = OFFICIAL_FULL_PET_ROWS.find((candidate) => candidate.id === preview.actionId)
    assert.ok(row)
    assert.equal(preview.relativePath, `runs/run-1/qa/previews/${row.id}.gif`)
    assert.deepEqual(preview.durations, row.durations)
    assert.equal(preview.frameCount, row.frameCount)
    assert.equal(fs.existsSync(preview.path), true)
    const metadata = await sharp(preview.path, { animated: true }).metadata()
    assert.equal(metadata.width, CELL_WIDTH)
    assert.equal(metadata.pageHeight, CELL_HEIGHT)
    assert.equal(metadata.pages, row.frameCount)
  }

  assert.equal(JSON.stringify(result).includes(dataDir), true)
  assert.equal(JSON.stringify(result.previews.map((preview) => preview.relativePath)).includes(dataDir), false)
})

test('creates a full-size contact sheet but previews only available rows', async () => {
  const dataDir = makeTempDataDir()
  const allRows = await writeOfficialRowFrames({ dataDir })
  const rowFramesByActionId = new Map([['idle', allRows.get('idle')]])
  const outputDir = path.join(dataDir, 'runs', 'run-1', 'qa-partial')

  const result = await createOfficialRowPreviewArtifacts({ dataDir, rowFramesByActionId, outputDir })

  const metadata = await sharp(result.contactSheetPath).metadata()
  assert.equal(metadata.width, ATLAS_WIDTH)
  assert.equal(metadata.height, ATLAS_HEIGHT)
  assert.deepEqual(result.previews.map((preview) => preview.actionId), ['idle'])
})

test('rejects preview artifact output directories outside dataDir', async () => {
  const dataDir = makeTempDataDir()
  const outsideDir = makeTempDataDir()
  const rowFramesByActionId = await writeOfficialRowFrames({ dataDir })

  await assert.rejects(
    createOfficialRowPreviewArtifacts({
      dataDir,
      rowFramesByActionId,
      outputDir: path.join(outsideDir, 'qa')
    }),
    /Official row preview artifact output path escaped/
  )
})

test('rejects preview artifact subdirectories through symlinks escaping dataDir', async (t) => {
  const dataDir = makeTempDataDir()
  const outsideDir = makeTempDataDir()
  const outputDir = path.join(dataDir, 'runs', 'run-1', 'qa')
  const rowFramesByActionId = await writeOfficialRowFrames({ dataDir })
  fs.mkdirSync(outputDir, { recursive: true })
  try {
    fs.symlinkSync(outsideDir, path.join(outputDir, 'previews'))
  } catch (error) {
    t.skip(`Directory symlinks are unavailable: ${error.message}`)
    return
  }

  await assert.rejects(
    createOfficialRowPreviewArtifacts({
      dataDir,
      rowFramesByActionId,
      outputDir
    }),
    /Official row preview artifact output path escaped/
  )
})

test('rejects preview artifact source frame paths outside dataDir', async () => {
  const dataDir = makeTempDataDir()
  const outsideDir = makeTempDataDir()
  const rowFramesByActionId = await writeOfficialRowFrames({ dataDir })
  const outsideFramePath = path.join(outsideDir, 'outside.png')
  await writeFrame({ outputPath: outsideFramePath, rowIndex: 0, frameIndex: 0 })
  rowFramesByActionId.get('idle')[0].path = outsideFramePath

  await assert.rejects(
    createOfficialRowPreviewArtifacts({
      dataDir,
      rowFramesByActionId,
      outputDir: path.join(dataDir, 'runs', 'run-1', 'qa')
    }),
    /Official row preview frame path escaped/
  )
})
