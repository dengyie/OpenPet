const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const actionLabels = {
  idle: '待机',
  bai_no_bg: '待机',
  eat_no_bg: '喂食'
}

const isImageFile = (fileName) => /\.(png|jpe?g|webp)$/i.test(fileName)

const compareFrameName = (left, right) => {
  const leftNumber = Number(left.match(/\d+/)?.[0] || 0)
  const rightNumber = Number(right.match(/\d+/)?.[0] || 0)
  return leftNumber === rightNumber
    ? left.localeCompare(right)
    : leftNumber - rightNumber
}

const readFrameMetadata = async (folderPath, frameFiles) => {
  const frames = []
  const errors = []
  const warnings = []

  for (const fileName of frameFiles) {
    try {
      const metadata = await sharp(path.join(folderPath, fileName)).metadata()
      frames.push({
        fileName,
        width: metadata.width || 0,
        height: metadata.height || 0,
        hasAlpha: Boolean(metadata.hasAlpha)
      })
      if (!metadata.hasAlpha) errors.push(`${fileName} has no alpha channel`)
    } catch (error) {
      errors.push(`${fileName} cannot be read: ${error.message}`)
    }
  }

  const dimensions = new Set(frames.map((frame) => `${frame.width}x${frame.height}`))
  if (dimensions.size > 1) warnings.push('Frame dimensions differ; frames will be centered in the largest cell')

  return { frames, errors, warnings }
}

const inspectFrameFolder = async (folderPath) => {
  if (!folderPath || !fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
    throw new Error('Frame folder does not exist')
  }

  const entries = fs.readdirSync(folderPath)
  const frameFiles = entries.filter(isImageFile).sort(compareFrameName)
  const skippedFiles = entries.filter((fileName) => !isImageFile(fileName)).sort(compareFrameName)
  const { frames, errors, warnings } = await readFrameMetadata(folderPath, frameFiles)
  const maxWidth = frames.reduce((max, frame) => Math.max(max, frame.width), 0)
  const maxHeight = frames.reduce((max, frame) => Math.max(max, frame.height), 0)

  if (!frameFiles.length) errors.push('No image files found')

  return {
    valid: frameFiles.length > 0 && errors.length === 0,
    frameCount: frameFiles.length,
    maxWidth,
    maxHeight,
    frames,
    skippedFiles,
    errors,
    warnings
  }
}

const toActionLabel = (folderName, labels = {}) => {
  if (labels[folderName]) return labels[folderName]
  if (actionLabels[folderName]) return actionLabels[folderName]
  return folderName
    .replace(/_?no_?bg$/i, '')
    .replace(/[-_]+/g, ' ')
}

const isLoopAction = (folderName) => /(^idle$|bai|stand|walk|loop)/i.test(folderName)

const processActionFolder = async ({ folderEntry, framesRoot, spritesDir, labels = {}, logger = console }) => {
  const folderPath = path.join(framesRoot, folderEntry.name)
  const frameFiles = fs.readdirSync(folderPath)
    .filter(isImageFile)
    .sort(compareFrameName)

  if (!frameFiles.length) {
    logger.warn?.(`  [skip] ${folderEntry.name}: no image files`)
    return null
  }

  const inspection = await inspectFrameFolder(folderPath)
  if (!inspection.valid) {
    logger.warn?.(`  [skip] ${folderEntry.name}: ${inspection.errors.join('; ')}`)
    return null
  }

  let cellW = 0
  let cellH = 0
  for (const frame of inspection.frames) {
    if (frame.width > cellW) cellW = frame.width
    if (frame.height > cellH) cellH = frame.height
  }

  const composites = []
  for (let i = 0; i < frameFiles.length; i++) {
    const frame = inspection.frames[i]
    const leftPad = Math.floor((cellW - frame.width) / 2)
    const topPad = Math.floor((cellH - frame.height) / 2)

    const buffer = await sharp(path.join(folderPath, frameFiles[i]))
      .ensureAlpha()
      .extend({
        top: topPad,
        bottom: cellH - frame.height - topPad,
        left: leftPad,
        right: cellW - frame.width - leftPad,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .raw()
      .toBuffer({ resolveWithObject: true })

    composites.push({
      input: buffer.data,
      raw: { width: cellW, height: cellH, channels: 4 },
      left: i * cellW,
      top: 0
    })
  }

  const frameCount = frameFiles.length
  const spritePath = path.join(spritesDir, `${folderEntry.name}.png`)
  await sharp({
    create: {
      width: cellW * frameCount,
      height: cellH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(composites)
    .png()
    .toFile(spritePath)

  const frameMs = /eat/i.test(folderEntry.name) ? 85 : 95
  logger.log?.(`  [ok] ${folderEntry.name}: ${frameCount} frames (${cellW}x${cellH}) -> ${spritePath}`)

  return {
    id: folderEntry.name,
    label: toActionLabel(folderEntry.name, labels),
    loop: isLoopAction(folderEntry.name),
    frameMs,
    frameWidth: cellW,
    frameHeight: cellH,
    sprite: path.posix.join('cat_anime', 'sprites', `${folderEntry.name}.png`),
    frameCount
  }
}

const pickExistingAction = (actions, actionId) => actions.find((action) => action.id === actionId)?.id || ''

const generateSpritesFromFrames = async ({
  framesRoot,
  spritesDir,
  configPath,
  labels = {},
  defaultAction,
  clickAction,
  logger = console
}) => {
  if (!fs.existsSync(framesRoot)) throw new Error(`Frames root not found: ${framesRoot}`)
  fs.mkdirSync(spritesDir, { recursive: true })

  const entries = fs.readdirSync(framesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())

  logger.log?.(`Found ${entries.length} action directories in ${framesRoot}`)

  const actions = []
  for (const entry of entries) {
    const action = await processActionFolder({ folderEntry: entry, framesRoot, spritesDir, labels, logger })
    if (action) actions.push(action)
  }

  if (!actions.length) throw new Error('No valid actions found.')

  const nextDefaultAction = pickExistingAction(actions, defaultAction)
    || actions.find((action) => /^idle$/i.test(action.id))?.id
    || actions.find((action) => /bai/i.test(action.id))?.id
    || actions[0]?.id
  const nextClickAction = pickExistingAction(actions, clickAction)
    || actions.find((action) => /eat/i.test(action.id))?.id
    || actions.find((action) => action.id !== nextDefaultAction)?.id
    || nextDefaultAction

  const config = { defaultAction: nextDefaultAction, clickAction: nextClickAction, actions }
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
  return config
}

module.exports = {
  compareFrameName,
  generateSpritesFromFrames,
  inspectFrameFolder,
  isImageFile,
  isLoopAction,
  toActionLabel
}
