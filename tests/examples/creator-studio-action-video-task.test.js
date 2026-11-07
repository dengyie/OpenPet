const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const sharp = require('sharp')

const { createActionVideoTask } = require('../../examples/plugins/creator-studio/lib/action-video-task')
const { createMotionDriver } = require('../../examples/plugins/creator-studio/lib/motion-driver-registry')
const { createFrameTiming, createLoopIndexes, selectFrameIndexes, selectJumpingFrameIndexes } = require('../../examples/plugins/creator-studio/lib/video-frame-extractor')
const { extractVideoFrames } = require('../../examples/plugins/creator-studio/lib/video-decoder')
const { createVideoArtifact } = require('../../examples/plugins/creator-studio/lib/video-artifact-contract')
const { analyzeTemporalQuality, computeGlobalBounds, createStablePlacements } = require('../../examples/plugins/creator-studio/lib/video-stabilizer')
const { DEFAULT_BACKGROUND_TOLERANCE, processFrameSequence, processMatteFrame } = require('../../examples/plugins/creator-studio/lib/video-matte-pipeline')
const { createProviderVideoTask } = require('../../examples/plugins/creator-studio/lib/provider-video-task')
const { createVideoRunnerRequest, createVideoRunnerResponse } = require('../../examples/plugins/creator-studio/lib/video-runner-protocol')
const { createVideoRunnerService } = require('../../examples/plugins/creator-studio/lib/video-runner-service')
const { buildVideoPrompt, createVideoCandidateArtifacts, isVideoTechnicalFailure, runVideoAction } = require('../../examples/plugins/creator-studio/lib/video-action-runner')

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)

test('official motion driver is deterministic and carries a frame plan hash', () => {
  const driver = createMotionDriver({ actionId: 'waving' })
  assert.equal(driver.actionId, 'waving')
  assert.equal(driver.frameCount, 4)
  assert.equal(driver.fps, 12)
  assert.equal(driver.loop, true)
  assert.match(driver.sha256, /^[a-f0-9]{64}$/)
  assert.deepEqual(driver, createMotionDriver({ actionId: 'waving' }))
})

test('video prompt binds exact loop closure and safe character margins', () => {
  const driver = createMotionDriver({ actionId: 'idle' })
  const prompt = buildVideoPrompt({
    run: { input: { petName: 'Mori', prompt: 'A cream pixel-art cat with a red scarf and one blue eye.' } },
    action: { actionId: 'idle' },
    driver
  })
  assert.match(prompt, /provided first.frame image performing idle/i)
  assert.match(prompt, /Frame 1 and the final frame must depict the same neutral pose/i)
  assert.match(prompt, /fully settle back to that exact starting state/i)
  assert.match(prompt, /at least 12 percent empty margin/i)
  assert.match(prompt, /no body part may touch or cross any image edge/i)
})

test('action video instructions cannot inherit conflicting motions from the character brief', () => {
  const prompt = buildVideoPrompt({
    run: { input: { petName: 'Pip', originalPrompt: 'Wave both wings, jump and fly up. Add rainbow text.' } },
    action: { actionId: 'idle', motionPrompt: 'waving and jumping' },
    driver: createMotionDriver({ actionId: 'idle' })
  })
  assert.match(prompt, /performing idle/i)
  assert.doesNotMatch(prompt, /rainbow text|fly up|performing waving and jumping/i)
  assert.match(prompt, /wings.*resting pose/i)
  assert.match(prompt, /mouth or beak.*closed/i)
  assert.doesNotMatch(createMotionDriver({ actionId: 'idle' }).framePlan.join(' '), /secondary movement/i)
})

test('idle motion isolates one blink without requesting body breathing or squash', () => {
  const driver = createMotionDriver({ actionId: 'idle' })
  const prompt = buildVideoPrompt({ driver })
  assert.equal(driver.frameCount, 6)
  assert.match(driver.framePlan.join(' '), /close.*eyelids/i)
  assert.match(driver.framePlan.join(' '), /reopen.*eyes/i)
  assert.doesNotMatch(driver.framePlan.join(' '), /breath|inhale|chest expansion/i)
  assert.match(prompt, /only.*eyelids.*move/i)
  assert.match(prompt, /body.*still/i)
  assert.doesNotMatch(prompt, /chest breathing|chest expansion|breathing cycle/i)
})

test('running video loops keep the right-facing gait active without returning to front-facing idle', () => {
  const driver = createMotionDriver({ actionId: 'running-right' })
  for (const attemptKind of ['initial', 'repair']) {
    const prompt = buildVideoPrompt({ driver, attemptKind, failureCodes: ['loop-seam-too-large', 'visual-defect-action-unreadable'] })
    assert.match(prompt, /right-facing.*run.*in place/i)
    assert.match(prompt, /contact.*down.*passing.*up/i)
    assert.match(prompt, /complete gait cycle/i)
    assert.match(prompt, /first.*final.*gait phase/i)
    assert.doesNotMatch(prompt, /same neutral pose|fully settle|finish settling|all visible motion in the middle/i)
    assert.match(prompt, /do not turn.*front/i)
    assert.match(prompt, /strict 90-degree right-facing side profile/i)
    assert.match(prompt, /animate only both legs and feet/i)
    assert.match(prompt, /one foot is planted.*other is clearly extended/i)
    assert.match(prompt, /do not shuffle.*flap.*wave.*blink/i)
  }
})

test('waving video isolates the selected greeting appendage and preserves the face', () => {
  for (const leadSide of ['viewer-left', 'viewer-right']) {
    const prompt = buildVideoPrompt({ driver: createMotionDriver({ actionId: 'waving', motionParameters: { leadSide } }) })
    assert.match(prompt, new RegExp(`only.*${leadSide}.*greeting appendage`, 'i'))
    assert.match(prompt, /opposite appendage.*resting pose/i)
    assert.match(prompt, /eyes.*mouth or beak.*unchanged/i)
    assert.match(prompt, /do not.*both.*appendages|never.*bilateral/i)
  }
})

test('running work-state video names focused work rather than locomotion and supplies a concrete in-place gesture', () => {
  const prompt = buildVideoPrompt({ driver: createMotionDriver({ actionId: 'running' }) })
  assert.match(prompt, /performing focused work/i)
  assert.doesNotMatch(prompt, /performing running[. ]/i)
  assert.match(prompt, /feet.*fixed.*ground/i)
  assert.match(prompt, /existing.*appendage.*inward.*chest/i)
  assert.match(prompt, /do not walk.*run.*hop.*wave.*flap/i)
  assert.match(prompt, /eyes.*mouth or beak.*unchanged/i)
})

test('review video specifies a deliberate inspection gesture without speaking or turning away', () => {
  const prompt = buildVideoPrompt({ driver: createMotionDriver({ actionId: 'review' }) })
  assert.match(prompt, /performing deliberate inspection/i)
  assert.match(prompt, /existing.*appendage.*chin/i)
  assert.match(prompt, /head.*tilt.*acknowledgement nod/i)
  assert.match(prompt, /feet.*fixed/i)
  assert.match(prompt, /mouth or beak.*closed/i)
  assert.match(prompt, /do not.*speak.*turn.*profile/i)
})

test('video repair prompt targets the recorded temporal failure', () => {
  const driver = createMotionDriver({ actionId: 'idle' })
  const initial = buildVideoPrompt({
    run: { input: { petName: 'Mori' } },
    action: { actionId: 'idle' },
    driver
  })
  const repair = buildVideoPrompt({
    run: { input: { petName: 'Mori' } },
    action: { actionId: 'idle' },
    driver,
    attemptKind: 'repair',
    failureCodes: ['loop-seam-too-large']
  })
  assert.notEqual(repair, initial)
  assert.match(repair, /repair pass/i)
  assert.match(repair, /first and final extracted frames/i)
  assert.match(repair, /locked camera/i)
})

