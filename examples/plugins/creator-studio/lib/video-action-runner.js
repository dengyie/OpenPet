const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const { callBridge } = require('./bridge-client')
const { createActionVideoTask } = require('./action-video-task')
const { createMotionDriver } = require('./motion-driver-registry')
const { createProviderVideoTask } = require('./provider-video-task')
const { processFrameSequence } = require('./video-matte-pipeline')
const { extractVideoFrames } = require('./video-decoder')
const { analyzeTemporalQuality } = require('./video-stabilizer')
const { measureBodyMask } = require('./character-scale-profile')

const runnerError = (message, code = 'video_action_runner_invalid') => Object.assign(new Error(message), { code })

const safeSegment = (value, fallback) => {
  const normalized = String(value || '').trim().replace(/[^a-zA-Z0-9._-]+/g, '-')
  return normalized || fallback
}

const sha256File = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

const createAnimatedGif = async ({ frames, outputPath, delayMs = 100 }) => {
  const inputs = frames.map((frame) => fs.readFileSync(frame.path))
  await sharp(inputs, { join: { animated: true } })
    .gif({ delay: Array(inputs.length).fill(Math.max(20, Number(delayMs) || 100)), loop: 0, keepDuplicateFrames: true })
    .toFile(outputPath)
}

const createVideoCandidateArtifacts = async ({
  processed,
  outputDir,
  layout,
  expectedFrameCount,
  characterClass = 'grounded-compact-character'
} = {}) => {
  const sourceFrames = Array.isArray(processed?.normalizedFrames) ? processed.normalizedFrames : []
  const frameCount = Number(expectedFrameCount)
  const columns = Number(layout?.columns)
  const rows = Number(layout?.rows)
  if (!Number.isInteger(frameCount) || frameCount < 1 || sourceFrames.length !== frameCount) {
    throw runnerError(`Video Provider returned ${sourceFrames.length} frames; expected ${frameCount}`, 'video_frame_count_mismatch')
  }
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns * rows < frameCount) {
    throw runnerError('Video action sprite layout is invalid', 'video_sprite_layout_invalid')
  }
  const normalizedOutputDir = path.resolve(String(outputDir || ''))
  if (!outputDir || normalizedOutputDir === path.parse(normalizedOutputDir).root) throw runnerError('Video candidate output directory is invalid')
  const frameDir = path.join(normalizedOutputDir, 'frames')
  fs.mkdirSync(frameDir, { recursive: true })
  const frames = []
  const frameMetrics = []
  for (let index = 0; index < sourceFrames.length; index += 1) {
    const sourcePath = String(sourceFrames[index]?.path || '')
    if (!sourcePath || !fs.existsSync(sourcePath)) throw runnerError(`Video normalized frame ${index} is missing`, 'video_frame_missing')
    const outputPath = path.join(frameDir, `${String(index + 1).padStart(2, '0')}.png`)
    await sharp(sourcePath).resize({ width: 128, height: 128, fit: 'fill' }).png().toFile(outputPath)
    const decoded = await sharp(outputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const measured = measureBodyMask({ data: decoded.data, width: decoded.info.width, height: decoded.info.height, characterClass })
    if (measured.empty) throw runnerError(`Video frame ${index} has no visible subject`, 'video_frame_empty')
    const body = measured.bodyBounds
    const edgeTouch = body.minX <= 0 || body.minY <= 0 || body.maxX >= decoded.info.width - 1 || body.maxY >= decoded.info.height - 1
    const anchorY = measured.compactBaselineY
    frameMetrics.push({
      index,
      empty: false,
      edgeTouch,
      pasteClamped: false,
      unmatchedComponentCount: measured.unmatchedComponents.length,
      subjectHeightRatio: measured.subjectHeightRatio,
      subjectWidthRatio: measured.subjectWidthRatio,
      outputSubjectHeightRatio: measured.subjectHeightRatio,
      outputSubjectWidthRatio: measured.subjectWidthRatio,
      anchorY,
      outputAnchorY: anchorY * 128,
      outputAnchorYRatio: anchorY,
      coreThicknessP75Ratio: measured.coreThicknessP75Ratio,
      bodyBounds: body,
      bodyMaskSha256: measured.bodyMaskSha256
    })
    frames.push({ index, path: outputPath, sha256: sha256File(outputPath) })
  }
  const processedSheetPath = path.join(normalizedOutputDir, 'processed-sheet.png')
  await sharp({ create: { width: columns * 128, height: rows * 128, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(frames.map((frame) => ({ input: frame.path, left: (frame.index % columns) * 128, top: Math.floor(frame.index / columns) * 128 })))
    .png()
    .toFile(processedSheetPath)
  const rawSheetPath = path.join(normalizedOutputDir, 'raw-sheet.png')
  const rawCellWidth = Math.floor(1024 / columns)
  const rawCellHeight = Math.floor(1024 / rows)
  const rawCellBuffers = await Promise.all(frames.map((frame) => sharp(frame.path)
    .resize({ width: rawCellWidth, height: rawCellHeight, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()))
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(rawCellBuffers.map((input, index) => ({ input, left: (index % columns) * rawCellWidth, top: Math.floor(index / columns) * rawCellHeight })))
    .png()
    .toFile(rawSheetPath)
  const contactSheetPath = path.join(normalizedOutputDir, 'contact-sheet.png')
  fs.copyFileSync(processedSheetPath, contactSheetPath)
  const gifPath = path.join(normalizedOutputDir, 'animation.gif')
  await createAnimatedGif({ frames, outputPath: gifPath })
  const metrics = {
    version: 2,
    inputSha256: String(processed?.spriteSheet?.sha256 || ''),
    sourceDimensions: { width: Number(processed?.canvas?.width) || 0, height: Number(processed?.canvas?.height) || 0 },
    canvas: { width: 128, height: 128 },
    layout: { columns, rows, cellCount: columns * rows, unusedCells: Array.from({ length: columns * rows - frameCount }, (_, index) => frameCount + index) },
    rawTrajectory: { minY: Math.min(...frameMetrics.map((frame) => frame.outputAnchorYRatio)), maxY: Math.max(...frameMetrics.map((frame) => frame.outputAnchorYRatio)) },
    frames: frameMetrics
  }
  return {
    frames,
    processedSheet: { path: processedSheetPath, sha256: sha256File(processedSheetPath) },
    rawSheet: { path: rawSheetPath, sha256: sha256File(rawSheetPath) },
    contactSheet: { path: contactSheetPath, sha256: sha256File(contactSheetPath) },
    gif: { path: gifPath, sha256: sha256File(gifPath) },
    metrics,
    hashes: {
      processedSheet: sha256File(processedSheetPath),
      rawSheet: sha256File(rawSheetPath),
      contactSheet: sha256File(contactSheetPath),
      gif: sha256File(gifPath),
      frames: Object.fromEntries(frames.map((frame) => [String(frame.index), frame.sha256]))
    }
  }
}

const resolveReference = ({ dataDir, reference }) => {
  const relativePath = String(reference?.relativePath || '').trim().replace(/\\/g, '/')
  if (!relativePath || relativePath.startsWith('/') || relativePath.split('/').includes('..')) throw runnerError('Video action reference path is invalid')
  const target = path.resolve(dataDir, ...relativePath.split('/'))
  const relative = path.relative(path.resolve(dataDir), target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(target) || !fs.statSync(target).isFile()) throw runnerError('Video action reference is missing')
  return { ...reference, relativePath, fileName: String(reference.fileName || path.basename(target)) }
}

const buildVideoPrompt = ({ run, action, driver }) => {
  const identity = String(run?.input?.petName || 'the referenced pet').trim()
  const actionText = String(action?.motionPrompt || action?.name || action?.actionId || 'the requested action').trim()
  const beats = driver.framePlan.map((beat) => beat.replace(/^Frame \d+:\s*/i, '')).join('; ')
  return [
    `Animate the exact referenced character ${identity} performing ${actionText}.`,
    'Preserve the exact face, markings, body proportions, accessories, palette, material, lighting, camera distance, and silhouette from the reference image.',
    `Use this ordered motion plan: ${beats}.`,
    'Full body visible in every frame, locked camera, centered grounded root, one subject only, no text, no logo, no props, no particles, no detached effects.',
    'Use a flat uniform chroma green background #12ff4d for matting; no gradient, shadows, floor, or background movement.',
    'Return a short seamless loop with visibly distinct motion phases and a natural return toward the first pose.'
  ].join(' ')
}

const runVideoAction = async ({
  dataDir,
  run,
  action,
  canonical,
  model = 'grok-imagine-video',
  fps = 12,
  canvas = { width: 512, height: 512 },
  outputRelativeDir = `runs/${run?.runId || 'run'}/video`,
  signal,
  decode = extractVideoFrames,
  bridge = callBridge,
  processFrames = processFrameSequence
} = {}) => {
  const runId = String(run?.runId || '').trim()
  const actionId = String(action?.actionId || '').trim().toLowerCase()
  if (!runId || !actionId) throw runnerError('Video action run and action identifiers are required')
  const reference = resolveReference({ dataDir, reference: canonical })
  const driver = createMotionDriver({ actionId, motionPresetId: action?.motionPresetId || '', motionParameters: { intensity: action?.motionIntensity || 'normal', leadSide: action?.leadSide || 'viewer-left' }, fps })
  const durationMs = Math.round((driver.frameCount / driver.fps) * 1000)
  const actionTask = createActionVideoTask({
    schemaVersion: 1,
    taskType: 'action-video-v1',
    actionId,
    motionPresetId: driver.motionPresetId,
    motionParameters: driver.motionParameters,
    reference: { sha256: String(canonical?.sha256 || '').toLowerCase(), role: 'canonical-identity' },
    motionDriver: { sha256: driver.sha256, fps: driver.fps, frameCount: driver.frameCount, loop: driver.loop },
    canvas,
    fps: driver.fps,
    durationMs,
    background: { mode: 'solid', color: '#12ff4d', purpose: 'matting-assist' },
    camera: 'locked',
    output: 'video'
  })
  const providerTask = createProviderVideoTask({
    schemaVersion: 1,
    taskType: 'provider-video-generation',
    providerId: 'mango-api',
    model,
    actionTask,
    request: { backgroundColor: '#12ff4d', backgroundMode: 'solid', camera: 'locked', durationMs, fps: driver.fps, outputMimeType: 'video/mp4' },
    retryPolicy: { maxAttempts: 2, backoffMs: 1_000 }
  })
  const rawRelativeDir = `${outputRelativeDir.replace(/\\/g, '/').replace(/\/$/, '')}/raw`
  const response = await bridge('/creator/model-video-generate', {
    runId,
    model,
    prompt: buildVideoPrompt({ run, action, driver }),
    referenceImages: [{ ...reference, role: 'canonical-identity' }],
    seconds: Math.max(1, Math.round(durationMs / 1000)),
    size: `${canvas.width}x${canvas.height}`,
    request: { background: { mode: 'solid', color: '#12ff4d' }, motionDriverSha256: driver.sha256 },
    output: { dataRelativeDir: rawRelativeDir, fileName: `${safeSegment(actionId, 'action')}.mp4` }
  }, { signal })
  const generated = response?.result?.result || response?.result || {}
  const output = Array.isArray(generated.outputs) ? generated.outputs[0] : null
  if (!output?.dataRelativePath) throw runnerError('Video Provider returned no output', 'video_provider_invalid_response')
  const rawPath = path.resolve(dataDir, ...String(output.dataRelativePath).split('/'))
  const frameDir = `${outputRelativeDir.replace(/\\/g, '/').replace(/\/$/, '')}/decoded/${safeSegment(actionId, 'action')}`
  const decoded = await decode({ videoPath: rawPath, outputDir: frameDir, dataDir, fps: driver.fps, maxFrames: driver.frameCount, signal })
  const processed = await processFrames({
    framePaths: decoded.framePaths,
    outputDir: path.resolve(dataDir, ...outputRelativeDir.split('/'), safeSegment(actionId, 'action')),
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    fps: driver.fps,
    backgroundColor: '#12ff4d',
    signal
  })
  const temporalQuality = analyzeTemporalQuality({ frames: processed.frameMetrics, loop: driver.loop })
  return Object.freeze({
    ok: temporalQuality.ok,
    actionId,
    model,
    driver,
    providerTask,
    rawVideo: { ...output, relativePath: output.dataRelativePath },
    decoded,
    processed,
    temporalQuality
  })
}

module.exports = { buildVideoPrompt, createVideoCandidateArtifacts, runVideoAction, runnerError }
