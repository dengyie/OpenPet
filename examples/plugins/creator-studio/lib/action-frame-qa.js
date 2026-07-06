const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const assertExistingPathInsideDataDir = ({ dataDir, targetPath, label }) => {
  if (!targetPath) throw new Error(`${label} must stay inside the Creator Studio data directory`)
  const root = path.resolve(String(dataDir || ''))
  const target = path.resolve(String(targetPath))
  const relative = path.relative(root, target)
  if (!root || !relative || relative.startsWith('..') || path.isAbsolute(relative)) {
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

const readQaJson = (qaPath) => {
  try {
    return JSON.parse(fs.readFileSync(qaPath, 'utf-8'))
  } catch (_) {
    throw new Error('Action frame QA must be valid JSON before approval/import')
  }
}

const sha256File = (filePath) => crypto
  .createHash('sha256')
  .update(fs.readFileSync(filePath))
  .digest('hex')

const assertActionFrameQaPassed = ({ dataDir, actionFrames, operation = 'approval/import' }) => {
  if (!actionFrames?.qa) throw new Error(`Action frame QA must pass before ${operation}`)
  const qaPath = assertExistingPathInsideDataDir({
    dataDir,
    targetPath: actionFrames.qa,
    label: 'Action frame QA'
  })
  const framesDir = assertExistingPathInsideDataDir({
    dataDir,
    targetPath: actionFrames.framesDir,
    label: 'Action frames directory'
  })
  const qa = readQaJson(qaPath)
  const frameCount = Number(actionFrames.frameCount)
  if (qa.ok !== true) throw new Error(`Action frame QA must pass before ${operation}`)
  if (qa.actionId !== actionFrames.actionId) throw new Error(`Action frame QA actionId must match before ${operation}`)
  if (!Number.isInteger(frameCount) || frameCount < 1) {
    throw new Error('Generated action frame count is invalid')
  }
  if (Number(qa.frameCount) !== frameCount) {
    throw new Error(`Action frame QA frameCount must match before ${operation}`)
  }
  if (Number(qa.frameWidth) !== Number(actionFrames.frameWidth)) {
    throw new Error(`Action frame QA frameWidth must match before ${operation}`)
  }
  if (Number(qa.frameHeight) !== Number(actionFrames.frameHeight)) {
    throw new Error(`Action frame QA frameHeight must match before ${operation}`)
  }

  const frames = Array.isArray(qa.frames) ? qa.frames : []
  if (frames.length !== frameCount) throw new Error(`Action frame QA frames must be complete before ${operation}`)
  frames.forEach((frame, index) => {
    const expectedFileName = `${String(index + 1).padStart(4, '0')}.png`
    const visiblePixels = Number(frame?.visiblePixels)
    if (
      frame?.fileName !== expectedFileName ||
      Number(frame.width) !== Number(actionFrames.frameWidth) ||
      Number(frame.height) !== Number(actionFrames.frameHeight) ||
      !Number.isFinite(visiblePixels) ||
      visiblePixels < 1
    ) {
      throw new Error(`Action frame QA frames must be complete before ${operation}`)
    }
    const framePath = assertExistingPathInsideDataDir({
      dataDir,
      targetPath: path.join(framesDir, expectedFileName),
      label: 'Action frame file'
    })
    if (typeof frame.fileSha256 === 'string' && frame.fileSha256.trim()) {
      const actualHash = sha256File(framePath)
      if (actualHash !== frame.fileSha256) {
        throw new Error(`Action frame file hash must match QA before ${operation}`)
      }
    }
  })
  return qa
}

const assertRunActionFrameQaPassed = ({ dataDir, run, operation = 'approval/import' }) => {
  const actionFrames = run?.artifacts?.actionFrames
  if (!actionFrames) return null
  return assertActionFrameQaPassed({ dataDir, actionFrames, operation })
}

module.exports = {
  assertActionFrameQaPassed,
  assertRunActionFrameQaPassed
}