test('video repair prompt applies the actual visual evaluator failures', () => {
  const prompt = buildVideoPrompt({
    run: { input: { petName: 'Mikan' } }, action: { actionId: 'idle' },
    driver: createMotionDriver({ actionId: 'idle' }), attemptKind: 'repair',
    failureCodes: ['visual-score-crossFrame-below-minimum', 'visual-score-style-below-minimum', 'visual-score-smallScale-below-minimum', 'visual-defect-action-unreadable']
  })
  assert.match(prompt, /no morphing between frames/i)
  assert.match(prompt, /reference rendering style/i)
  assert.match(prompt, /32.pixel/i)
  assert.match(prompt, /exactly one clearly visible blink/i)
  assert.match(prompt, /no other visible movement/i)
})

test('jumping video prompt reserves conservative top clearance', () => {
  const driver = createMotionDriver({ actionId: 'jumping' })
  const prompt = buildVideoPrompt({
    run: { input: { petName: 'Mori' } },
    action: { actionId: 'jumping' },
    driver,
    attemptKind: 'repair',
    failureCodes: ['frame-edge-contact']
  })
  assert.match(prompt, /conservative jump height/i)
  assert.match(prompt, /8 to 10 percent of the full frame height/i)
  assert.match(prompt, /keep.*wings.*resting pose/i)
  assert.match(prompt, /mouth or beak.*unchanged and closed/i)
  assert.match(prompt, /vertical translation.*unchanged reference body/i)
  assert.match(prompt, /shading gradients.*outline thickness/i)
})

test('jump phase extraction chooses a single ordered takeoff, peak and landing from actual roots', () => {
  const frames = [90, 91, 85, 70, 60, 40, 42, 60, 75, 89, 90].map((y) => ({ root: { y }, canvas: { height: 100 } }))
  assert.deepEqual(selectJumpingFrameIndexes(frames), [0, 3, 5, 9, 10])
  assert.throws(() => selectJumpingFrameIndexes(frames.slice(0, 5)), /ordered takeoff/)
  assert.throws(() => selectJumpingFrameIndexes([90, 85, 40, 50, 60].map((y) => ({ root: { y }, canvas: { height: 100 } }))), /landing before recovery/)
})

test('video technical eligibility rejects temporal integrity failures', () => {
  for (const failure of ['frame-edge-contact', 'detached-effect-contamination', 'identity-drift', 'loop-seam-too-large', 'motion-is-static']) {
    assert.equal(isVideoTechnicalFailure(failure), true)
  }
  assert.equal(isVideoTechnicalFailure('body-scale-variance-high'), false)
})

test('action video task binds canonical identity and motion driver', () => {
  const driver = createMotionDriver({ actionId: 'waving' })
  const task = createActionVideoTask({
    schemaVersion: 1,
    taskType: 'action-video-v1',
    actionId: 'waving',
    motionPresetId: driver.motionPresetId,
    motionParameters: driver.motionParameters,
    reference: { sha256: HASH_A, role: 'canonical-identity' },
    motionDriver: { sha256: driver.sha256, fps: driver.fps, frameCount: driver.frameCount, loop: driver.loop },
    canvas: { width: 512, height: 512 },
    fps: 12,
    durationMs: 333,
    background: { mode: 'solid', color: '#12ff4d', purpose: 'matting-assist' },
    camera: 'locked',
    output: 'video'
  })
  assert.equal(task.framePlanHash, driver.sha256 !== '' ? task.framePlanHash : '')
  assert.equal(Object.isFrozen(task), true)
  assert.throws(() => createActionVideoTask({
    schemaVersion: 1,
    taskType: 'action-video-v1',
    actionId: 'waving',
    motionPresetId: driver.motionPresetId,
    motionParameters: driver.motionParameters,
    reference: { sha256: HASH_A, role: 'canonical-identity' },
    motionDriver: { sha256: HASH_B, fps: driver.fps, frameCount: driver.frameCount, loop: driver.loop },
    canvas: { width: 512, height: 512 },
    fps: 12,
    durationMs: 333,
    background: { mode: 'solid', color: '#12ff4d', purpose: 'matting-assist' },
    camera: 'locked',
    output: 'video'
  }), /sha256 does not match/)
  assert.throws(() => createActionVideoTask({
    schemaVersion: 1,
    taskType: 'action-video-v1',
    actionId: 'waving',
    motionPresetId: driver.motionPresetId,
    motionParameters: driver.motionParameters,
    reference: { sha256: HASH_A, role: 'canonical-identity' },
    motionDriver: { sha256: driver.sha256, fps: driver.fps, frameCount: driver.frameCount, loop: driver.loop },
    canvas: { width: 512, height: 512 },
    fps: 12,
    durationMs: 333,
    background: { mode: 'solid', color: '#ffffff', purpose: 'matting-assist' },
    camera: 'moving',
    output: 'video'
  }), /camera must be locked/)
})

test('frame extractor preserves ordered samples and loop modes', () => {
  const selection = selectFrameIndexes({ sourceFrameCount: 24, sourceFps: 24, targetFrameCount: 6, targetFps: 12 })
  assert.deepEqual(selection.indexes, [0, 5, 9, 14, 18, 23])
  assert.deepEqual(createFrameTiming({ indexes: selection.indexes, sourceFps: 24, targetFps: 12 })[0], {
    frame: 0, sourceIndex: 0, sourceTimeMs: 0, outputTimeMs: 0
  })
  assert.deepEqual(createLoopIndexes({ indexes: [0, 1, 2, 3], mode: 'ping-pong' }), [0, 1, 2, 3, 2, 1])
})

test('gait sampling retains eight distinct cyclic phases without the repeated endpoint', () => {
  // A 24 FPS one-second cycle has 24 phases plus a repeated closing pose.
  const selection = selectFrameIndexes({ sourceFrameCount: 25, sourceFps: 24, targetFrameCount: 8, targetFps: 12, loop: true })
  const phases = selection.indexes.map(index => index / 24)
  assert.deepEqual(phases, [0, 1 / 8, 2 / 8, 3 / 8, 4 / 8, 5 / 8, 6 / 8, 7 / 8])
  assert.equal(new Set(phases.map(phase => phase % 1)).size, 8)
  assert.throws(() => selectFrameIndexes({ sourceFrameCount: 8, sourceFps: 24, targetFrameCount: 8, loop: true }), /targetFrameCount/)
})

test('video decoder samples the full source timeline including the final frame', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-video-decoder-'))
  const videoPath = path.join(root, 'source.mp4')
  fs.writeFileSync(videoPath, 'fixture-video')
  const calls = []
  const spawnImpl = (command, args) => {
    calls.push({ command, args })
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => {}
    process.nextTick(() => {
      if (command === 'ffprobe') {
        child.stdout.emit('data', Buffer.from('24\n'))
      } else {
        const pattern = args.at(-1)
        for (let index = 1; index <= 6; index += 1) {
          fs.writeFileSync(pattern.replace('%04d', String(index).padStart(4, '0')), `frame-${index}`)
        }
      }
      child.emit('close', 0)
    })
    return child
  }
  const result = await extractVideoFrames({ videoPath, outputDir: 'frames', dataDir: root, fps: 12, maxFrames: 6, spawnImpl })
  assert.deepEqual(result.sourceIndexes, [0, 5, 9, 14, 18, 23])
  assert.equal(result.frameCount, 6)
  assert.equal(calls[0].command, 'ffprobe')
  assert.equal(calls[1].command, 'ffmpeg')
  assert.match(calls[1].args[calls[1].args.indexOf('-vf') + 1], /eq\(n\\,0\).*eq\(n\\,23\)/)
})

