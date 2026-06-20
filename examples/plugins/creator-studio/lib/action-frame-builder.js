const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const { resolveGeneratedImagePath } = require('./real-atlas-builder')

const SAFE_ACTION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/
const FRAME_WIDTH = 192
const FRAME_HEIGHT = 208
const MAX_FRAME_COUNT = 32

const assertSafeActionId = (actionId) => {
  if (!SAFE_ACTION_ID_PATTERN.test(actionId || '')) {
    throw new Error('Creator Studio actionId is invalid')
  }
}

const normalizeFrameCount = (value) => {
  const count = Number(value)
  if (!Number.isInteger(count) || count < 1 || count > MAX_FRAME_COUNT) {
    throw new Error(`Creator Studio action frameCount must be between 1 and ${MAX_FRAME_COUNT}`)
  }
  return count
}

const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

const getNearestExistingPath = (targetPath) => {
  let currentPath = targetPath
  while (!fs.existsSync(currentPath)) {
    const nextPath = path.dirname(currentPath)
    if (nextPath === currentPath) break
    currentPath = nextPath
  }
  return currentPath
}

const assertWritablePathInsideDataDir = ({ dataDir, targetPath, label }) => {
  const root = path.resolve(dataDir)
  const resolvedTarget = path.resolve(targetPath)
  const relative = path.relative(root, resolvedTarget)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Creator Studio ${label} must stay inside the data directory`)
  }
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true })
  const realRoot = fs.realpathSync.native(root)
  const nearestExisting = getNearestExistingPath(resolvedTarget)
  const realExisting = fs.realpathSync.native(nearestExisting)
  const realRelative = path.relative(realRoot, realExisting)
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    throw new Error(`Creator Studio ${label} must stay inside the data directory`)
  }
  return resolvedTarget
}

const countVisiblePixels = async (imagePath) => {
  const { data, info } = await sharp(imagePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let visiblePixels = 0
  for (let index = 3; index < data.length; index += info.channels) {
    if (data[index] > 0) visiblePixels += 1
  }
  return visiblePixels
}

const createBaseFrame = async (sourcePath) => {
  const maxWidth = Math.floor(FRAME_WIDTH * 0.82)
  const maxHeight = Math.floor(FRAME_HEIGHT * 0.82)
  const resized = await sharp(sourcePath)
    .ensureAlpha()
    .resize({
      width: maxWidth,
      height: maxHeight,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer()
  const metadata = await sharp(resized).metadata()
  const left = Math.max(0, Math.floor((FRAME_WIDTH - metadata.width) / 2))
  const top = Math.max(0, Math.floor((FRAME_HEIGHT - metadata.height) * 0.58))

  return sharp({
    create: {
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: resized, left, top }])
    .png()
    .toBuffer()
}

const createFrameVariant = async ({ baseFrame, index, frameCount }) => {
  const midpoint = (frameCount - 1) / 2 || 1
  const normalized = (index - midpoint) / midpoint
  const angle = normalized * 7
  const wave = Math.sin((index / Math.max(1, frameCount - 1)) * Math.PI * 2)
  const horizontalOffset = Math.round(wave * 4)
  const verticalOffset = Math.round(Math.abs(wave) * -3)
  const variant = await sharp(baseFrame)
    .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize({
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer()

  return sharp({
    create: {
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{
      input: variant,
      left: horizontalOffset,
      top: verticalOffset,
      blend: 'over'
    }])
    .png()
    .toBuffer()
}

const buildActionFramesFromGeneratedImage = async ({
  dataDir,
  generationResult,
  action,
  outputFramesDir,
  qaDir
}) => {
  const actionId = String(action?.actionId || '').trim()
  assertSafeActionId(actionId)
  const frameCount = normalizeFrameCount(action?.frameCount || 16)
  const { sourcePath, sourceRelativePath } = resolveGeneratedImagePath({ dataDir, generationResult })
  const safeOutputFramesDir = assertWritablePathInsideDataDir({
    dataDir,
    targetPath: outputFramesDir,
    label: 'action frames output directory'
  })
  const safeQaDir = assertWritablePathInsideDataDir({
    dataDir,
    targetPath: qaDir,
    label: 'action QA directory'
  })

  fs.rmSync(safeOutputFramesDir, { recursive: true, force: true })
  fs.mkdirSync(safeOutputFramesDir, { recursive: true })
  fs.mkdirSync(safeQaDir, { recursive: true })

  const baseFrame = await createBaseFrame(sourcePath)
  const frames = []
  for (let index = 0; index < frameCount; index += 1) {
    const fileName = `${String(index + 1).padStart(4, '0')}.png`
    const framePath = path.join(safeOutputFramesDir, fileName)
    fs.writeFileSync(framePath, await createFrameVariant({ baseFrame, index, frameCount }))
    frames.push({
      fileName,
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      visiblePixels: await countVisiblePixels(framePath)
    })
  }

  const qaPath = path.join(safeQaDir, 'action-frame-validation.json')
  writeJson(qaPath, {
    ok: true,
    actionId,
    name: String(action?.name || actionId),
    sourceRelativePath,
    frameCount,
    frameWidth: FRAME_WIDTH,
    frameHeight: FRAME_HEIGHT,
    loop: Boolean(action?.loop),
    triggerProposal: action?.triggerProposal || { type: 'unbound' },
    frames,
    warnings: []
  })

  return {
    actionId,
    frameCount,
    frameWidth: FRAME_WIDTH,
    frameHeight: FRAME_HEIGHT,
    framesDir: safeOutputFramesDir,
    qaPath
  }
}

module.exports = {
  buildActionFramesFromGeneratedImage
}
