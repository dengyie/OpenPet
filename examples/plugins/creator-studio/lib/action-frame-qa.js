const fs = require('fs')
const path = require('path')

const ACTION_FRAME_QA_LABEL = 'Action frame QA'
const ACTION_FRAMES_DIR_LABEL = 'Generated action frames'

const normalizeDataDir = (dataDir) => {
  if (!dataDir) throw new Error('Creator Studio data directory is required')
  const root = path.resolve(String(dataDir))
  if (!fs.existsSync(root)) throw new Error('Creator Studio data directory is missing')
  return root
}

const resolveExistingPathInsideDataDir = ({ dataDir, targetPath, label }) => {
  if (!targetPath) throw new Error(`${label} is missing`)
  const root = normalizeDataDir(dataDir)
  const rawTarget = String(targetPath)
  const target = path.isAbsolute(rawTarget) ? path.resolve(rawTarget) : path.resolve(root, rawTarget)
  const relative = path.relative(root, target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} must stay inside the Creator Studio data directory`)
  }
  if (!fs.existsSync(target)) throw new Error(`${label} is missing`)
  const realRoot = fs.realpathSync.native(root)
  const realTarget = fs.realpathSync.native(target)
  const realRelative = path.relative(realRoot, realTarget)
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    throw new Error(`${label} must stay inside the Creator Studio data directory`)
  }
  return target
}

const toDataRelativePath = ({ dataDir, targetPath, label = ACTION_FRAMES_DIR_LABEL }) => {
  const root = normalizeDataDir(dataDir)
  const target = resolveExistingPathInsideDataDir({ dataDir, targetPath, label })
  return path.relative(root, target).split(path.sep).join('/')
}

const readQaJson = (qaPath) => {
  try {
    return JSON.parse(fs.readFileSync(qaPath, 'utf-8'))
  } catch (_) {
    throw new Error(`${ACTION_FRAME_QA_LABEL} must be valid JSON`)
  }
}

const requirePositiveInteger = ({ value, message }) => {
  const normalized = Number(value)
  if (!Number.isInteger(normalized) || normalized < 1) throw new Error(message)
  return normalized
}

const validateActionFrameQa = ({ dataDir, actionFrames }) => {
  if (!actionFrames) throw new Error('Generated action frames are missing')
  if (!actionFrames.actionId) throw new Error('Generated action actionId is missing')
  const framesDir = resolveExistingPathInsideDataDir({
    dataDir,
    targetPath: actionFrames.framesDir,
    label: ACTION_FRAMES_DIR_LABEL
  })
  const qaPath = resolveExistingPathInsideDataDir({
    dataDir,
    targetPath: actionFrames.qa,
    label: ACTION_FRAME_QA_LABEL
  })
  const qa = readQaJson(qaPath)
  const frameCount = requirePositiveInteger({
    value: actionFrames.frameCount,
    message: 'Generated action frame count is invalid'
  })
  const frameWidth = requirePositiveInteger({
    value: actionFrames.frameWidth,
    message: 'Generated action frame width is invalid'
  })
  const frameHeight = requirePositiveInteger({
    value: actionFrames.frameHeight,
    message: 'Generated action frame height is invalid'
  })

  if (qa.ok !== true) throw new Error(`${ACTION_FRAME_QA_LABEL} must pass`)
  if (qa.actionId !== actionFrames.actionId) {
    throw new Error(`${ACTION_FRAME_QA_LABEL} actionId does not match generated action`)
  }
  if (Number(qa.frameCount) !== frameCount) {
    throw new Error(`${ACTION_FRAME_QA_LABEL} frameCount does not match generated action`)
  }
  if (Number(qa.frameWidth) !== frameWidth) {
    throw new Error(`${ACTION_FRAME_QA_LABEL} frameWidth does not match generated action`)
  }
  if (Number(qa.frameHeight) !== frameHeight) {
    throw new Error(`${ACTION_FRAME_QA_LABEL} frameHeight does not match generated action`)
  }

  const frames = Array.isArray(qa.frames) ? qa.frames : []
  if (frames.length !== frameCount) throw new Error(`${ACTION_FRAME_QA_LABEL} is incomplete`)
  frames.forEach((frame, index) => {
    const expectedFileName = `${String(index + 1).padStart(4, '0')}.png`
    if (frame?.fileName !== expectedFileName) throw new Error(`${ACTION_FRAME_QA_LABEL} is incomplete`)
    resolveExistingPathInsideDataDir({
      dataDir,
      targetPath: path.join(framesDir, expectedFileName),
      label: 'Generated action frame'
    })
    if (Number(frame.width) !== frameWidth || Number(frame.height) !== frameHeight) {
      throw new Error(`${ACTION_FRAME_QA_LABEL} frame dimensions do not match generated action`)
    }
    if (Number(frame.visiblePixels) < 1) throw new Error(`${ACTION_FRAME_QA_LABEL} is incomplete`)
  })

  return qa
}

module.exports = {
  toDataRelativePath,
  validateActionFrameQa
}