test('jump decoder accepts a short complete source and rejects fewer than five frames', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-video-decode-min-'))
  const videoPath = path.join(root, 'source.mp4')
  fs.writeFileSync(videoPath, 'fixture-video')
  let sourceCount = 12
  let decodeCount = 0
  const spawnImpl = (command, args) => {
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => {}
    process.nextTick(() => {
      if (command === 'ffprobe') child.stdout.emit('data', Buffer.from(`${sourceCount}\n`))
      else {
        decodeCount += 1
        const count = Number(args[args.indexOf('-frames:v') + 1])
        for (let index = 1; index <= count; index += 1) fs.writeFileSync(args.at(-1).replace('%04d', String(index).padStart(4, '0')), `frame-${index}`)
      }
      child.emit('close', 0)
    })
    return child
  }
  const options = { videoPath, outputDir: 'frames', dataDir: root, fps: 12, maxFrames: 40, minFrames: 5, spawnImpl }
  const result = await extractVideoFrames(options)
  assert.equal(result.frameCount, 12)
  assert.deepEqual(result.sourceIndexes, Array.from({ length: 12 }, (_, index) => index))
  sourceCount = 4
  await assert.rejects(() => extractVideoFrames({ ...options, outputDir: 'short' }), { code: 'video_decoder_frame_count_mismatch' })
  await assert.rejects(() => extractVideoFrames({ ...options, minFrames: 41 }), /minimum frame count is invalid/)
  assert.equal(decodeCount, 1, 'invalid sources must not start ffmpeg')
})

test('gait decoder excludes closing pose and rejects insufficient distinct source phases before ffmpeg', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-video-gait-decode-'))
  const videoPath = path.join(root, 'source.mp4')
  fs.writeFileSync(videoPath, 'fixture-video')
  let sourceCount = 25
  let decodeCount = 0
  const spawnImpl = (command, args) => {
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => {}
    process.nextTick(() => {
      if (command === 'ffprobe') child.stdout.emit('data', Buffer.from(`${sourceCount}\n`))
      else {
        decodeCount += 1
        const count = Number(args[args.indexOf('-frames:v') + 1])
        for (let index = 1; index <= count; index += 1) fs.writeFileSync(args.at(-1).replace('%04d', String(index).padStart(4, '0')), `frame-${index}`)
      }
      child.emit('close', 0)
    })
    return child
  }
  const options = { videoPath, outputDir: 'frames', dataDir: root, maxFrames: 8, loop: true, spawnImpl }
  const result = await extractVideoFrames(options)
  assert.deepEqual(result.sourceIndexes, [0, 3, 6, 9, 12, 15, 18, 21])
  assert.equal(result.frameCount, 8)
  sourceCount = 8
  await assert.rejects(() => extractVideoFrames({ ...options, outputDir: 'short' }), { code: 'video_decoder_frame_count_mismatch' })
  assert.equal(decodeCount, 1)
})

test('stabilizer computes a global envelope and common baseline', () => {
  const frames = [
    { bbox: { left: 4, top: 10, width: 20, height: 30 } },
    { bbox: { left: 7, top: 8, width: 18, height: 32 } }
  ]
  assert.deepEqual(computeGlobalBounds(frames), { left: 4, top: 8, right: 25, bottom: 40, width: 21, height: 32 })
  const result = createStablePlacements({ frames, canvasWidth: 128, canvasHeight: 128 })
  assert.equal(result.placements.length, 2)
  assert.equal(result.placements[0].baseline, result.placements[1].baseline)
  assert.equal(result.baseline, 115.2)
  assert.ok(result.scale > 0)
  assert.throws(() => createStablePlacements({ frames, canvasWidth: 128, canvasHeight: 128, padding: Number.NaN }), /padding is invalid/)
})

test('temporal quality rejects dropped masks and static frames', () => {
  const result = analyzeTemporalQuality({
    loop: true,
    frames: [
      { bbox: { left: 1, top: 2, width: 10, height: 20 }, root: { x: 5, y: 22 }, alphaCoverage: 0.1, maskCoverage: 0.1, hash: HASH_A },
      { bbox: { left: 1, top: 2, width: 10, height: 20 }, root: { x: 5, y: 22 }, alphaCoverage: 0.1, maskCoverage: 0, hash: HASH_A }
    ]
  })
  assert.equal(result.ok, false)
  assert.deepEqual(result.failures, ['mask-dropout', 'motion-is-static'])
  const missing = analyzeTemporalQuality({
    frames: [{ bbox: { left: 1, top: 2, width: 10, height: 20 }, root: { x: 5, y: 22 }, hash: HASH_A }]
  })
  assert.deepEqual(missing.failures, ['mask-coverage-missing', 'alpha-coverage-missing'])
})

test('temporal quality rejects edge contact, detached contamination, and a broken loop seam', () => {
  const result = analyzeTemporalQuality({
    loop: true,
    frames: [
      { bbox: { left: 0, top: 2, width: 10, height: 20 }, root: { x: 5, y: 22 }, alphaCoverage: 0.1, maskCoverage: 0.1, hash: HASH_A, edgeTouch: true, unmatchedComponentCount: 1 },
      { bbox: { left: 20, top: 2, width: 10, height: 20 }, root: { x: 25, y: 22 }, alphaCoverage: 0.1, maskCoverage: 0.1, hash: HASH_B, edgeTouch: false, unmatchedComponentCount: 0 }
    ]
  })
  assert.equal(result.ok, false)
  assert.ok(result.failures.includes('frame-edge-contact'))
  assert.ok(result.failures.includes('detached-effect-contamination'))
  assert.ok(result.failures.includes('loop-seam-too-large'))
  assert.ok(result.metrics.loopSeamDistanceRatio > 0.2)
})

test('temporal quality ignores background-only pixel changes when measuring motion', () => {
  const result = analyzeTemporalQuality({
    frames: [
      { bbox: { left: 1, top: 2, width: 10, height: 20 }, root: { x: 5, y: 22 }, alphaCoverage: 0.11, maskCoverage: 0.1, hash: HASH_A, bodyMaskSha256: HASH_B },
      { bbox: { left: 1, top: 2, width: 10, height: 20 }, root: { x: 5, y: 22 }, alphaCoverage: 0.12, maskCoverage: 0.1, hash: HASH_B, bodyMaskSha256: HASH_B }
    ]
  })
  assert.ok(result.failures.includes('motion-is-static'))
  assert.equal(result.metrics.uniqueMotionFrameCount, 1)
})

test('video artifact contract rejects traversal and preserves frame cardinality', () => {
  const artifact = createVideoArtifact({
    schemaVersion: 1,
    runId: 'run-1',
    actionId: 'waving',
    canonicalSha256: HASH_A,
    motionDriverSha256: HASH_B,
    rawVideo: { relativePath: 'raw/waving.mp4', sha256: HASH_B, mimeType: 'video/mp4' },
    frames: { fps: 12, frameCount: 2, width: 128, height: 128, relativePaths: ['alpha/waving/01.png', 'alpha/waving/02.png'] },
    spriteSheet: { relativePath: 'spritesheet.png', sha256: HASH_A, mimeType: 'image/png', columns: 2, rows: 1 },
    sidecar: { relativePath: 'video-sidecar.json', sha256: HASH_B },
    temporalQuality: { version: 1, ok: true, failures: [], metrics: {} }
  })
  assert.equal(artifact.frames.frameCount, 2)
  assert.equal(artifact.spriteSheet.columns, 2)
  assert.equal(artifact.sidecar.relativePath, 'video-sidecar.json')
  assert.throws(() => createVideoArtifact({
    schemaVersion: 1,
    runId: 'run-1',
    actionId: 'waving',
    canonicalSha256: HASH_A,
    motionDriverSha256: HASH_B,
    rawVideo: { relativePath: '../raw/waving.mp4', sha256: HASH_B, mimeType: 'video/mp4' },
    frames: { fps: 12, frameCount: 0, width: 128, height: 128, relativePaths: [] },
    spriteSheet: { relativePath: 'spritesheet.png', sha256: HASH_A, mimeType: 'image/png', columns: 1, rows: 1 },
    sidecar: { relativePath: 'video-sidecar.json', sha256: HASH_B },
    temporalQuality: {}
  }), /safe relative path/)
})

