const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const decoderError = (message, code = 'video_decoder_invalid') => Object.assign(new Error(message), { code })

const safeRelative = (value, label) => {
  const normalized = String(value || '').trim().replace(/\\/g, '/')
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..') || /^[a-zA-Z]:\//.test(normalized)) {
    throw decoderError(`${label} must be a safe relative path`)
  }
  return normalized
}

const assertInside = ({ root, target, label }) => {
  const rootPath = path.resolve(String(root || ''))
  const targetPath = path.resolve(String(target || ''))
  const relative = path.relative(rootPath, targetPath)
  if (!rootPath || !relative || relative.startsWith('..') || path.isAbsolute(relative)) throw decoderError(`${label} escaped data directory`)
  return targetPath
}

const runProcess = ({ spawnImpl, command, args, cwd, signal }) => new Promise((resolve, reject) => {
  let settled = false
  const child = spawnImpl(command, args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  child.stderr?.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-4_000) })
  const abort = () => {
    try { child.kill('SIGTERM') } catch (_) {}
    if (!settled) {
      settled = true
      reject(signal.reason || decoderError('Video decode canceled', 'video_decoder_canceled'))
    }
  }
  if (signal?.aborted) return abort()
  signal?.addEventListener('abort', abort, { once: true })
  child.once('error', (error) => {
    if (settled) return
    settled = true
    signal?.removeEventListener('abort', abort)
    reject(error.code === 'ENOENT'
      ? decoderError('ffmpeg is required to decode Provider videos', 'video_decoder_unavailable')
      : decoderError('ffmpeg failed to start', 'video_decoder_start_failed'))
  })
  child.once('close', (code) => {
    if (settled) return
    settled = true
    signal?.removeEventListener('abort', abort)
    if (code !== 0) reject(decoderError(`ffmpeg failed to decode the video${stderr ? `: ${stderr}` : ''}`, 'video_decoder_failed'))
    else resolve()
  })
})

const extractVideoFrames = async ({
  videoPath,
  outputDir,
  dataDir,
  fps = 12,
  maxFrames = 32,
  ffmpegPath = 'ffmpeg',
  spawnImpl = spawn,
  signal
} = {}) => {
  const inputPath = path.resolve(String(videoPath || ''))
  if (!fs.existsSync(inputPath) || !fs.statSync(inputPath).isFile()) throw decoderError('Provider video is missing', 'video_input_missing')
  const normalizedOutputDir = safeRelative(outputDir, 'video frame output')
  const absoluteOutputDir = assertInside({ root: dataDir, target: path.resolve(dataDir, normalizedOutputDir), label: 'video frame output' })
  const normalizedFps = Number(fps)
  const normalizedMaxFrames = Number(maxFrames)
  if (!Number.isInteger(normalizedFps) || normalizedFps < 1 || normalizedFps > 60) throw decoderError('Video decode FPS is invalid')
  if (!Number.isInteger(normalizedMaxFrames) || normalizedMaxFrames < 1 || normalizedMaxFrames > 128) throw decoderError('Video decode frame limit is invalid')
  fs.mkdirSync(absoluteOutputDir, { recursive: true })
  const outputPattern = path.join(absoluteOutputDir, '%04d.png')
  await runProcess({
    spawnImpl,
    command: ffmpegPath,
    cwd: dataDir,
    signal,
    args: ['-hide_banner', '-loglevel', 'error', '-i', inputPath, '-vf', `fps=${normalizedFps}`, '-frames:v', String(normalizedMaxFrames), '-y', outputPattern]
  })
  const framePaths = fs.readdirSync(absoluteOutputDir)
    .filter((entry) => /^\d{4}\.png$/.test(entry))
    .sort()
    .map((entry) => path.join(absoluteOutputDir, entry))
  if (!framePaths.length) throw decoderError('ffmpeg produced no video frames', 'video_decoder_empty')
  return Object.freeze({ fps: normalizedFps, frameCount: framePaths.length, outputDir: absoluteOutputDir, framePaths: Object.freeze(framePaths) })
}

module.exports = { decoderError, extractVideoFrames }
