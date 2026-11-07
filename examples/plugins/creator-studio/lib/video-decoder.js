const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { selectFrameIndexes } = require('./video-frame-extractor')

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

const runProcess = ({ spawnImpl, command, args, cwd, signal, unavailableMessage, startFailedMessage, failedMessage }) => new Promise((resolve, reject) => {
  let settled = false
  const child = spawnImpl(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(-4_000) })
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
      ? decoderError(unavailableMessage, 'video_decoder_unavailable')
      : decoderError(startFailedMessage, 'video_decoder_start_failed'))
  })
  child.once('close', (code) => {
    if (settled) return
    settled = true
    signal?.removeEventListener('abort', abort)
    if (code !== 0) reject(decoderError(`${failedMessage}${stderr ? `: ${stderr}` : ''}`, 'video_decoder_failed'))
    else resolve(stdout)
  })
})

const probeFrameCount = async ({ videoPath, dataDir, ffprobePath, spawnImpl, signal }) => {
  const stdout = await runProcess({
    spawnImpl,
    command: ffprobePath,
    cwd: dataDir,
    signal,
    unavailableMessage: 'ffprobe is required to inspect Provider videos',
    startFailedMessage: 'ffprobe failed to start',
    failedMessage: 'ffprobe failed to inspect the video',
    args: ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'default=nokey=1:noprint_wrappers=1', videoPath]
  })
  const frameCount = Number.parseInt(String(stdout || '').trim(), 10)
  if (!Number.isInteger(frameCount) || frameCount < 1 || frameCount > 100_000) {
    throw decoderError('ffprobe returned an invalid video frame count', 'video_decoder_probe_invalid')
  }
  return frameCount
}

const extractVideoFrames = async ({
  videoPath,
  outputDir,
  dataDir,
  fps = 12,
  maxFrames = 32,
  minFrames = maxFrames,
  loop = false,
  ffmpegPath = 'ffmpeg',
  ffprobePath = 'ffprobe',
  spawnImpl = spawn,
  signal
} = {}) => {
  const inputPath = path.resolve(String(videoPath || ''))
  if (!fs.existsSync(inputPath) || !fs.statSync(inputPath).isFile()) throw decoderError('Provider video is missing', 'video_input_missing')
  const normalizedOutputDir = safeRelative(outputDir, 'video frame output')
  const absoluteOutputDir = assertInside({ root: dataDir, target: path.resolve(dataDir, normalizedOutputDir), label: 'video frame output' })
  const normalizedFps = Number(fps)
  const normalizedMaxFrames = Number(maxFrames)
  const normalizedMinFrames = Number(minFrames)
  if (!Number.isInteger(normalizedFps) || normalizedFps < 1 || normalizedFps > 60) throw decoderError('Video decode FPS is invalid')
  if (!Number.isInteger(normalizedMaxFrames) || normalizedMaxFrames < 1 || normalizedMaxFrames > 128) throw decoderError('Video decode frame limit is invalid')
  if (!Number.isInteger(normalizedMinFrames) || normalizedMinFrames < 1 || normalizedMinFrames > normalizedMaxFrames) throw decoderError('Video decode minimum frame count is invalid')
  if (typeof loop !== 'boolean') throw decoderError('Video decode loop must be a boolean')
  const sourceFrameCount = await probeFrameCount({ videoPath: inputPath, dataDir, ffprobePath, spawnImpl, signal })
  const usableFrameCount = sourceFrameCount - (loop ? 1 : 0)
  if (usableFrameCount < normalizedMinFrames) throw decoderError('Provider video contains fewer distinct frames than the action contract', 'video_decoder_frame_count_mismatch')
  const selectedCount = Math.min(usableFrameCount, normalizedMaxFrames)
  const selection = selectFrameIndexes({ sourceFrameCount, sourceFps: 1, targetFrameCount: selectedCount, targetFps: normalizedFps, loop })
  const selectFilter = selection.indexes.map((index) => `eq(n\\,${index})`).join('+')
  fs.mkdirSync(absoluteOutputDir, { recursive: true })
  const outputPattern = path.join(absoluteOutputDir, '%04d.png')
  await runProcess({
    spawnImpl,
    command: ffmpegPath,
    cwd: dataDir,
    signal,
    unavailableMessage: 'ffmpeg is required to decode Provider videos',
    startFailedMessage: 'ffmpeg failed to start',
    failedMessage: 'ffmpeg failed to decode the video',
    args: ['-hide_banner', '-loglevel', 'error', '-i', inputPath, '-vf', `select=${selectFilter},setpts=N/${normalizedFps}/TB`, '-vsync', '0', '-frames:v', String(selectedCount), '-y', outputPattern]
  })
  const framePaths = fs.readdirSync(absoluteOutputDir)
    .filter((entry) => /^\d{4}\.png$/.test(entry))
    .sort()
    .map((entry) => path.join(absoluteOutputDir, entry))
  if (framePaths.length !== selectedCount) throw decoderError(`ffmpeg produced ${framePaths.length} video frames; expected ${selectedCount}`, 'video_decoder_frame_count_mismatch')
  return Object.freeze({ fps: normalizedFps, frameCount: framePaths.length, sourceFrameCount, sourceIndexes: selection.indexes, outputDir: absoluteOutputDir, framePaths: Object.freeze(framePaths) })
}

module.exports = { decoderError, extractVideoFrames }