test('video matte removes edge-connected green while preserving an enclosed white subject', async () => {
  const source = await sharp({
    create: { width: 12, height: 12, channels: 4, background: { r: 18, g: 255, b: 77, alpha: 1 } }
  }).composite([{
    input: await sharp({
      create: { width: 4, height: 6, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
    }).png().toBuffer(),
    left: 4,
    top: 3
  }]).png().toBuffer()
  const result = await processMatteFrame(source, { backgroundColor: '#12ff4d' })
  const { data, info } = await sharp(result.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  assert.equal(data[3], 0)
  const centerOffset = ((6 * info.width) + 6) * info.channels
  assert.equal(data[centerOffset + 3], 255)
  assert.ok(result.removedPixelRatio > 0.5)
  await assert.rejects(() => processMatteFrame(source, { tolerance: -1 }), /tolerance is invalid/)
})

test('video matte default tolerance handles compressed chroma spill', async () => {
  assert.equal(DEFAULT_BACKGROUND_TOLERANCE, 180)
  const source = await sharp({
    create: { width: 12, height: 12, channels: 4, background: { r: 20, g: 243, b: 15, alpha: 1 } }
  }).composite([{
    input: await sharp({
      create: { width: 4, height: 6, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
    }).png().toBuffer(),
    left: 4,
    top: 3
  }]).png().toBuffer()
  const result = await processMatteFrame(source, { backgroundColor: '#12ff4d' })
  const { data, info } = await sharp(result.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const centerOffset = ((6 * info.width) + 6) * info.channels
  assert.equal(data[centerOffset + 3], 255)
  assert.ok(result.removedPixelRatio > 0.5)
})

test('video frame sequence emits stable normalized frames and hashes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-video-matte-'))
  const inputDir = path.join(root, 'input')
  const outputDir = path.join(root, 'run')
  fs.mkdirSync(inputDir, { recursive: true })
  const framePaths = []
  for (let index = 0; index < 3; index += 1) {
    const framePath = path.join(inputDir, `${index}.png`)
    await sharp({
      create: { width: 16, height: 16, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
    }).png().toFile(framePath)
    framePaths.push(framePath)
  }
  const result = await processFrameSequence({
    framePaths,
    outputDir,
    canvasWidth: 32,
    canvasHeight: 32,
    fps: 12
  })
  assert.equal(result.frameCount, 3)
  assert.equal(result.normalizedFrames.length, 3)
  assert.equal(result.normalizedFrames[0].relativePath, 'normalized/0001.png')
  assert.match(result.normalizedFrames[0].sha256, /^[a-f0-9]{64}$/)
  assert.equal(result.normalizedFrameMetrics.length, 3)
  assert.equal(result.normalizedFrameMetrics.every((metric) => metric.edgeTouch === false), true)
  assert.deepEqual(result.placements.placements.map((placement) => placement.baseline), [28.8, 28.8, 28.8])
  assert.equal(result.spriteSheet.relativePath, 'spritesheet.png')
  assert.equal(fs.existsSync(result.sidecarPath), true)
  const sidecar = JSON.parse(fs.readFileSync(result.sidecarPath, 'utf8'))
  assert.match(sidecar.spriteSheet.sha256, /^[a-f0-9]{64}$/)
  assert.equal(sidecar.normalizedMetrics.length, 3)
})

test('video frame sequence stops before writing the next frame after cancellation', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-video-matte-cancel-'))
  const inputPath = path.join(root, 'frame.png')
  await sharp({
    create: { width: 8, height: 8, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
  }).png().toFile(inputPath)
  const controller = new AbortController()
  controller.abort(new Error('test cancellation'))
  await assert.rejects(() => processFrameSequence({
    framePaths: [inputPath],
    outputDir: path.join(root, 'run'),
    canvasWidth: 16,
    canvasHeight: 16,
    signal: controller.signal
  }), /test cancellation/)
})

test('video stabilization crops the subject before scaling and preserves its aspect ratio', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-video-subject-geometry-'))
  const subject = await sharp({ create: { width: 20, height: 30, channels: 4, background: '#eaa344' } }).png().toBuffer()
  const framePaths = []
  for (const [index, left] of [8, 40].entries()) {
    const framePath = path.join(root, `frame-${index}.png`)
    await sharp({ create: { width: 80, height: 60, channels: 4, background: '#12ff4d' } })
      .composite([{ input: subject, left, top: 15 }]).png().toFile(framePath)
    framePaths.push(framePath)
  }
  const result = await processFrameSequence({ framePaths, outputDir: path.join(root, 'output'), canvasWidth: 100, canvasHeight: 100 })
  for (const metric of result.normalizedFrameMetrics) {
    assert.ok(Math.abs(metric.bbox.width / metric.bbox.height - 2 / 3) < 0.03, `subject was distorted to ${metric.bbox.width}x${metric.bbox.height}`)
    assert.ok(metric.bbox.height >= 78, 'subject must occupy the intended normalized height')
  }
  assert.deepEqual(result.normalizedFrameMetrics[0].bbox, result.normalizedFrameMetrics[1].bbox)
})

test('video normalization preserves jumping displacement and the declared runtime body scale', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-video-jump-'))
  const subject = await sharp({ create: { width: 20, height: 30, channels: 4, background: '#eaa344' } }).png().toBuffer()
  const framePaths = []
  for (const [index, top] of [50, 35, 50].entries()) {
    const framePath = path.join(root, `frame-${index}.png`)
    await sharp({ create: { width: 80, height: 100, channels: 4, background: '#12ff4d' } })
      .composite([{ input: subject, left: 30, top }]).png().toFile(framePath)
    framePaths.push(framePath)
  }
  const result = await processFrameSequence({
    framePaths, outputDir: path.join(root, 'output'), canvasWidth: 128, canvasHeight: 128,
    anchorPolicy: 'action-relative-root-v1', targetStandingHeightRatio: 92 / 128
  })
  const metrics = result.normalizedFrameMetrics
  assert.ok(metrics[0].root.y - metrics[1].root.y >= 18, 'normalization erased the takeoff')
  assert.deepEqual(metrics[0].bbox, metrics[2].bbox, 'landing must return to the original baseline')
  assert.ok(metrics.every((frame) => Math.abs(frame.bbox.height - 92) <= 1), 'runtime scale must match the profile')
  const candidate = await createVideoCandidateArtifacts({
    processed: result, outputDir: path.join(root, 'candidate'), layout: { columns: 2, rows: 2 }, expectedFrameCount: 3
  })
  assert.ok(Math.abs(candidate.metrics.rawTrajectory.maxY - candidate.metrics.rawTrajectory.minY - 0.15) < 0.01)
  const grounded = await processFrameSequence({
    framePaths, outputDir: path.join(root, 'grounded'), canvasWidth: 128, canvasHeight: 128,
    targetStandingHeightRatio: 92 / 128
  })
  assert.deepEqual(grounded.normalizedFrameMetrics[0].bbox, grounded.normalizedFrameMetrics[1].bbox)
  const groundedCandidate = await createVideoCandidateArtifacts({
    processed: grounded, outputDir: path.join(root, 'grounded-candidate'), layout: { columns: 2, rows: 2 }, expectedFrameCount: 3
  })
  assert.ok(Math.abs(groundedCandidate.metrics.rawTrajectory.maxY - groundedCandidate.metrics.rawTrajectory.minY - 0.15) < 0.01, 'raw trajectory must come from source frames even when output is stabilized')
})

