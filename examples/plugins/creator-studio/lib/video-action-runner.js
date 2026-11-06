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
const { createIdentityDescriptor, identityDescriptorDistance } = require('./identity-descriptor')
const { getQualityFirstQualityProfile } = require('./pet-generation-quality-profile')

const runnerError = (message, code = 'video_action_runner_invalid') => Object.assign(new Error(message), { code })
const VIDEO_TECHNICAL_FAILURES = new Set([
  'empty-used-cell',
  'video-frame-empty',
  'mask-dropout',
  'mask-coverage-missing',
  'alpha-coverage-missing',
  'root-anchor-missing',
  'frame-edge-contact',
  'detached-effect-contamination',
  'identity-drift',
  'loop-seam-too-large',
  'motion-is-static'
])
const PROVIDER_VIDEO_SIZE = '1280x720'
const PROVIDER_VIDEO_ASPECT_RATIO = '16:9'
const isVideoTechnicalFailure = (failure) => VIDEO_TECHNICAL_FAILURES.has(String(failure || ''))

const readIdentityDescriptor = async (imagePath) => {
  if (!imagePath || !fs.existsSync(imagePath) || !fs.statSync(imagePath).isFile()) return null
  const { data, info } = await sharp(imagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const measured = measureBodyMask({ data, width: info.width, height: info.height })
  if (measured.empty || !measured.bodyBounds) return null
  const bounds = measured.bodyBounds
  return createIdentityDescriptor({
    data,
    info,
    bounds: {
      left: bounds.minX,
      top: bounds.minY,
      right: bounds.maxX,
      bottom: bounds.maxY,
      width: bounds.maxX - bounds.minX + 1,
      height: bounds.maxY - bounds.minY + 1
    }
  })
}

const analyzeIdentityConsistency = async ({ referencePath, framePaths = [] } = {}) => {
  if (!referencePath || !fs.existsSync(referencePath) || !Array.isArray(framePaths) || !framePaths.length) {
    return Object.freeze({ ok: false, failures: ['identity-evidence-missing'], metrics: {} })
  }
  const canonicalDescriptor = await readIdentityDescriptor(referencePath)
  if (!canonicalDescriptor) return Object.freeze({ ok: false, failures: ['identity-reference-unreadable'], metrics: {} })
  const frameDescriptors = await Promise.all(framePaths.map((framePath) => readIdentityDescriptor(framePath)))
  if (frameDescriptors.some((descriptor) => !descriptor)) {
    return Object.freeze({ ok: false, failures: ['identity-frame-unreadable'], metrics: { frameCount: framePaths.length } })
  }
  const distances = frameDescriptors.map((descriptor) => identityDescriptorDistance(descriptor, canonicalDescriptor))
  const maxDistance = Math.max(...distances)
  const maxAllowedDistance = getQualityFirstQualityProfile().crossAction.maxIdentityDescriptorDistance
  const failures = maxDistance > maxAllowedDistance ? ['identity-drift'] : []
  return Object.freeze({
    ok: failures.length === 0,
    failures: Object.freeze(failures),
    metrics: Object.freeze({ maxIdentityDescriptorDistance: maxDistance, maxAllowedIdentityDescriptorDistance: maxAllowedDistance, frameCount: framePaths.length })
  })
}

const VIDEO_REPAIR_INSTRUCTIONS = Object.freeze({
  'loop-seam-too-large': 'Make the first and final extracted frames match exactly in pose, root position, silhouette, camera framing, and character scale; finish settling before the final frame.',
  'frame-edge-contact': 'Reduce the motion amplitude and keep at least 20 percent empty space above the character and clear space on every other edge in every frame.',
  'detached-effect-contamination': 'Remove every detached particle, trail, floor mark, prop, shadow, duplicate limb, and floating visual effect.',
  'identity-drift': 'Restore the exact referenced identity and body proportions; do not replace the character with a human, creature, costume, or different silhouette.',
  'motion-is-static': 'Keep the root and camera fixed while making the requested moving body part pass through visibly distinct motion phases.',
  'mask-dropout': 'Keep the entire character continuously visible against the uniform green background in every frame.',
  'root-anchor-missing': 'Keep one complete grounded lower-center body root visible in every frame.',
  'visual-score-crossFrame-below-minimum': 'Use no morphing between frames: keep the same facial anatomy, markings, fur or line pattern, limb shapes, and body proportions throughout the clip.',
  'visual-score-crossAction-below-minimum': 'Keep the exact reference neutral proportions, face, costume, and accessories so this action belongs to the same pet as its other actions.',
  'visual-score-style-below-minimum': 'Preserve the reference rendering style and material throughout; do not add new realism, smoothing, texture, lighting, or a different drawing style.',
  'visual-score-smallScale-below-minimum': 'Keep a crisp silhouette, clean edges, and readable facial features at a 32-pixel preview; avoid motion blur and added fine detail.',
  'visual-score-actionReadability-below-minimum': 'Show visibly distinct but bounded motion phases using only the body parts assigned by the requested action; do not replace the action with a different gesture.',
  'visual-defect-action-unreadable': 'Show visibly distinct but bounded motion phases using only the body parts assigned by the requested action; do not replace the action with a different gesture.',
  'visual-defect-cross-frame-inconsistent': 'Use no morphing between frames: keep the same facial anatomy, markings, fur or line pattern, limb shapes, and body proportions throughout the clip.',
  'visual-defect-style-drift': 'Preserve the reference rendering style and material throughout; do not add new realism, smoothing, texture, lighting, or a different drawing style.',
  'visual-defect-small-scale-unreadable': 'Keep a crisp silhouette, clean edges, and readable facial features at a 32-pixel preview; avoid motion blur and added fine detail.'
})

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
  const sourceAnchors = (processed?.frameMetrics || []).map((frame) => Number(frame.root?.y) / Number(frame.canvas?.height))
  const rawTrajectory = sourceAnchors.length === frameCount && sourceAnchors.every(Number.isFinite)
    ? { minY: Math.min(...sourceAnchors), maxY: Math.max(...sourceAnchors) }
    : null
  const metrics = {
    version: 2,
    inputSha256: String(processed?.spriteSheet?.sha256 || ''),
    sourceDimensions: { width: Number(processed?.canvas?.width) || 0, height: Number(processed?.canvas?.height) || 0 },
    canvas: { width: 128, height: 128 },
    layout: { columns, rows, cellCount: columns * rows, unusedCells: Array.from({ length: columns * rows - frameCount }, (_, index) => frameCount + index) },
    rawTrajectory,
    frames: frameMetrics
  }
  return {
    frames,
    reviewFrames: sourceFrames.map((frame, index) => ({ index, path: frame.path, sha256: sha256File(frame.path) })),
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

const buildVideoPrompt = ({ driver, attemptKind = 'initial', failureCodes = [] }) => {
  const actionId = driver.actionId
  const beats = driver.framePlan.map((beat) => beat.replace(/^Frame \d+:\s*/i, '')).join('; ')
  const isRunningGait = actionId === 'running-right'
  const loopContract = driver.loop
    ? isRunningGait
      ? 'Show one complete gait cycle with continuous motion. The first and final extracted frames must share the same right-facing gait phase, root position, body scale, camera framing, and background, so the next contact follows smoothly across the loop boundary. Keep the gait active through the end of the clip.'
      : 'Frame 1 and the final frame must depict the same neutral pose, root position, silhouette, body scale, camera framing, and background. Complete all visible motion in the middle of the clip, then fully settle back to that exact starting state before the final frame; do not end mid-motion.'
    : 'Begin and end on fully readable poses with no cut-off motion.'
  const actionGuidance = isRunningGait
    ? 'Run in place using one strict 90-degree right-facing side profile in every frame, with the beak or face pointing right and only the near eye visible; do not turn toward front or three-quarter view. Animate only both legs and feet: keep the head, eyes, beak, wings, chest marking, body outline, camera, and root fixed. Make the eight gait phases unmistakable and high-contrast: at each contact one foot is planted under the body while the other is clearly extended, then show down, passing, and up with visibly separated feet before reversing their roles. Keep the body root centered. Do not shuffle in place, stand still, flap, wave, blink, turn, or replace the gait with a hop. The reference defines identity; the ordered gait plan defines the pose and facing direction.'
    : actionId === 'idle'
    ? 'For idle, only the eyelids may move: show one natural blink in the middle with the entire body completely still. Keep wings, arms, paws, hands, feet, and tail in their exact reference resting pose throughout. Keep the mouth or beak shape unchanged and closed. Keep the head and body outline, facial geometry, body dimensions, and chest completely fixed throughout the clip.'
    : actionId === 'jumping'
      ? 'For jumping, use a conservative jump height, keep the complete airborne pose in the middle 60 percent of the frame, and retain at least 20 percent empty space above the highest body point.'
      : ''
  const repairInstructions = attemptKind === 'repair'
    ? [...new Set((Array.isArray(failureCodes) ? failureCodes : [])
        .map((code) => isRunningGait && code === 'loop-seam-too-large'
          ? 'Close the loop on the same right-facing gait phase with the root, camera, and character scale fixed; keep the locomotion limbs cycling across the boundary.'
          : VIDEO_REPAIR_INSTRUCTIONS[String(code || '')])
        .filter(Boolean))]
    : []
  const repairGuidance = attemptKind === 'repair'
    ? `This is a repair pass for a rejected result. ${repairInstructions.join(' ') || 'Correct the rejected temporal result while preserving identity, framing, and the ordered motion plan.'}`
    : ''
  const loopOutcome = actionId === 'idle'
    ? 'Return a short seamless loop with exactly one clearly visible blink and no other visible movement.'
    : 'Return a short seamless loop with visibly distinct motion phases.'
  return [
    `Animate the exact character in the provided first-frame image performing ${actionId}. The first-frame image is the sole appearance reference.`,
    'Preserve the exact face, markings, body proportions, accessories, palette, material, lighting, camera distance, and silhouette from the reference image.',
    `Use this ordered motion plan: ${beats}.`,
    'Full body visible in every frame, locked camera, centered grounded root, one subject only, no text, no logo, no props, no particles, no detached effects.',
    'Keep at least 12 percent empty margin around the full character in every frame; no body part may touch or cross any image edge.',
    actionGuidance,
    'Use a flat uniform chroma green background #12ff4d for matting; no gradient, shadows, floor, or background movement.',
    loopContract,
    repairGuidance,
    loopOutcome
  ].filter(Boolean).join(' ')
}

const runVideoAction = async ({
  dataDir,
  run,
  action,
  canonical,
  startFrame = canonical,
  model = 'grok-imagine-video-1.5',
  fps = 12,
  canvas = { width: 512, height: 512 },
  scaleProfile = {},
  outputRelativeDir = `runs/${run?.runId || 'run'}/video`,
  attemptKind = 'initial',
  failureCodes = [],
  signal,
  decode = extractVideoFrames,
  bridge = callBridge,
  processFrames = processFrameSequence
} = {}) => {
  const runId = String(run?.runId || '').trim()
  const actionId = String(action?.actionId || '').trim().toLowerCase()
  if (!runId || !actionId) throw runnerError('Video action run and action identifiers are required')
  signal?.throwIfAborted()
  const reference = resolveReference({ dataDir, reference: canonical })
  const startReference = resolveReference({ dataDir, reference: startFrame })
  const relativeDir = String(outputRelativeDir || '').replace(/\\/g, '/').replace(/\/$/, '')
  if (!relativeDir || relativeDir.startsWith('/') || relativeDir.split('/').some((part) => !part || part === '..' || part === '.') || relativeDir.includes('\0')) {
    throw runnerError('Video action output path is invalid')
  }
  // Video codecs cannot retain canonical alpha. Supply the same chroma and
  // aspect ratio used by the decoder/matte pipeline from the very first frame.
  const firstFrameRelativePath = `${relativeDir}/inputs/first-frame.png`
  const firstFramePath = path.resolve(dataDir, ...firstFrameRelativePath.split('/'))
  fs.mkdirSync(path.dirname(firstFramePath), { recursive: true })
  const [videoWidth, videoHeight] = PROVIDER_VIDEO_SIZE.split('x').map(Number)
  await sharp(path.resolve(dataDir, startReference.relativePath))
    .resize({ width: videoWidth, height: videoHeight, fit: 'contain', background: '#12ff4d' })
    .flatten({ background: '#12ff4d' }).png().toFile(firstFramePath)
  signal?.throwIfAborted()
  const providerReference = { relativePath: firstFrameRelativePath, fileName: 'first-frame.png', mimeType: 'image/png', sha256: sha256File(firstFramePath) }
  const driver = createMotionDriver({ actionId, motionPresetId: action?.motionPresetId || '', motionParameters: action?.motionParameters || {}, fps })
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
  const providerRequest = {
    runId,
    model,
    prompt: buildVideoPrompt({ driver, attemptKind, failureCodes }),
    referenceImages: [{ ...providerReference, role: 'canonical-identity' }],
    seconds: Math.max(1, Math.round(durationMs / 1000)),
    // Keep the Provider's temporal output at a video-native 16:9/720p size.
    // The Creator canvas is an independent 512px sprite normalization target.
    size: PROVIDER_VIDEO_SIZE,
    request: {
      background: { mode: 'solid', color: '#12ff4d' },
      aspect_ratio: PROVIDER_VIDEO_ASPECT_RATIO,
      resolution: '720p',
      motionDriverSha256: driver.sha256
    },
    output: { dataRelativeDir: rawRelativeDir, fileName: `${safeSegment(actionId, 'action')}.mp4` }
  }
  let response
  for (let attempt = 1; attempt <= providerTask.retryPolicy.maxAttempts; attempt += 1) {
    try {
      response = await bridge('/creator/model-video-generate', providerRequest, { signal })
      break
    } catch (error) {
      if (!error?.retryable || attempt >= providerTask.retryPolicy.maxAttempts) throw error
      await new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(signal.reason || error)
          return
        }
        const onAbort = () => {
          clearTimeout(timer)
          reject(signal.reason || error)
        }
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort)
          resolve()
        }, providerTask.retryPolicy.backoffMs * attempt)
        signal?.addEventListener('abort', onAbort, { once: true })
      })
    }
  }
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
    anchorPolicy: action.anchorPolicy,
    targetStandingHeightRatio: (Number(scaleProfile?.runtimeStandingHeightPx) || 92) / (Number(scaleProfile?.runtimeCell?.height) || 128),
    signal
  })
  const rawTemporalQuality = analyzeTemporalQuality({ frames: processed.frameMetrics, loop: driver.loop })
  const finalFrameMetrics = Array.isArray(processed.normalizedFrameMetrics) && processed.normalizedFrameMetrics.length
    ? processed.normalizedFrameMetrics
    : processed.frameMetrics
  const temporalQuality = analyzeTemporalQuality({ frames: finalFrameMetrics, loop: driver.loop })
  const identityQuality = await analyzeIdentityConsistency({
    referencePath: path.resolve(dataDir, reference.relativePath),
    framePaths: (processed.normalizedFrames || []).map((frame) => frame.path)
  })
  const combinedFailures = [...new Set([...(temporalQuality.failures || []), ...(identityQuality.failures || [])])]
  const combinedTemporalQuality = Object.freeze({
    ...temporalQuality,
    ok: combinedFailures.length === 0,
    failures: Object.freeze(combinedFailures),
    metrics: Object.freeze({ ...temporalQuality.metrics, ...identityQuality.metrics })
  })
  return Object.freeze({
    ok: combinedTemporalQuality.ok,
    actionId,
    model,
    driver,
    providerTask,
    providerReference,
    rawVideo: { ...output, relativePath: output.dataRelativePath },
    decoded,
    processed,
    rawTemporalQuality,
    identityQuality,
    temporalQuality: combinedTemporalQuality
  })
}

module.exports = { buildVideoPrompt, createVideoCandidateArtifacts, isVideoTechnicalFailure, runVideoAction, runnerError }
