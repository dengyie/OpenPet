const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
const { measureBodyMask } = require('./character-scale-profile')
const { createMotionDriver } = require('./motion-driver-registry')
const { processFrameSequence } = require('./video-matte-pipeline')
const { analyzeTemporalQuality } = require('./video-stabilizer')
const { createVideoCandidateArtifacts } = require('./video-action-runner')

const RENDERER = 'canonical-support-rig-v1'
const error = (message, code = 'canonical_rig_invalid') => Object.assign(new Error(message), { code })
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const fileHash = file => hash(fs.readFileSync(file))
const normalizedRelative = value => {
  const relative = String(value || '').replace(/\\/g, '/')
  if (!relative || relative.startsWith('/') || /^[a-zA-Z]:/.test(relative) || relative.includes('\0') || relative.split('/').some(part => !part || part === '.' || part === '..')) throw error('Rig path must be a safe relative path inside the data directory')
  return relative
}
const inside = (dataDir, relativePath) => {
  const root = fs.realpathSync(dataDir)
  const absolute = path.resolve(root, normalizedRelative(relativePath))
  let ancestor = absolute
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor)
  const actual = fs.realpathSync(ancestor)
  const relative = path.relative(root, actual)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw error('Rig path escaped the Creator data directory')
  return absolute
}
const relative = (root, absolute) => path.relative(root, absolute).split(path.sep).join('/')
const canceled = signal => signal?.throwIfAborted()
const supportsCanonicalRig = ({ actionId, characterClass = 'grounded-compact-character' }) => actionId === 'jumping' && characterClass === 'grounded-compact-character'
const normalizeRigProvenance = value => {
  if (value == null) return undefined
  if (value.kind !== 'canonical-rig' || value.renderer !== RENDERER || !/^[a-f0-9]{64}$/.test(value.canonicalSha256) || !/^[a-f0-9]{64}$/.test(value.motionDriverSha256) || !/^[a-f0-9]{64}$/.test(value.manifest?.sha256)) throw error('Canonical rig provenance is invalid')
  return { kind: 'canonical-rig', renderer: RENDERER, canonicalSha256: value.canonicalSha256, motionDriverSha256: value.motionDriverSha256, manifest: { relativePath: normalizedRelative(value.manifest.relativePath), sha256: value.manifest.sha256 } }
}
const paddedFramePixels = framePath => sharp({ create: { width: 192, height: 208, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: framePath, left: 32, top: 40 }]).png().toBuffer()
  .then(bytes => sharp(bytes).ensureAlpha().raw().toBuffer())
const recordedFile = (dataDir, file) => ({ relativePath: relative(dataDir, file.path), sha256: file.sha256 || fileHash(file.path) })
const processedFiles = processed => [
  ...(processed?.reviewFrames || []),
  ...['rawSheet', 'processedSheet', 'contactSheet', 'gif'].map(role => processed?.[role])
]