test('airborne normalization fits a complete trajectory while preserving body size and landing', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-video-jump-envelope-'))
  const subject = await sharp({ create: { width: 20, height: 30, channels: 4, background: '#eaa344' } }).png().toBuffer()
  const framePaths = []
  for (const [index, top] of [60, 45, 30, 45, 60].entries()) {
    const framePath = path.join(root, `frame-${index}.png`)
    await sharp({ create: { width: 80, height: 100, channels: 4, background: '#12ff4d' } })
      .composite([{ input: subject, left: 30, top }]).png().toFile(framePath)
    framePaths.push(framePath)
  }
  const result = await processFrameSequence({ framePaths, outputDir: path.join(root, 'output'), canvasWidth: 128, canvasHeight: 128,
    anchorPolicy: 'action-relative-root-v1', targetStandingHeightRatio: 92 / 128 })
  assert.ok(result.normalizedFrameMetrics.every((m) => m.bbox.height === 92 && !m.edgeTouch))
  const roots = result.normalizedFrameMetrics.map((m) => m.root.y)
  assert.deepEqual(result.normalizedFrameMetrics[0].bbox, result.normalizedFrameMetrics[4].bbox)
  assert.ok(roots[0] - roots[2] >= 10, 'must retain a visible jump')
  assert.ok(Math.abs((roots[0] - roots[1]) / (roots[0] - roots[2]) - 0.5) < 0.08, 'must preserve trajectory timing instead of clamping the peak')
  assert.ok(result.placements.trajectoryScale > 0 && result.placements.trajectoryScale < 1)
  const candidate = await createVideoCandidateArtifacts({ processed: result, outputDir: path.join(root, 'candidate'), layout: { columns: 3, rows: 2 }, expectedFrameCount: 5 })
  assert.ok(candidate.metrics.rawTrajectory.maxY - candidate.metrics.rawTrajectory.minY > 0.29)
  const excursion = candidate.metrics.outputTrajectory.maxY - candidate.metrics.outputTrajectory.minY
  assert.ok(excursion >= 0.08 && excursion < 0.18, 'QA must receive the actual runtime excursion')
  assert.equal(JSON.parse(fs.readFileSync(result.sidecarPath)).trajectoryScale, result.placements.trajectoryScale)
})

test('airborne retargeting rejects a source subject already clipped by the video edge', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-video-clipped-jump-'))
  const framePath = path.join(root, 'frame.png')
  const subject = await sharp({ create: { width: 20, height: 30, channels: 4, background: '#eaa344' } }).png().toBuffer()
  await sharp({ create: { width: 80, height: 100, channels: 4, background: '#12ff4d' } })
    .composite([{ input: subject, left: 30, top: 0 }]).png().toFile(framePath)
  await assert.rejects(() => processFrameSequence({ framePaths: [framePath], outputDir: path.join(root, 'output'), canvasWidth: 128, canvasHeight: 128,
    anchorPolicy: 'action-relative-root-v1', targetStandingHeightRatio: 92 / 128 }), { code: 'video_source_clipped' })
})

test('jump phase selection retains runtime edge clearance after 512-to-128 resampling', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-video-runtime-jump-'))
  const subject = await sharp({ create: { width: 20, height: 30, channels: 4, background: '#eaa344' } }).png().toBuffer()
  const framePaths = []
  for (const [index, top] of [60, 60, 55, 45, 35, 30, 32, 45, 55, 60, 60].entries()) {
    const framePath = path.join(root, `frame-${index}.png`)
    await sharp({ create: { width: 80, height: 100, channels: 4, background: '#12ff4d' } })
      .composite([{ input: subject, left: 30, top }]).png().toFile(framePath)
    framePaths.push(framePath)
  }
  const processed = await processFrameSequence({ framePaths, outputDir: path.join(root, 'output'), canvasWidth: 512, canvasHeight: 512,
    anchorPolicy: 'action-relative-root-v1', targetStandingHeightRatio: 92 / 128, selectJumpPhases: true })
  assert.deepEqual(processed.selectedSourceIndexes, [0, 3, 5, 9, 10])
  assert.deepEqual(JSON.parse(fs.readFileSync(processed.sidecarPath)).selectedSourceIndexes, [0, 3, 5, 9, 10])
  const candidate = await createVideoCandidateArtifacts({ processed, outputDir: path.join(root, 'candidate'), layout: { columns: 3, rows: 2 }, expectedFrameCount: 5 })
  assert.ok(candidate.metrics.frames.every((frame) => !frame.edgeTouch), 'downsampling must not put alpha on the runtime cell edge')
  const excursion = candidate.metrics.outputTrajectory.maxY - candidate.metrics.outputTrajectory.minY
  assert.ok(excursion >= 0.08, 'runtime jump must remain visible')
})

test('video grounded normalization uses the profile standing height', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-video-profile-scale-'))
  const framePath = path.join(root, 'frame.png')
  const subject = await sharp({ create: { width: 20, height: 30, channels: 4, background: '#eaa344' } }).png().toBuffer()
  await sharp({ create: { width: 80, height: 100, channels: 4, background: '#12ff4d' } })
    .composite([{ input: subject, left: 30, top: 50 }]).png().toFile(framePath)
  const result = await processFrameSequence({
    framePaths: [framePath], outputDir: path.join(root, 'output'), canvasWidth: 128, canvasHeight: 128,
    targetStandingHeightRatio: 92 / 128
  })
  assert.equal(result.normalizedFrameMetrics[0].bbox.height, 92)
})

test('video candidates materialize a reusable 1024 grid and runtime frames', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-video-candidate-'))
  const sourceDir = path.join(root, 'source')
  fs.mkdirSync(sourceDir, { recursive: true })
  const normalizedFrames = []
  for (let index = 0; index < 4; index += 1) {
    const framePath = path.join(sourceDir, `${index}.png`)
    await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await sharp({ create: { width: 18 + index, height: 28, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer(), left: 22, top: 20 }])
      .png().toFile(framePath)
    normalizedFrames.push({ path: framePath })
  }
  const result = await createVideoCandidateArtifacts({
    processed: { normalizedFrames, canvas: { width: 64, height: 64 }, spriteSheet: { sha256: HASH_A } },
    outputDir: path.join(root, 'candidate'),
    layout: { columns: 2, rows: 2 },
    expectedFrameCount: 4
  })
  assert.equal(result.frames.length, 4)
  assert.deepEqual(result.reviewFrames.map(frame => frame.path), normalizedFrames.map(frame => frame.path))
  assert.equal((await sharp(result.reviewFrames[0].path).metadata()).width, 64, 'review retains source detail rather than an upsampled runtime image')
  assert.equal((await sharp(result.rawSheet.path).metadata()).width, 1024)
  assert.equal((await sharp(result.rawSheet.path).metadata()).height, 1024)
  assert.equal((await sharp(result.processedSheet.path).metadata()).width, 256)
  assert.equal(result.metrics.frames.length, 4)
  assert.ok(fs.existsSync(result.gif.path))
  await assert.rejects(() => createVideoCandidateArtifacts({
    processed: { normalizedFrames: normalizedFrames.slice(0, 3), canvas: { width: 64, height: 64 } },
    outputDir: path.join(root, 'mismatch'),
    layout: { columns: 2, rows: 2 },
    expectedFrameCount: 4
  }), /returned 3 frames; expected 4/)
})

test('provider video task binds the action contract and rejects timing drift', () => {
  const driver = createMotionDriver({ actionId: 'jumping' })
  const actionTask = {
    schemaVersion: 1,
    taskType: 'action-video-v1',
    actionId: 'jumping',
    motionPresetId: driver.motionPresetId,
    motionParameters: driver.motionParameters,
    reference: { sha256: HASH_A, role: 'canonical-identity' },
    motionDriver: { sha256: driver.sha256, fps: driver.fps, frameCount: driver.frameCount, loop: driver.loop },
    canvas: { width: 512, height: 512 },
    fps: driver.fps,
    durationMs: Math.round((driver.frameCount / driver.fps) * 1000),
    background: { mode: 'solid', color: '#12ff4d', purpose: 'matting-assist' },
    camera: 'locked',
    output: 'video'
  }
  const providerInput = {
    schemaVersion: 1,
    taskType: 'provider-video-generation',
    providerId: 'mango-api',
    model: 'one-to-all-1-3b',
    actionTask,
    request: {
      backgroundColor: '#12ff4d',
      backgroundMode: 'solid',
      camera: 'locked',
      durationMs: actionTask.durationMs,
      fps: driver.fps,
      outputMimeType: 'video/mp4'
    },
    retryPolicy: { maxAttempts: 2, backoffMs: 1000 }
  }
  const task = createProviderVideoTask(providerInput)
  assert.match(task.requestHash, /^[a-f0-9]{64}$/)
  assert.equal(task.actionTask.actionId, 'jumping')
  assert.throws(() => createProviderVideoTask({
    ...providerInput,
    request: { ...providerInput.request, fps: 24 }
  }), /timing must match/)
})

