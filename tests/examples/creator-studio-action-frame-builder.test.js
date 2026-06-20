const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const test = require('node:test')
const sharp = require('sharp')
const { buildActionFramesFromGeneratedImage } = require('../../examples/plugins/creator-studio/lib/action-frame-builder')

const makeDataDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-action-frames-'))

const createSourcePng = async (filePath) => {
  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{
      input: Buffer.from('<svg width="256" height="256"><circle cx="128" cy="128" r="96" fill="#ff9f1c"/></svg>'),
      left: 128,
      top: 128
    }])
    .png()
    .toFile(filePath)
}

test('action frame builder creates ordered transparent frames and QA evidence', async () => {
  const dataDir = makeDataDir()
  const sourceDir = path.join(dataDir, 'runs/demo/frames/base')
  const qaDir = path.join(dataDir, 'runs/demo/qa')
  fs.mkdirSync(sourceDir, { recursive: true })
  const sourcePath = path.join(sourceDir, '0001.png')
  await createSourcePng(sourcePath)

  const result = await buildActionFramesFromGeneratedImage({
    dataDir,
    generationResult: {
      outputs: [{ dataRelativePath: 'runs/demo/frames/base/0001.png', mimeType: 'image/png' }]
    },
    action: {
      actionId: 'shy-spin',
      name: 'Shy Spin',
      frameCount: 8,
      loop: false,
      triggerProposal: { type: 'click', binding: 'clickAction' }
    },
    outputFramesDir: path.join(dataDir, 'runs/demo/frames/actions/shy-spin'),
    qaDir
  })

  assert.equal(result.actionId, 'shy-spin')
  assert.equal(result.frameCount, 8)
  assert.equal(fs.existsSync(path.join(result.framesDir, '0001.png')), true)
  assert.equal(fs.existsSync(path.join(result.framesDir, '0008.png')), true)
  assert.equal(fs.existsSync(result.qaPath), true)

  const metadata = await sharp(path.join(result.framesDir, '0001.png')).metadata()
  assert.equal(metadata.width, 192)
  assert.equal(metadata.height, 208)
  assert.equal(metadata.hasAlpha, true)

  const qa = JSON.parse(fs.readFileSync(result.qaPath, 'utf-8'))
  assert.equal(qa.ok, true)
  assert.equal(qa.actionId, 'shy-spin')
  assert.equal(qa.frameCount, 8)
  assert.equal(qa.frames.length, 8)
  assert.equal(qa.frames.every((frame) => frame.visiblePixels > 0), true)
  assert.equal(JSON.stringify(qa).includes(dataDir), false)
})

test('action frame builder rejects unsafe action ids', async () => {
  const dataDir = makeDataDir()
  await assert.rejects(
    () => buildActionFramesFromGeneratedImage({
      dataDir,
      generationResult: { outputs: [{ dataRelativePath: 'runs/demo/frames/base/0001.png' }] },
      action: { actionId: '../bad', name: 'Bad', frameCount: 8 },
      outputFramesDir: path.join(dataDir, 'runs/demo/frames/actions/bad'),
      qaDir: path.join(dataDir, 'runs/demo/qa')
    }),
    /actionId is invalid/
  )
})

test('action frame builder rejects unsafe frame counts', async () => {
  const dataDir = makeDataDir()
  const sourceDir = path.join(dataDir, 'runs/demo/frames/base')
  fs.mkdirSync(sourceDir, { recursive: true })
  await createSourcePng(path.join(sourceDir, '0001.png'))

  await assert.rejects(
    () => buildActionFramesFromGeneratedImage({
      dataDir,
      generationResult: { outputs: [{ dataRelativePath: 'runs/demo/frames/base/0001.png' }] },
      action: { actionId: 'too-many', name: 'Too Many', frameCount: 33 },
      outputFramesDir: path.join(dataDir, 'runs/demo/frames/actions/too-many'),
      qaDir: path.join(dataDir, 'runs/demo/qa')
    }),
    /frameCount must be between/
  )
})

test('action frame builder rejects output directories outside data directory', async () => {
  const dataDir = makeDataDir()
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-action-frames-outside-'))
  const sourceDir = path.join(dataDir, 'runs/demo/frames/base')
  fs.mkdirSync(sourceDir, { recursive: true })
  await createSourcePng(path.join(sourceDir, '0001.png'))

  await assert.rejects(
    () => buildActionFramesFromGeneratedImage({
      dataDir,
      generationResult: { outputs: [{ dataRelativePath: 'runs/demo/frames/base/0001.png' }] },
      action: { actionId: 'safe-action', name: 'Safe Action', frameCount: 8 },
      outputFramesDir: path.join(outsideDir, 'frames'),
      qaDir: path.join(dataDir, 'runs/demo/qa')
    }),
    /action frames output directory must stay inside/
  )

  await assert.rejects(
    () => buildActionFramesFromGeneratedImage({
      dataDir,
      generationResult: { outputs: [{ dataRelativePath: 'runs/demo/frames/base/0001.png' }] },
      action: { actionId: 'safe-action', name: 'Safe Action', frameCount: 8 },
      outputFramesDir: path.join(dataDir, 'runs/demo/frames/actions/safe-action'),
      qaDir: path.join(outsideDir, 'qa')
    }),
    /action QA directory must stay inside/
  )
})

test('action frame builder rejects output directories through symlinked parents', async (t) => {
  const dataDir = makeDataDir()
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-action-frames-symlink-'))
  const sourceDir = path.join(dataDir, 'runs/demo/frames/base')
  fs.mkdirSync(sourceDir, { recursive: true })
  await createSourcePng(path.join(sourceDir, '0001.png'))
  const linkPath = path.join(dataDir, 'linked-outside')
  try {
    fs.symlinkSync(outsideDir, linkPath, 'dir')
  } catch (error) {
    if (error?.code === 'EPERM' || error?.code === 'EACCES') {
      t.skip('symlinks are not available in this environment')
      return
    }
    throw error
  }

  await assert.rejects(
    () => buildActionFramesFromGeneratedImage({
      dataDir,
      generationResult: { outputs: [{ dataRelativePath: 'runs/demo/frames/base/0001.png' }] },
      action: { actionId: 'safe-action', name: 'Safe Action', frameCount: 8 },
      outputFramesDir: path.join(linkPath, 'frames'),
      qaDir: path.join(dataDir, 'runs/demo/qa')
    }),
    /action frames output directory must stay inside/
  )
})