const renderCanonicalSupportRig = async ({ dataDir, canonical, action, characterClass = 'grounded-compact-character', outputRelativeDir, profile = {}, signal } = {}) => {
  canceled(signal)
  dataDir = fs.realpathSync(dataDir)
  if (!supportsCanonicalRig({ actionId: action?.actionId, characterClass })) throw error('Canonical support rig does not support this action or anatomy', 'canonical_rig_unsupported')
  const sourcePath = inside(dataDir, canonical?.relativePath)
  const outputDir = inside(dataDir, outputRelativeDir)
  const sourceBytes = fs.readFileSync(sourcePath)
  if (!/^[a-f0-9]{64}$/.test(String(canonical?.sha256 || '')) || hash(sourceBytes) !== canonical.sha256) throw error('Canonical rig source hash mismatch', 'canonical_rig_source_mismatch')
  const decoded = await sharp(sourceBytes, { limitInputPixels: 2048 * 2048 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { data, info } = decoded
  if (info.width < 64 || info.height < 64 || info.width > 2048 || info.height > 2048) throw error('Canonical rig source dimensions must be 64 to 2048 pixels')
  const measured = measureBodyMask({ data, width: info.width, height: info.height, characterClass })
  if (measured.empty || measured.unmatchedComponents.length) throw error('Canonical rig requires one complete source body')
  const b = measured.bodyBounds
  if (b.minX <= 0 || b.minY <= 0 || b.maxX >= info.width - 1 || b.maxY >= info.height - 1) throw error('Canonical rig source body is clipped')
  const width = b.maxX - b.minX + 1
  const height = b.maxY - b.minY + 1
  const split = Math.round(height * 0.84)
  const source = await sharp(sourceBytes).extract({ left: b.minX, top: b.minY, width, height }).png().toBuffer()
  const upper = await sharp(source).extract({ left: 0, top: 0, width, height: split }).png().toBuffer()
  const lower = await sharp(source).extract({ left: 0, top: split, width, height: height - split }).png().toBuffer()
  const driver = createMotionDriver({ actionId: action.actionId, motionPresetId: action.motionPresetId, motionParameters: action.motionParameters })
  if (action.frameCount !== driver.frameCount) throw error('Canonical rig action frame count does not match the registered driver')
  const motionScale = driver.motionParameters.intensity === 'subtle' ? 0.85 : 1
  const transforms = [
    { phase: 'anticipation', lift: -0.015, supportScaleY: 0.72 },
    { phase: 'takeoff', lift: 0.12, supportScaleY: 1.08 },
    { phase: 'airborne-peak', lift: 0.29, supportScaleY: 0.94 },
    { phase: 'landing', lift: -0.017, supportScaleY: 0.70 },
    { phase: 'grounded-recovery', lift: 0, supportScaleY: 1 }
  ].map(transform => ({ ...transform, lift: transform.lift * motionScale, supportScaleY: 1 + (transform.supportScaleY - 1) * motionScale }))
  canceled(signal)
  if (fs.existsSync(outputDir)) throw error('Canonical rig output already exists')
  fs.mkdirSync(outputDir, { recursive: true })
  const scale = Math.min(512 * 0.58 / height, 512 * 0.70 / width)
  const framePaths = []
  for (const [index, transform] of transforms.entries()) {
    canceled(signal)
    const lowerHeight = Math.max(1, Math.round((height - split) * transform.supportScaleY))
    const support = await sharp(lower).resize({ width, height: lowerHeight, fit: 'fill' }).png().toBuffer()
    const assembled = await sharp({ create: { width, height: split + lowerHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: upper, left: 0, top: 0 }, { input: support, left: 0, top: split }]).png().toBuffer()
    const targetWidth = Math.max(1, Math.round(width * scale))
    const targetHeight = Math.max(1, Math.round((split + lowerHeight) * scale))
    const posed = await sharp(assembled).resize({ width: targetWidth, height: targetHeight, fit: 'fill' }).png().toBuffer()
    const file = path.join(outputDir, `source-${index + 1}.png`)
    const top = Math.round(450 - transform.lift * height * scale - targetHeight)
    if (top <= 0 || top + targetHeight >= 512) throw error('Canonical rig phase exceeds the declared canvas')
    await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: posed, left: Math.round((512 - targetWidth) / 2), top }]).png().toFile(file)
    framePaths.push(file)
  }
  const normalized = await processFrameSequence({ framePaths, outputDir: path.join(outputDir, 'normalized'), canvasWidth: 512, canvasHeight: 512, backgroundMode: 'source-alpha', anchorPolicy: action.anchorPolicy, targetStandingHeightRatio: (Number(profile.runtimeStandingHeightPx) || 92) / (Number(profile.runtimeCell?.height) || 128), signal })
  canceled(signal)
  const processed = await createVideoCandidateArtifacts({ processed: normalized, outputDir: path.join(outputDir, 'artifacts'), layout: action.layout, expectedFrameCount: driver.frameCount, characterClass })
  const temporalQuality = analyzeTemporalQuality({ frames: normalized.normalizedFrameMetrics, loop: driver.loop })
  // Transparent compositing rounds some partially transparent RGB channels.
  // Bind both complete representations rather than comparing a cropped padded
  // frame with the pre-composite pixels or ignoring their transparent borders.
  const runtimeFrames = await Promise.all(processed.frames.map(async frame => ({ relativePath: relative(dataDir, frame.path), sha256: frame.sha256, pixelSha256: hash(await sharp(frame.path).ensureAlpha().raw().toBuffer()), paddedPixelSha256: hash(await paddedFramePixels(frame.path)) })))
  const manifest = {
    version: 1, renderer: RENDERER, actionId: action.actionId,
    source: { relativePath: canonical.relativePath, sha256: canonical.sha256, width: info.width, height: info.height, bounds: b },
    rig: { type: 'continuous-lower-support', splitY: b.minY + split },
    driver, transforms,
    sourceFrames: framePaths.map(file => ({ relativePath: relative(dataDir, file), sha256: fileHash(file) })), runtimeFrames,
    processed: {
      ...Object.fromEntries(['rawSheet', 'processedSheet', 'contactSheet', 'gif'].map(role => [role, recordedFile(dataDir, processed[role])])),
      reviewFrames: processed.reviewFrames.map(frame => ({ index: frame.index, ...recordedFile(dataDir, frame) })),
      metrics: processed.metrics
    },
    temporalQuality
  }
  const manifestPath = path.join(outputDir, 'rig-manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  canceled(signal)
  return { processed, temporalQuality, driver, manifestPath, provenance: { kind: 'canonical-rig', renderer: RENDERER, canonicalSha256: canonical.sha256, motionDriverSha256: driver.sha256, manifest: { relativePath: relative(dataDir, manifestPath), sha256: fileHash(manifestPath) } } }
}