test('provider video task accepts the normalized action task emitted by the video runner', () => {
  const driver = createMotionDriver({ actionId: 'idle' })
  const durationMs = Math.round((driver.frameCount / driver.fps) * 1000)
  const actionTask = createActionVideoTask({
    schemaVersion: 1,
    taskType: 'action-video-v1',
    actionId: 'idle',
    motionPresetId: driver.motionPresetId,
    motionParameters: driver.motionParameters,
    reference: { sha256: HASH_A, role: 'canonical-identity' },
    motionDriver: { sha256: driver.sha256, fps: driver.fps, frameCount: driver.frameCount, loop: driver.loop },
    canvas: { width: 512, height: 512 },
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
    model: 'grok-imagine-video',
    actionTask,
    request: {
      backgroundColor: '#12ff4d',
      backgroundMode: 'solid',
      camera: 'locked',
      durationMs,
      fps: driver.fps,
      outputMimeType: 'video/mp4'
    },
    retryPolicy: { maxAttempts: 2, backoffMs: 1000 }
  })
  assert.equal(providerTask.actionTask.framePlanHash, actionTask.framePlanHash)
  assert.throws(() => createProviderVideoTask({
    schemaVersion: providerTask.schemaVersion,
    taskType: providerTask.taskType,
    providerId: providerTask.providerId,
    model: providerTask.model,
    actionTask: { ...actionTask, framePlanHash: HASH_B },
    request: providerTask.request,
    retryPolicy: providerTask.retryPolicy
  }), /framePlanHash does not match/)
})

test('video runner protocol binds the request hash and redacts failure detail', () => {
  const driver = createMotionDriver({ actionId: 'waving' })
  const actionTask = {
    schemaVersion: 1,
    taskType: 'action-video-v1',
    actionId: 'waving',
    motionPresetId: driver.motionPresetId,
    motionParameters: driver.motionParameters,
    reference: { sha256: HASH_A, role: 'canonical-identity' },
    motionDriver: { sha256: driver.sha256, fps: driver.fps, frameCount: driver.frameCount, loop: driver.loop },
    canvas: { width: 512, height: 512 },
    fps: driver.fps,
    durationMs: Math.round((driver.frameCount / driver.fps) * 1000),
    background: { mode: 'solid', color: '#12ff4d', purpose: 'matting-assist' },
    camera: 'locked',
    output: 'video'
  }
  const providerTask = {
    schemaVersion: 1,
    taskType: 'provider-video-generation',
    providerId: 'mango-api',
    model: 'one-to-all-1-3b',
    actionTask,
    request: {
      backgroundColor: '#12ff4d', backgroundMode: 'solid', camera: 'locked',
      durationMs: actionTask.durationMs, fps: driver.fps, outputMimeType: 'video/mp4'
    },
    retryPolicy: { maxAttempts: 1, backoffMs: 0 }
  }
  const request = createVideoRunnerRequest({
    requestId: 'request-1', runId: 'run-1', providerTask,
    input: { canonicalSha256: HASH_A, canonicalRelativePath: 'inputs/canonical.png', motionDriverRelativePath: 'inputs/motion/waving.json' }
  })
  const response = createVideoRunnerResponse({
    request, status: 'failed', error: { code: 'provider-timeout', retryable: true }
  })
  assert.equal(response.requestSha256, request.requestSha256)
  assert.deepEqual(response.error, { code: 'provider-timeout', retryable: true })
  assert.throws(() => createVideoRunnerResponse({ request, status: 'failed', error: { code: 'provider-timeout', retryable: true, detail: 'secret' } }), /fields are invalid/)
})

test('video runner service retries only retryable failures and is idempotent', async () => {
  const driver = createMotionDriver({ actionId: 'waving' })
  const actionTask = {
    schemaVersion: 1, taskType: 'action-video-v1', actionId: 'waving',
    motionPresetId: driver.motionPresetId, motionParameters: driver.motionParameters,
    reference: { sha256: HASH_A, role: 'canonical-identity' },
    motionDriver: { sha256: driver.sha256, fps: driver.fps, frameCount: driver.frameCount, loop: driver.loop },
    canvas: { width: 512, height: 512 }, fps: driver.fps,
    durationMs: Math.round((driver.frameCount / driver.fps) * 1000),
    background: { mode: 'solid', color: '#12ff4d', purpose: 'matting-assist' }, camera: 'locked', output: 'video'
  }
  const request = createVideoRunnerRequest({
    requestId: 'request-retry', runId: 'run-retry',
    providerTask: {
      schemaVersion: 1, taskType: 'provider-video-generation', providerId: 'mango-api', model: 'runner', actionTask,
      request: { backgroundColor: '#12ff4d', backgroundMode: 'solid', camera: 'locked', durationMs: actionTask.durationMs, fps: driver.fps, outputMimeType: 'video/mp4' },
      retryPolicy: { maxAttempts: 2, backoffMs: 0 }
    },
    input: { canonicalSha256: HASH_A, canonicalRelativePath: 'inputs/canonical.png', motionDriverRelativePath: 'inputs/motion/waving.json' }
  })
  let calls = 0
  const service = createVideoRunnerService({
    execute: async () => {
      calls += 1
      if (calls === 1) return { status: 'failed', error: { code: 'provider-timeout', retryable: true } }
      return { status: 'succeeded', rawVideo: { relativePath: 'raw/waving.mp4', sha256: HASH_B, mimeType: 'video/mp4' } }
    }
  })
  const first = await service.run(request)
  const second = await service.run(request)
  assert.equal(first.status, 'succeeded')
  assert.equal(second, first)
  assert.equal(calls, 2)
})

const createRunVideoActionFixture = async ({
  bridge,
  signal,
  action = { actionId: 'waving', motionPrompt: 'wave' },
  scaleProfile,
  attemptKind,
  failureCodes,
  processFrames,
  decode,
  referenceCreate,
  startFrameCreate,
  normalizedFramesFactory
}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-video-runner-'))
  const referencePath = path.join(root, 'reference.png')
  const rawPath = path.join(root, 'runs', 'run-video', 'video', 'raw', 'waving.mp4')
  fs.mkdirSync(path.dirname(rawPath), { recursive: true })
  if (referenceCreate) {
    await sharp({ create: referenceCreate }).png().toFile(referencePath)
  } else {
    await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toFile(referencePath)
  }
  fs.writeFileSync(rawPath, 'fixture-video')
  if (startFrameCreate) {
    await sharp({ create: startFrameCreate }).png().toFile(path.join(root, 'start.png'))
  }
  const fixtureFrameProcessor = async (options) => {
    const processed = processFrames
      ? await processFrames(options)
      : {
          normalizedFrames: [],
          frameMetrics: [
            { bbox: { left: 1, top: 1, width: 10, height: 20 }, root: { x: 1, y: 20 }, alphaCoverage: 0.8, maskCoverage: 0.8, hash: HASH_A },
            { bbox: { left: 1, top: 2, width: 10, height: 21 }, root: { x: 2, y: 21 }, alphaCoverage: 0.8, maskCoverage: 0.8, hash: HASH_B }
          ]
        }
    const normalizedFrames = normalizedFramesFactory
      ? await normalizedFramesFactory(options)
      : (processed.normalizedFrames || [])
    if (normalizedFrames.length) return { ...processed, normalizedFrames }
    const framePaths = []
    for (let index = 0; index < (processed.frameMetrics || []).length; index += 1) {
      const framePath = path.join(options.outputDir, 'fixture-normalized', `${index + 1}.png`)
      fs.mkdirSync(path.dirname(framePath), { recursive: true })
      await sharp({ create: { width: 8, height: 8, channels: 4, background: '#ffffff' } }).png().toFile(framePath)
      framePaths.push({ path: framePath })
    }
    return { ...processed, normalizedFrames: framePaths }
  }
  const result = await runVideoAction({
    dataDir: root,
    run: { runId: 'run-video', input: { petName: 'Test pet' } },
    action,
    scaleProfile,
    canonical: { relativePath: 'reference.png', sha256: HASH_A, fileName: 'reference.png' },
    ...(startFrameCreate ? { startFrame: { relativePath: 'start.png', sha256: HASH_B, fileName: 'start.png' } } : {}),
    attemptKind,
    failureCodes,
    signal,
    bridge,
    decode: decode || (async () => ({ framePaths: ['fixture-frame-1.png', 'fixture-frame-2.png'] })),
    processFrames: fixtureFrameProcessor
  })
  return { root, result }
}

test('video uses the action start pose while keeping canonical identity as the QA authority', async () => {
  let reference
  const { root, result } = await createRunVideoActionFixture({
    action: { actionId: 'running-right' },
    startFrameCreate: { width: 8, height: 8, channels: 4, background: '#3040ff' },
    bridge: async (_route, payload) => {
      reference = payload.referenceImages[0]
      return { result: { outputs: [{ dataRelativePath: 'runs/run-video/video/raw/waving.mp4', sha256: HASH_B }] } }
    }
  })
  const { data, info } = await sharp(path.join(root, reference.relativePath)).raw().toBuffer({ resolveWithObject: true })
  const center = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels
  assert.deepEqual([...data.subarray(center, center + 3)], [48, 64, 255])
  assert.equal(result.providerTask.actionTask.reference.sha256, HASH_A)
  assert.equal(result.identityQuality.ok, true, 'QA must compare output with the original canonical')
})

test('video runner uses periodic sampling only for locomotion and retains settling endpoints', async () => {
  for (const actionId of ['running-right', 'idle', 'waving', 'jumping']) {
    let decodedOptions
    await createRunVideoActionFixture({
      action: { actionId },
      bridge: async () => ({ result: { outputs: [{ dataRelativePath: 'runs/run-video/video/raw/waving.mp4', sha256: HASH_B }] } }),
      decode: async options => {
        decodedOptions = options
        return { framePaths: ['fixture-frame-1.png', 'fixture-frame-2.png'] }
      }
    })
    assert.equal(decodedOptions.loop, actionId === 'running-right')
  }
})

test('runVideoAction forwards the action anchor and supports the not-yet-created idle profile', async () => {
  for (const profile of [null, { runtimeStandingHeightPx: 90, runtimeCell: { height: 128 } }]) {
    let options
    await createRunVideoActionFixture({
      action: { actionId: 'jumping', anchorPolicy: 'action-relative-root-v1' },
      scaleProfile: profile,
      bridge: async () => ({ result: { outputs: [{ dataRelativePath: 'runs/run-video/video/raw/waving.mp4', sha256: HASH_B, mimeType: 'video/mp4' }] } }),
      processFrames: async (input) => {
        options = input
        return { normalizedFrames: [], frameMetrics: [
          { bbox: { left: 1, top: 2, width: 10, height: 20 }, root: { x: 6, y: 22 }, alphaCoverage: 0.1, maskCoverage: 0.1, hash: HASH_A },
          { bbox: { left: 1, top: 1, width: 10, height: 20 }, root: { x: 6, y: 21 }, alphaCoverage: 0.1, maskCoverage: 0.1, hash: HASH_B }
        ] }
      }
    })
    assert.equal(options.anchorPolicy, 'action-relative-root-v1')
    assert.equal(options.targetStandingHeightRatio, (profile?.runtimeStandingHeightPx || 92) / 128)
  }
})

test('runVideoAction retries a retryable bridge error once', async () => {
  let calls = 0
  const { result } = await createRunVideoActionFixture({
    bridge: async () => {
      calls += 1
      if (calls === 1) throw Object.assign(new Error('upstream timeout'), { retryable: true })
      return { result: { outputs: [{ dataRelativePath: 'runs/run-video/video/raw/waving.mp4', sha256: HASH_B, mimeType: 'video/mp4' }] } }
    }
  })
  assert.equal(calls, 2)
  assert.equal(result.ok, true)
  assert.equal(result.rawVideo.relativePath, 'runs/run-video/video/raw/waving.mp4')
})

test('runVideoAction keeps Provider video geometry independent from the sprite canvas', async () => {
  let request
  const { result } = await createRunVideoActionFixture({
    bridge: async (_route, payload) => {
      request = payload
      return { result: { outputs: [{ dataRelativePath: 'runs/run-video/video/raw/waving.mp4', sha256: HASH_B, mimeType: 'video/mp4' }] } }
    }
  })
  assert.equal(result.ok, true)
  assert.equal(request.size, '1280x720')
  assert.equal(request.request.aspect_ratio, '16:9')
  assert.equal(request.request.resolution, '720p')
})

test('runVideoAction uses the intensity and lead side from the sprite plan', async () => {
  let request
  const { result } = await createRunVideoActionFixture({
    action: { actionId: 'idle', motionParameters: { intensity: 'subtle', leadSide: 'viewer-right' } },
    bridge: async (_route, payload) => {
      request = payload
      return { result: { outputs: [{ dataRelativePath: 'runs/run-video/video/raw/idle.mp4', sha256: HASH_B, mimeType: 'video/mp4' }] } }
    }
  })
  assert.deepEqual(result.driver.motionParameters, { intensity: 'subtle', leadSide: 'viewer-right' })
  assert.match(request.prompt, /subtle intensity.*viewer-right/)
})

test('runVideoAction sends an opaque green first frame at the requested video aspect ratio', async () => {
  let sentReference
  const { root } = await createRunVideoActionFixture({
    referenceCreate: { width: 20, height: 30, channels: 4, background: { r: 255, g: 160, b: 70, alpha: 0.5 } },
    bridge: async (_route, request) => {
      sentReference = request.referenceImages[0]
      return { result: { outputs: [{ dataRelativePath: 'runs/run-video/video/raw/waving.mp4', sha256: HASH_B, mimeType: 'video/mp4' }] } }
    }
  })
  assert.notEqual(sentReference.relativePath, 'reference.png', 'canonical source must stay immutable')
  const prepared = await sharp(path.join(root, sentReference.relativePath)).raw().toBuffer({ resolveWithObject: true })
  assert.equal(prepared.info.width, 1280)
  assert.equal(prepared.info.height, 720)
  assert.deepEqual([...prepared.data.subarray(0, prepared.info.channels)], prepared.info.channels === 4 ? [18, 255, 77, 255] : [18, 255, 77])
  if (prepared.info.channels === 4) {
    for (let pixel = 3; pixel < prepared.data.length; pixel += 4) assert.equal(prepared.data[pixel], 255)
  }
  const source = await sharp(path.join(root, 'reference.png')).metadata()
  assert.equal(source.width, 20)
  assert.equal(source.height, 30)
  assert.equal(source.hasAlpha, true)
})

test('jumping first frame reserves overhead space without altering the canonical', async () => {
  let sentReference
  const { root } = await createRunVideoActionFixture({
    action: { actionId: 'jumping' },
    referenceCreate: { width: 512, height: 512, channels: 4, background: '#ff9f30' },
    bridge: async (_route, request) => {
      sentReference = request.referenceImages[0]
      return { result: { outputs: [{ dataRelativePath: 'runs/run-video/video/raw/waving.mp4', sha256: HASH_B }] } }
    }
  })
  const { data, info } = await sharp(path.join(root, sentReference.relativePath)).raw().toBuffer({ resolveWithObject: true })
  const at = (x, y) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)]
  assert.equal(info.width, 1280)
  assert.equal(info.height, 720)
  assert.deepEqual(at(640, 100), [18, 255, 77], 'top 20 percent must be empty before any jump')
  assert.deepEqual(at(640, 240), [255, 159, 48])
  assert.deepEqual(at(640, 719), [255, 159, 48], 'bottom alignment preserves the grounded start')
  assert.equal((await sharp(path.join(root, 'reference.png')).metadata()).height, 512)
})