const readCanonicalRigManifest = ({ dataDir, provenance, actionId, canonicalSha256 }) => {
  dataDir = fs.realpathSync(dataDir)
  provenance = normalizeRigProvenance(provenance)
  if (!provenance) throw error('Official rig row requires canonical rig provenance')
  if (canonicalSha256 && canonicalSha256 !== provenance.canonicalSha256) throw error('Canonical rig does not belong to the accepted canonical')
  const manifestPath = inside(dataDir, provenance.manifest?.relativePath)
  if (fs.statSync(manifestPath).size > 256 * 1024) throw error('Canonical rig manifest is too large')
  if (fileHash(manifestPath) !== provenance.manifest?.sha256) throw error('Canonical rig manifest hash mismatch')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  if (manifest.version !== 1 || manifest.renderer !== RENDERER || (actionId && manifest.actionId !== actionId) || !supportsCanonicalRig({ actionId: manifest.actionId })) throw error('Canonical rig manifest action or renderer mismatch')
  if (fileHash(inside(dataDir, manifest.source.relativePath)) !== provenance.canonicalSha256 || manifest.source.sha256 !== provenance.canonicalSha256) throw error('Canonical rig source hash mismatch')
  const driver = createMotionDriver(manifest.driver)
  if (driver.sha256 !== manifest.driver.sha256 || driver.sha256 !== provenance.motionDriverSha256) throw error('Canonical rig motion driver hash mismatch')
  if (manifest.runtimeFrames?.length !== driver.frameCount || manifest.sourceFrames?.length !== driver.frameCount || manifest.processed?.reviewFrames?.length !== driver.frameCount) throw error('Canonical rig frame count mismatch')
  for (const file of [manifest.source, ...manifest.runtimeFrames, ...manifest.sourceFrames, ...processedFiles(manifest.processed)]) {
    if (!file || !/^[a-f0-9]{64}$/.test(file.sha256) || fileHash(inside(dataDir, file.relativePath)) !== file.sha256) throw error('Canonical rig retained frame or artifact hash mismatch')
  }
  return manifest
}

const validateCanonicalRigRow = async ({ dataDir, provenance, frames, actionId, canonicalSha256 }) => {
  dataDir = fs.realpathSync(dataDir)
  const manifest = readCanonicalRigManifest({ dataDir, provenance, actionId, canonicalSha256 })
  if (!Array.isArray(frames) || frames.length !== manifest.driver.frameCount) throw error('Canonical rig frame count mismatch')
  for (const [index, frame] of frames.entries()) {
    const recorded = manifest.runtimeFrames[index]
    const framePath = frame.path || inside(dataDir, frame.relativePath)
    const actualPath = inside(dataDir, relative(dataDir, fs.realpathSync(framePath)))
    const metadata = await sharp(actualPath).metadata()
    let expectedPixelHash = recorded.pixelSha256
    if (metadata.width === 192 && metadata.height === 208) expectedPixelHash = recorded.paddedPixelSha256
    else if (metadata.width !== 128 || metadata.height !== 128) throw error('Canonical rig runtime frame dimensions mismatch')
    if (hash(await sharp(actualPath).ensureAlpha().raw().toBuffer()) !== expectedPixelHash) throw error('Canonical rig runtime frame pixel mismatch')
  }
  return manifest
}

const restoreCanonicalRigCandidate = async ({ dataDir, provenance, actionId, canonicalSha256 }) => {
  const manifest = readCanonicalRigManifest({ dataDir, provenance, actionId, canonicalSha256 })
  const file = entry => ({ ...entry, path: inside(dataDir, entry.relativePath) })
  const frames = manifest.runtimeFrames.map((entry, index) => ({ ...file(entry), index }))
  await validateCanonicalRigRow({ dataDir, provenance, frames, actionId, canonicalSha256 })
  return {
    processed: {
      ...Object.fromEntries(['rawSheet', 'processedSheet', 'contactSheet', 'gif'].map(role => [role, file(manifest.processed[role])])),
      frames, reviewFrames: manifest.processed.reviewFrames.map(file), metrics: manifest.processed.metrics
    },
    temporalQuality: manifest.temporalQuality
  }
}

const exportCanonicalRigEvidence = async ({ dataDir, outputDir, provenance, frames, actionId, canonicalSha256 }) => {
  const manifest = await validateCanonicalRigRow({ dataDir, provenance, frames, actionId, canonicalSha256 })
  fs.mkdirSync(outputDir, { recursive: true })
  const rowFrames = frames.map(frame => ({ relativePath: relative(fs.realpathSync(dataDir), frame.path || inside(dataDir, frame.relativePath)), sha256: fileHash(frame.path || inside(dataDir, frame.relativePath)) }))
  const files = [provenance.manifest, manifest.source, ...manifest.sourceFrames, ...manifest.runtimeFrames, ...processedFiles(manifest.processed), ...rowFrames]
  for (const entry of files) {
    const source = inside(dataDir, entry.relativePath)
    const target = inside(outputDir, entry.relativePath)
    if (source === target) throw error('Rig evidence export must have an independent output root')
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(source, target)
    if (fileHash(target) !== entry.sha256) throw error('Canonical rig export hash mismatch')
  }
  return { manifest: provenance.manifest, rowFrames, fileCount: new Set(files.map(file => file.relativePath)).size }
}
module.exports = { renderCanonicalSupportRig, supportsCanonicalRig, validateCanonicalRigRow, normalizeRigProvenance, readCanonicalRigManifest, restoreCanonicalRigCandidate, exportCanonicalRigEvidence }