test('runVideoAction gates on normalized frames while retaining raw temporal diagnostics', async () => {
  const rawMetrics = [
    { bbox: { left: 0, top: 0, width: 20, height: 20 }, root: { x: 10, y: 20 }, alphaCoverage: 0.8, maskCoverage: 0.8, hash: HASH_A, edgeTouch: true },
    { bbox: { left: 80, top: 0, width: 40, height: 40 }, root: { x: 100, y: 40 }, alphaCoverage: 0.8, maskCoverage: 0.8, hash: HASH_B, edgeTouch: true }
  ]
  const normalizedMetrics = [
    { bbox: { left: 40, top: 40, width: 20, height: 20 }, root: { x: 50, y: 60 }, alphaCoverage: 0.8, maskCoverage: 0.8, hash: HASH_A, edgeTouch: false },
    { bbox: { left: 40, top: 40, width: 20, height: 20 }, root: { x: 50, y: 60 }, alphaCoverage: 0.8, maskCoverage: 0.8, hash: HASH_B, edgeTouch: false }
  ]
  const { result } = await createRunVideoActionFixture({
    bridge: async () => ({ result: { outputs: [{ dataRelativePath: 'runs/run-video/video/raw/waving.mp4', sha256: HASH_B, mimeType: 'video/mp4' }] } }),
    processFrames: async () => ({ normalizedFrames: [], frameMetrics: rawMetrics, normalizedFrameMetrics: normalizedMetrics })
  })
  assert.equal(result.ok, true)
  assert.equal(result.temporalQuality.ok, true)
  assert.equal(result.rawTemporalQuality.ok, false)
  assert.ok(result.rawTemporalQuality.failures.includes('frame-edge-contact'))
  assert.ok(result.rawTemporalQuality.failures.includes('loop-seam-too-large'))
})

test('runVideoAction rejects a video whose subject aspect ratio drifts from the canonical identity', async () => {
  const { result } = await createRunVideoActionFixture({
    referenceCreate: { width: 80, height: 80, channels: 4, background: '#ffffff' },
    normalizedFramesFactory: async ({ outputDir }) => {
      const framePaths = []
      const svg = Buffer.from('<svg width="80" height="80" xmlns="http://www.w3.org/2000/svg"><rect x="35" y="20" width="10" height="45" fill="#ffffff"/></svg>')
      for (let index = 0; index < 2; index += 1) {
        const framePath = path.join(outputDir, 'identity-drift', `${index + 1}.png`)
        fs.mkdirSync(path.dirname(framePath), { recursive: true })
        await sharp(svg).png().toFile(framePath)
        framePaths.push({ path: framePath })
      }
      return framePaths
    },
    bridge: async () => ({ result: { outputs: [{ dataRelativePath: 'runs/run-video/video/raw/waving.mp4', sha256: HASH_B, mimeType: 'video/mp4' }] } }),
    processFrames: async () => ({
      normalizedFrames: [],
      frameMetrics: [
        { bbox: { left: 1, top: 1, width: 8, height: 40 }, root: { x: 1, y: 40 }, alphaCoverage: 0.8, maskCoverage: 0.8, hash: HASH_A },
        { bbox: { left: 1, top: 2, width: 8, height: 40 }, root: { x: 2, y: 40 }, alphaCoverage: 0.8, maskCoverage: 0.8, hash: HASH_B }
      ]
    })
  })
  assert.equal(result.ok, false)
  assert.equal(result.identityQuality.ok, false)
  assert.ok(result.temporalQuality.failures.includes('identity-drift'))
})

test('runVideoAction forwards repair failure context into the Provider prompt', async () => {
  let request
  await createRunVideoActionFixture({
    action: { actionId: 'jumping', motionPrompt: 'jump' },
    attemptKind: 'repair',
    failureCodes: ['frame-edge-contact'],
    bridge: async (_route, payload) => {
      request = payload
      return { result: { outputs: [{ dataRelativePath: 'runs/run-video/video/raw/waving.mp4', sha256: HASH_B, mimeType: 'video/mp4' }] } }
    }
  })
  assert.match(request.prompt, /repair pass/i)
  assert.match(request.prompt, /at least 20 percent empty space above/i)
})

test('runVideoAction does not retry a non-retryable bridge error', async () => {
  let calls = 0
  await assert.rejects(() => createRunVideoActionFixture({
    bridge: async () => {
      calls += 1
      throw Object.assign(new Error('invalid request'), { retryable: false })
    }
  }), /invalid request/)
  assert.equal(calls, 1)
})

test('runVideoAction cancels retry backoff when the request is aborted', async () => {
  const controller = new AbortController()
  let calls = 0
  const promise = createRunVideoActionFixture({
    signal: controller.signal,
    bridge: async () => {
      calls += 1
      if (calls === 1) {
        setImmediate(() => controller.abort(new Error('test cancellation')))
        throw Object.assign(new Error('upstream timeout'), { retryable: true })
      }
      return { result: { outputs: [{ dataRelativePath: 'runs/run-video/video/raw/waving.mp4', sha256: HASH_B, mimeType: 'video/mp4' }] } }
    }
  })
  await assert.rejects(() => promise, /test cancellation/)
  assert.equal(calls, 1)
})

test('video runner service coalesces concurrent duplicate requests', async () => {
  const driver = createMotionDriver({ actionId: 'waving' })
  const actionTask = {
    schemaVersion: 1, taskType: 'action-video-v1', actionId: 'waving',
    motionPresetId: driver.motionPresetId, motionParameters: driver.motionParameters,
    reference: { sha256: HASH_A, role: 'canonical-identity' },
    motionDriver: { sha256: driver.sha256, fps: driver.fps, frameCount: driver.frameCount, loop: driver.loop },
    canvas: { width: 512, height: 512 }, fps: driver.fps,
    durationMs: Math.round((driver.frameCount / driver.fps) * 1000),
    background: { mode: 'solid', color: '#12ff4d', purpose: 'matting-assist' }, camera: 'locked', output: 'video'
  }
  const request = createVideoRunnerRequest({
    requestId: 'request-concurrent', runId: 'run-concurrent',
    providerTask: {
      schemaVersion: 1, taskType: 'provider-video-generation', providerId: 'mango-api', model: 'runner', actionTask,
      request: { backgroundColor: '#12ff4d', backgroundMode: 'solid', camera: 'locked', durationMs: actionTask.durationMs, fps: driver.fps, outputMimeType: 'video/mp4' },
      retryPolicy: { maxAttempts: 1, backoffMs: 0 }
    },
    input: { canonicalSha256: HASH_A, canonicalRelativePath: 'inputs/canonical.png', motionDriverRelativePath: 'inputs/motion/waving.json' }
  })
  let calls = 0
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const service = createVideoRunnerService({
    execute: async () => {
      calls += 1
      await gate
      return { status: 'succeeded', rawVideo: { relativePath: 'raw/waving.mp4', sha256: HASH_B, mimeType: 'video/mp4' } }
    }
  })
  const firstPromise = service.run(request)
  await new Promise((resolve) => setImmediate(resolve))
  const secondPromise = service.run(request)
  release()
  const [first, second] = await Promise.all([firstPromise, secondPromise])
  assert.equal(first.status, 'succeeded')
  assert.equal(second, first)
  assert.equal(calls, 1)
})

test('Creator bridge does not resubmit a paid video after task polling exhausts', async () => {
  const { createGrokVideoProvider } = require('../../examples/plugins/creator-studio/lib/grok-video-provider')
  let posts = 0
  let bridgeCalls = 0
  const provider = createGrokVideoProvider({
    baseUrl: 'https://api.mangoqwq.com/v1', apiKey: 'runtime-only-key', sleepImpl: async () => {},
    fetchImpl: async (url) => {
      if (url.endsWith('/videos')) { posts += 1; return { ok: true, status: 200, json: async () => ({ id: 'paid-task', status: 'queued' }) } }
      return { ok: false, status: 503, json: async () => ({ error: { code: 'service_unavailable' } }) }
    }
  })
  await assert.rejects(createRunVideoActionFixture({ bridge: async () => {
    bridgeCalls += 1
    await provider.generateVideo({ model: 'grok-imagine-video', prompt: 'wave once', outputDir: fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-paid-task-')) })
  } }), { code: 'video_provider_retryable_http' })
  assert.equal(posts, 1)
  assert.equal(bridgeCalls, 1)
})
