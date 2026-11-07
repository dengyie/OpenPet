const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const sharp = require('sharp')
const { execFileSync, spawnSync } = require('node:child_process')
const { processFrameSequence } = require('../../examples/plugins/creator-studio/lib/video-matte-pipeline')
const rigModule = () => require('../../examples/plugins/creator-studio/lib/canonical-support-rig')
const renderCanonicalSupportRig = options => rigModule().renderCanonicalSupportRig(options)
const validateCanonicalRigRow = options => rigModule().validateCanonicalRigRow(options)
const { analyzeSpriteCandidate } = require('../../examples/plugins/creator-studio/lib/sprite-candidate-qa')
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const fixture = async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-support-rig-'))
  const canonicalPath = path.join(dataDir, 'canonical.png')
  const image = Buffer.from('<svg width="300" height="320"><defs><linearGradient id="g"><stop stop-color="#12ff4d"/><stop offset="1" stop-color="#ffe44d"/></linearGradient></defs><ellipse cx="150" cy="150" rx="90" ry="115" fill="url(#g)" stroke="#392310" stroke-width="5"/><path d="M105 245 L95 275 L122 275 L132 246 M165 246 L175 275 L200 275 L193 245" fill="#f78528" stroke="#392310" stroke-width="4"/><circle cx="119" cy="110" r="9" fill="#392310"/><circle cx="175" cy="110" r="9" fill="#392310"/></svg>')
  await sharp(image).png().toFile(canonicalPath)
  return { dataDir, canonical: { relativePath: 'canonical.png', sha256: hash(fs.readFileSync(canonicalPath)) }, action: { actionId: 'jumping', anchorPolicy: 'action-relative-root-v1', frameCount: 5, layout: { columns: 3, rows: 2 } }, profile: { runtimeStandingHeightPx: 92, runtimeCell: { width: 128, height: 128 } }, outputRelativeDir: 'candidates/jump-one' }
}

test('source-alpha normalization preserves visible green source pixels', async () => {
  const f = await fixture()
  await sharp({ create: { width: 32, height: 32, channels: 4, background: '#12ff4d' } }).png().toFile(path.join(f.dataDir, 'canonical.png'))
  const result = await processFrameSequence({ framePaths: [path.join(f.dataDir, 'canonical.png')], outputDir: path.join(f.dataDir, 'alpha'), canvasWidth: 512, canvasHeight: 512, backgroundMode: 'source-alpha' })
  const source = await sharp(path.join(f.dataDir, 'canonical.png')).ensureAlpha().raw().toBuffer()
  const alpha = await sharp(result.alphaFrames[0].path).ensureAlpha().raw().toBuffer()
  assert.deepEqual(alpha, source)
})

test('support rig creates auditable five-phase source-faithful jumping with unchanged QA', async () => {
  const f = await fixture()
  const result = await renderCanonicalSupportRig(f)
  assert.equal(result.provenance.kind, 'canonical-rig')
  assert.equal(result.processed.frames.length, 5)
  assert.equal(new Set(result.processed.frames.map(frame => frame.sha256)).size, 5)
  const manifest = JSON.parse(fs.readFileSync(path.join(f.dataDir, result.provenance.manifest.relativePath)))
  assert.equal(manifest.source.sha256, f.canonical.sha256)
  assert.deepEqual(manifest.transforms.map(t => t.phase), ['anticipation', 'takeoff', 'airborne-peak', 'landing', 'grounded-recovery'])
  assert.ok(manifest.rig.splitY > manifest.source.bounds.minY)
  assert.equal(result.temporalQuality.ok, true, JSON.stringify(result.temporalQuality))
  const qa = analyzeSpriteCandidate({ actionId: 'jumping', rawMetrics: result.processed.metrics, profile: f.profile, actionPolicy: f.action })
  assert.equal(qa.ok, true, JSON.stringify(qa))
  assert.ok(qa.metrics.jumpExcursion >= 0.08)
  await validateCanonicalRigRow({ dataDir: f.dataDir, provenance: result.provenance, frames: result.processed.frames, actionId: 'jumping' })
  const again = await renderCanonicalSupportRig({ ...f, outputRelativeDir: 'candidates/jump-two' })
  assert.deepEqual(again.processed.frames.map(frame => frame.sha256), result.processed.frames.map(frame => frame.sha256))
})

test('support rig validates identity, supported anatomy/action and cancellation before creating output', async () => {
  const f = await fixture()
  await assert.rejects(renderCanonicalSupportRig({ ...f, canonical: { ...f.canonical, sha256: '0'.repeat(64) } }), { code: 'canonical_rig_source_mismatch' })
  await assert.rejects(renderCanonicalSupportRig({ ...f, characterClass: 'floating-character' }), { code: 'canonical_rig_unsupported' })
  await assert.rejects(renderCanonicalSupportRig({ ...f, action: { ...f.action, actionId: 'running-left' } }), { code: 'canonical_rig_unsupported' })
  const reason = new Error('user canceled')
  await assert.rejects(renderCanonicalSupportRig({ ...f, signal: AbortSignal.abort(reason) }), error => error === reason)
  assert.equal(fs.existsSync(path.join(f.dataDir, f.outputRelativeDir)), false)
})

test('support-strip deformation cannot substitute for articulated right-facing locomotion', async () => {
  const f = await fixture()
  const action = { actionId: 'running-right', frameCount: 8, layout: { columns: 4, rows: 2 } }
  await assert.rejects(renderCanonicalSupportRig({ ...f, action }), { code: 'canonical_rig_pose_required' })
  assert.equal(fs.existsSync(path.join(f.dataDir, f.outputRelativeDir)), false)
})

test('articulated gait binds a separate side pose, exchanges feet and exports its full source evidence', async () => {
  const f = await fixture()
  const posePath = path.join(f.dataDir, 'side-pose.png')
  await sharp(Buffer.from('<svg width="300" height="340"><ellipse cx="150" cy="150" rx="88" ry="112" fill="#ffe45d" stroke="#42250d" stroke-width="7"/><ellipse cx="100" cy="283" rx="25" ry="14" fill="#ff9447" stroke="#42250d" stroke-width="7"/><ellipse cx="204" cy="273" rx="25" ry="14" fill="#ff9447" stroke="#42250d" stroke-width="7"/><circle cx="186" cy="100" r="10" fill="#42250d"/><path d="M224 125 L250 139 L225 150Z" fill="#ff9447" stroke="#42250d" stroke-width="6"/></svg>')).png().toFile(posePath)
  const poseReference = { relativePath: 'side-pose.png', sha256: hash(fs.readFileSync(posePath)) }
  const action = { actionId: 'running-right', anchorPolicy: 'action-relative-root-v1', frameCount: 8, layout: { columns: 4, rows: 2 } }
  const result = await renderCanonicalSupportRig({ ...f, action, poseReference })
  const manifest = JSON.parse(fs.readFileSync(result.manifestPath))
  assert.equal(manifest.rig.type, 'articulated-biped-gait')
  assert.equal(manifest.poseReference.sha256, poseReference.sha256)
  assert.notEqual(manifest.poseReference.relativePath, poseReference.relativePath)
  assert.equal(manifest.poseReference.relativePath, `${f.outputRelativeDir}/pose-source.png`)
  assert.equal(result.processed.frames.length, 8)
  assert.equal(new Set(result.processed.frames.map(frame => frame.sha256)).size, 8)
  assert.ok(manifest.transforms[0].legs[0].x > manifest.transforms[0].legs[1].x)
  assert.ok(manifest.transforms[4].legs[0].x < manifest.transforms[4].legs[1].x)
  assert.equal(result.temporalQuality.ok, true)
  assert.equal(analyzeSpriteCandidate({ actionId: action.actionId, rawMetrics: result.processed.metrics, profile: f.profile, actionPolicy: action }).ok, true)
  const auditRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-gait-export-'))
  await rigModule().exportCanonicalRigEvidence({ dataDir: f.dataDir, outputDir: auditRoot, provenance: result.provenance, frames: result.processed.frames, actionId: action.actionId })
  assert.equal(hash(fs.readFileSync(path.join(auditRoot, manifest.poseReference.relativePath))), poseReference.sha256)
  // A later generated keyframe overwrites the shared input path. Retained rigs
  // must keep their own verified source and remain independently exportable.
  fs.writeFileSync(posePath, 'replacement from a later Provider attempt')
  await validateCanonicalRigRow({ dataDir: f.dataDir, provenance: result.provenance, frames: result.processed.frames, actionId: action.actionId })
  const afterRetryExport = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-gait-retry-export-'))
  await rigModule().exportCanonicalRigEvidence({ dataDir: f.dataDir, outputDir: afterRetryExport, provenance: result.provenance, frames: result.processed.frames, actionId: action.actionId })
  assert.equal(hash(fs.readFileSync(path.join(afterRetryExport, manifest.poseReference.relativePath))), poseReference.sha256)
  fs.appendFileSync(path.join(f.dataDir, manifest.poseReference.relativePath), 'changed')
  await assert.rejects(validateCanonicalRigRow({ dataDir: f.dataDir, provenance: result.provenance, frames: result.processed.frames, actionId: action.actionId }), /pose.*hash/)

  await assert.rejects(renderCanonicalSupportRig({ ...f, action, poseReference: { ...poseReference, sha256: '0'.repeat(64) }, outputRelativeDir: 'invalid-pose' }), /pose.*hash/)
  assert.equal(fs.existsSync(path.join(f.dataDir, 'invalid-pose')), false)
})

test('articulated gait rejects unsupported colors and unsafe poses before output', async () => {
  const f = await fixture()
  const posePath = path.join(f.dataDir, 'blue-pose.png')
  await sharp(Buffer.from('<svg width="300" height="340"><ellipse cx="150" cy="150" rx="88" ry="112" fill="#3366aa"/><path d="M100 250V285H125V250 M180 250V280H205V250" fill="#ff9447"/></svg>')).png().toFile(posePath)
  const action = { actionId: 'running-right', frameCount: 8, layout: { columns: 4, rows: 2 } }
  const poseReference = { relativePath: 'blue-pose.png', sha256: hash(fs.readFileSync(posePath)) }
  await assert.rejects(renderCanonicalSupportRig({ ...f, action, poseReference }), { code: 'canonical_rig_unsupported' })
  await assert.rejects(renderCanonicalSupportRig({ ...f, action, poseReference: { ...poseReference, relativePath: '../outside.png' } }), /safe relative/)
  await sharp({ create: { width: 2049, height: 64, channels: 4, background: '#ffe45d' } }).png().toFile(posePath)
  await assert.rejects(renderCanonicalSupportRig({ ...f, action, poseReference: { ...poseReference, sha256: hash(fs.readFileSync(posePath)) } }), /pose dimensions/)
  assert.equal(fs.existsSync(path.join(f.dataDir, f.outputRelativeDir)), false)
})

test('review rig keeps the lower body fixed across six head-only inspection phases', async () => {
  const f = await fixture()
  const action = { actionId: 'review', anchorPolicy: 'action-relative-root-v1', frameCount: 6, layout: { columns: 3, rows: 2 } }
  const result = await renderCanonicalSupportRig({ ...f, action })
  assert.equal(result.processed.frames.length, 6)
  const manifest = JSON.parse(fs.readFileSync(result.manifestPath))
  assert.equal(manifest.rig.type, 'continuous-head-inspection')
  assert.deepEqual(manifest.driver.framePlan, require('../../examples/plugins/creator-studio/lib/motion-driver-registry').createMotionDriver({ actionId: 'review' }).framePlan)
  assert.deepEqual(manifest.transforms.map(t => t.phase), ['neutral', 'inspect-left', 'compare-right', 'acknowledge-nod', 'recover', 'neutral-return'])
  const pixels = await Promise.all(manifest.sourceFrames.map(frame => sharp(path.join(f.dataDir, frame.relativePath)).ensureAlpha().raw().toBuffer()))
  assert.deepEqual(pixels[0], pixels[5])
  assert.ok(new Set(pixels.map(hash)).size >= 5)
  for (const frame of pixels.slice(1)) assert.deepEqual(frame.subarray(350 * 512 * 4), pixels[0].subarray(350 * 512 * 4))
  assert.equal(result.temporalQuality.ok, true, JSON.stringify(result.temporalQuality))
  assert.equal(analyzeSpriteCandidate({ actionId: 'review', rawMetrics: result.processed.metrics, profile: f.profile, actionPolicy: action }).ok, true)
  await validateCanonicalRigRow({ dataDir: f.dataDir, provenance: result.provenance, frames: result.processed.frames, actionId: 'review' })
  const subtle = await renderCanonicalSupportRig({ ...f, action: { ...action, motionParameters: { intensity: 'subtle' } }, outputRelativeDir: 'candidates/review-subtle' })
  const subtleManifest = JSON.parse(fs.readFileSync(subtle.manifestPath))
  assert.ok(Math.abs(subtleManifest.transforms[1].headTiltDegrees) < Math.abs(manifest.transforms[1].headTiltDegrees))
  assert.notEqual(subtle.processed.frames[1].sha256, result.processed.frames[1].sha256)
})

test('registered subtle jumping reduces the rendered motion while retaining its technical gate', async () => {
  const f = await fixture()
  const normal = await renderCanonicalSupportRig(f)
  const subtle = await renderCanonicalSupportRig({ ...f, action: { ...f.action, motionParameters: { intensity: 'subtle' } }, outputRelativeDir: 'candidates/subtle' })
  const normalManifest = JSON.parse(fs.readFileSync(normal.manifestPath))
  const subtleManifest = JSON.parse(fs.readFileSync(subtle.manifestPath))
  assert.ok(subtleManifest.transforms[2].lift < normalManifest.transforms[2].lift)
  assert.ok(subtleManifest.transforms[0].supportScaleY > normalManifest.transforms[0].supportScaleY)
  assert.notEqual(subtle.processed.frames[2].sha256, normal.processed.frames[2].sha256)
  assert.equal(analyzeSpriteCandidate({ actionId: 'jumping', rawMetrics: subtle.processed.metrics, profile: f.profile, actionPolicy: f.action }).ok, true)
})

test('support rig rejects escaped input/output and symlinked ancestors', async () => {
  const f = await fixture()
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-rig-outside-'))
  fs.symlinkSync(outside, path.join(f.dataDir, 'escape'))
  await assert.rejects(renderCanonicalSupportRig({ ...f, outputRelativeDir: '../escape' }), /inside|relative|escaped/i)
  await assert.rejects(renderCanonicalSupportRig({ ...f, outputRelativeDir: 'escape/output' }), /inside|escaped/i)
  fs.copyFileSync(path.join(f.dataDir, 'canonical.png'), path.join(outside, 'canonical.png'))
  await assert.rejects(renderCanonicalSupportRig({ ...f, canonical: { ...f.canonical, relativePath: 'escape/canonical.png' } }), /inside|escaped/i)
})

test('support rig rejects clipped or oversized identities and stops cancellation during rendering', async () => {
  const f = await fixture()
  await sharp({ create: { width: 64, height: 64, channels: 4, background: '#ffff00' } }).png().toFile(path.join(f.dataDir, 'clipped.png'))
  const clipped = { relativePath: 'clipped.png', sha256: hash(fs.readFileSync(path.join(f.dataDir, 'clipped.png'))) }
  await assert.rejects(renderCanonicalSupportRig({ ...f, canonical: clipped }), /clipped/)
  await sharp({ create: { width: 2049, height: 64, channels: 4, background: '#ffff00' } }).png().toFile(path.join(f.dataDir, 'oversized.png'))
  const oversized = { relativePath: 'oversized.png', sha256: hash(fs.readFileSync(path.join(f.dataDir, 'oversized.png'))) }
  await assert.rejects(renderCanonicalSupportRig({ ...f, canonical: oversized }), /dimensions/)
  const reason = new Error('cancel during pose rendering')
  let checks = 0
  const signal = { throwIfAborted() { if (++checks === 4) throw reason } }
  await assert.rejects(renderCanonicalSupportRig({ ...f, signal }), error => error === reason)
  assert.equal(fs.existsSync(path.join(f.dataDir, f.outputRelativeDir, 'source-1.png')), true)
  assert.equal(fs.existsSync(path.join(f.dataDir, f.outputRelativeDir, 'rig-manifest.json')), false)
})

test('rig evidence rejects source, motion, output-frame, scope and artifact substitutions', async () => {
  const f = await fixture()
  const rig = await renderCanonicalSupportRig(f)
  const { writeCandidateRecord } = require('../../examples/plugins/creator-studio/lib/sprite-candidate-store')
  const candidate = { candidateId: 'rig-one', sha256: rig.processed.rawSheet.sha256, provenance: rig.provenance, artifacts: [{ role: 'rig-manifest', path: rig.manifestPath, sha256: rig.provenance.manifest.sha256 }] }
  assert.throws(() => writeCandidateRecord({ dataDir: f.dataDir, runId: 'run', scope: 'action-review', candidate }), /action/)
  assert.throws(() => writeCandidateRecord({ dataDir: f.dataDir, runId: 'run', scope: 'action-jumping', candidate: { ...candidate, artifacts: [] } }), /manifest artifact/)
  await assert.rejects(validateCanonicalRigRow({ dataDir: f.dataDir, provenance: rig.provenance, frames: rig.processed.frames, actionId: 'jumping', canonicalSha256: '0'.repeat(64) }), /accepted canonical/)
  await assert.rejects(validateCanonicalRigRow({ dataDir: f.dataDir, provenance: { ...rig.provenance, motionDriverSha256: '0'.repeat(64) }, frames: rig.processed.frames, actionId: 'jumping' }), /driver hash/)
  const source = path.join(f.dataDir, f.canonical.relativePath)
  const original = fs.readFileSync(source)
  fs.appendFileSync(source, 'changed')
  await assert.rejects(validateCanonicalRigRow({ dataDir: f.dataDir, provenance: rig.provenance, frames: rig.processed.frames, actionId: 'jumping' }), /source hash/)
  fs.writeFileSync(source, original)
  fs.appendFileSync(rig.processed.frames[0].path, 'changed')
  await assert.rejects(validateCanonicalRigRow({ dataDir: f.dataDir, provenance: rig.provenance, frames: rig.processed.frames, actionId: 'jumping' }), /retained.*hash/)
})

test('rig provenance rejects changed manifest, source, runtime pixels and wrong action', async () => {
  const f = await fixture()
  const result = await renderCanonicalSupportRig(f)
  await assert.rejects(validateCanonicalRigRow({ dataDir: f.dataDir, provenance: result.provenance, frames: result.processed.frames, actionId: 'waving' }), /action/i)
  const tampered = path.join(f.dataDir, 'tampered.png')
  await sharp({ create: { width: 128, height: 128, channels: 4, background: '#ffffff' } }).png().toFile(tampered)
  await assert.rejects(validateCanonicalRigRow({ dataDir: f.dataDir, provenance: result.provenance, frames: [{ ...result.processed.frames[0], path: tampered }, ...result.processed.frames.slice(1)], actionId: 'jumping' }), /frame|pixel/i)
  fs.appendFileSync(path.join(f.dataDir, result.provenance.manifest.relativePath), ' ')
  await assert.rejects(validateCanonicalRigRow({ dataDir: f.dataDir, provenance: result.provenance, frames: result.processed.frames, actionId: 'jumping' }), /hash|manifest/i)
})

test('approved rig coverage keeps its source distinct from Provider rows', () => {
  const { createBasicActionCoverage } = require('../../examples/plugins/creator-studio/lib/full-pet-basic-actions')
  const coverage = createBasicActionCoverage([{ actionId: 'idle', quality: 'row-real' }, { actionId: 'jumping', quality: 'approved-rig' }])
  assert.ok(coverage.availableActionIds.includes('jumping'))
  assert.equal(coverage.rows.find(row => row.actionId === 'jumping').quality, 'approved-rig')
})

test('rig provenance survives candidate records and padded checkpoint reuse, and atlas rejects an unproven rig', async () => {
  const f = await fixture()
  const result = await renderCanonicalSupportRig(f)
  const { writeCandidateRecord } = require('../../examples/plugins/creator-studio/lib/sprite-candidate-store')
  const { writeActionCheckpoint, resolveReusableActionResult } = require('../../examples/plugins/creator-studio/lib/full-pet-action-checkpoints')
  const { buildRealAtlasFromGeneratedImage } = require('../../examples/plugins/creator-studio/lib/real-atlas-builder')
  const record = writeCandidateRecord({ dataDir: f.dataDir, runId: 'rig-pet', scope: 'action-jumping', candidate: { candidateId: 'rig-1', sha256: result.processed.rawSheet.sha256, provenance: result.provenance, artifacts: [{ role: 'rig-manifest', path: result.manifestPath, sha256: result.provenance.manifest.sha256 }] } })
  assert.deepEqual(record.candidate.provenance, result.provenance)
  const frames = []
  for (const [index, frame] of result.processed.frames.entries()) {
    const target = path.join(f.dataDir, `padded-${index}.png`)
    await sharp({ create: { width: 192, height: 208, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: frame.path, left: 32, top: 40 }]).png().toFile(target)
    frames.push({ index, path: target })
  }
  const checkpoint = writeActionCheckpoint({ dataDir: f.dataDir, runId: 'rig-pet', result: { actionId: 'jumping', ok: true, row: { quality: 'approved-rig', provenance: result.provenance, frames } } })
  const reused = resolveReusableActionResult({ dataDir: f.dataDir, runId: 'rig-pet', actionId: 'jumping' })
  assert.deepEqual(reused.row.provenance, result.provenance)
  await validateCanonicalRigRow({ dataDir: f.dataDir, provenance: checkpoint.row.provenance, frames: reused.row.frames, actionId: 'jumping' })
  const borderTampered = path.join(f.dataDir, 'padded-border-tampered.png')
  await sharp(frames[0].path).composite([{ input: Buffer.from('<svg width="1" height="1"><rect width="1" height="1" fill="red"/></svg>'), left: 0, top: 0 }]).png().toFile(borderTampered)
  await assert.rejects(validateCanonicalRigRow({ dataDir: f.dataDir, provenance: result.provenance, frames: [{ path: borderTampered }, ...frames.slice(1)], actionId: 'jumping' }), /pixel mismatch/)
  const idle = []
  for (let index = 0; index < 6; index++) {
    const target = path.join(f.dataDir, `idle-${index}.png`)
    await sharp(Buffer.from(`<svg width="192" height="208"><ellipse cx="96" cy="115" rx="35" ry="42" fill="#ffcc42"/><rect x="105" y="${80 + index * 2}" width="13" height="20" fill="#391a10"/></svg>`)).png().toFile(target)
    idle.push({ index, path: target })
  }
  const input = { dataDir: f.dataDir, generationResult: { outputs: [{ dataRelativePath: f.canonical.relativePath }] }, outputDir: path.join(f.dataDir, 'package'), qaDir: path.join(f.dataDir, 'qa'), officialRows: [{ actionId: 'idle', quality: 'row-real', frames: idle }, { actionId: 'jumping', quality: 'approved-rig', provenance: result.provenance, frames }] }
  const packaged = await buildRealAtlasFromGeneratedImage(input)
  assert.equal(packaged.basicActions.actionAvailability.jumping.quality, 'approved-rig')
  await assert.rejects(buildRealAtlasFromGeneratedImage({ ...input, outputDir: path.join(f.dataDir, 'invalid-package'), qaDir: path.join(f.dataDir, 'invalid-qa'), officialRows: [input.officialRows[0], { ...input.officialRows[1], provenance: undefined }] }), /provenance/)
})

test('retained rig selection preserves audited runtime pixels through host persistence and checkpoint reuse', async () => {
  const f = await fixture()
  const runId = 'rig-selection'
  f.outputRelativeDir = `runs/${runId}/candidates/jumping/candidate-3/rig`
  const rig = await renderCanonicalSupportRig(f)
  const { createQualityFirstHostRuntime } = require('../../examples/plugins/creator-studio/lib/host-model-bridge')
  const { createSpriteAssetPlan } = require('../../examples/plugins/creator-studio/lib/sprite-asset-plan')
  const { writeCandidateRecord } = require('../../examples/plugins/creator-studio/lib/sprite-candidate-store')
  const { readActionCheckpoints } = require('../../examples/plugins/creator-studio/lib/full-pet-action-checkpoints')
  const profileData = { ...f.profile }
  const profile = { ...profileData, hash: hash(JSON.stringify(profileData)) }
  const plan = createSpriteAssetPlan({ version: 1, revision: 1, character: { assetClass: 'grounded-compact-character' }, actions: [{ actionId: 'jumping' }] })
  const run = { runId, input: { referenceImage: { relativePath: f.canonical.relativePath } }, qualityFirst: { scaleProfileHash: profile.hash } }
  const runtime = await createQualityFirstHostRuntime({ dataDir: f.dataDir, run, planOverride: plan })
  const stored = writeCandidateRecord({ dataDir: f.dataDir, runId, scope: 'action-jumping', candidate: { candidateId: 'candidate-3', sha256: rig.processed.rawSheet.sha256, provenance: rig.provenance, artifacts: [{ role: 'raw-sheet', ...rig.processed.rawSheet }, { role: 'rig-manifest', path: rig.manifestPath, sha256: rig.provenance.manifest.sha256 }] } })
  const selected = await runtime.materializeActionCandidate({ actionId: 'jumping', candidate: stored.candidate, canonical: f.canonical, profile })
  assert.deepEqual(selected.selectedCandidate.provenance, rig.provenance)
  assert.deepEqual(selected.selectedCandidate.processed.frames.map(frame => frame.sha256), rig.processed.frames.map(frame => frame.sha256))
  await runtime.persistActionResult({ actionId: 'jumping', result: selected, canonical: f.canonical, profile })
  const checkpoint = readActionCheckpoints({ dataDir: f.dataDir, runId }).actions.jumping
  assert.equal(checkpoint.row.quality, 'approved-rig')
  const resumed = await runtime.runAction({ actionId: 'jumping', canonical: f.canonical, profile })
  assert.equal(resumed.checkpointReused, true)
  await validateCanonicalRigRow({ dataDir: f.dataDir, provenance: checkpoint.row.provenance, frames: resumed.selectedCandidate.processed.frames, actionId: 'jumping' })
})

test('portable rig audit export retains enough evidence to validate without the original Creator directory', async () => {
  const f = await fixture()
  const rig = await renderCanonicalSupportRig(f)
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-rig-export-'))
  await rigModule().exportCanonicalRigEvidence({ dataDir: f.dataDir, outputDir, provenance: rig.provenance, frames: rig.processed.frames, actionId: 'jumping' })
  const exported = await validateCanonicalRigRow({ dataDir: outputDir, provenance: rig.provenance, frames: rig.processed.frames.map(frame => ({ relativePath: path.relative(fs.realpathSync(f.dataDir), frame.path) })), actionId: 'jumping' })
  assert.equal(exported.source.sha256, f.canonical.sha256)
  const wrong = { ...rig.provenance, canonicalSha256: '0'.repeat(64) }
  await assert.rejects(rigModule().exportCanonicalRigEvidence({ dataDir: f.dataDir, outputDir, provenance: wrong, frames: rig.processed.frames, actionId: 'jumping' }), /source hash/)
})

for (const actionId of ['jumping', 'review', 'running-right']) test(`production host repairs ${actionId} video drift with an audited rig, packages it and resumes without dispatch`, { skip: spawnSync('ffmpeg', ['-version']).status !== 0 || spawnSync('ffprobe', ['-version']).status !== 0 }, async () => {
  const f = await fixture()
  f.action = actionId === 'review' ? { actionId, anchorPolicy: 'action-relative-root-v1', frameCount: 6, layout: { columns: 3, rows: 2 } } : f.action
  const { createQualityFirstHostRuntime } = require('../../examples/plugins/creator-studio/lib/host-model-bridge')
  const { createSpriteAssetPlan } = require('../../examples/plugins/creator-studio/lib/sprite-asset-plan')
  const { writeActionCheckpoint } = require('../../examples/plugins/creator-studio/lib/full-pet-action-checkpoints')
  const { archiveCandidateRevision } = require('../../examples/plugins/creator-studio/lib/sprite-candidate-store')
  const runId = `host-rig-repair-${actionId}`
  const plan = createSpriteAssetPlan({ version: 1, revision: 1, character: { assetClass: 'grounded-compact-character' }, actions: [{ actionId }] })
  if (actionId === 'running-right') {
    f.action = { actionId, anchorPolicy: 'compact-grounded-baseline-v1', frameCount: 8, layout: { columns: 4, rows: 2 } }
    const posePath = path.join(f.dataDir, 'side-pose.png')
    await sharp(Buffer.from('<svg width="300" height="340"><ellipse cx="150" cy="150" rx="88" ry="112" fill="#ffe45d" stroke="#42250d" stroke-width="7"/><ellipse cx="100" cy="283" rx="25" ry="14" fill="#ff9447" stroke="#42250d" stroke-width="7"/><ellipse cx="204" cy="273" rx="25" ry="14" fill="#ff9447" stroke="#42250d" stroke-width="7"/><circle cx="186" cy="100" r="10" fill="#42250d"/><path d="M224 125 L250 139 L225 150Z" fill="#ff9447" stroke="#42250d" stroke-width="6"/></svg>')).png().toFile(posePath)
    f.poseReference = { relativePath: 'side-pose.png', sha256: hash(fs.readFileSync(posePath)) }
    // The generated side pose must pass the same identity/composition contract.
    // Use the matching fixture as canonical, keeping it a separate file.
    fs.copyFileSync(posePath, path.join(f.dataDir, f.canonical.relativePath))
    f.canonical.sha256 = f.poseReference.sha256
  }
  const fixtureRig = await renderCanonicalSupportRig(f)
  const manifest = JSON.parse(fs.readFileSync(fixtureRig.manifestPath))
  const videoDir = path.join(f.dataDir, 'fixture-video')
  fs.mkdirSync(videoDir)
  for (const [index, frame] of manifest.sourceFrames.entries()) {
    await sharp(path.join(f.dataDir, frame.relativePath)).flatten({ background: '#12ff4d' }).png().toFile(path.join(videoDir, `${index + 1}.png`))
  }
  // Locomotion decoding excludes the duplicate terminal contact of a cycle.
  if (actionId === 'running-right') fs.copyFileSync(path.join(videoDir, '1.png'), path.join(videoDir, '9.png'))
  const videoPath = path.join(videoDir, 'jump.mp4')
  execFileSync('ffmpeg', ['-loglevel', 'error', '-framerate', '5', '-i', path.join(videoDir, '%d.png'), '-c:v', 'mpeg4', '-pix_fmt', 'yuv420p', videoPath])
  const oldFetch = global.fetch
  const oldUrl = process.env.OPENPET_BRIDGE_URL
  const oldToken = process.env.OPENPET_BRIDGE_TOKEN
  process.env.OPENPET_BRIDGE_URL = 'http://127.0.0.1:1'
  process.env.OPENPET_BRIDGE_TOKEN = 'test-only'
  const calls = []
  let generatedPosePath
  global.fetch = async (url, request) => {
    const route = new URL(url).pathname
    const payload = JSON.parse(request.body)
    calls.push(route)
    let result
    if (route === '/creator/model-settings') return Response.json({ ok: true, config: { videoGeneration: { hasApiKey: true, model: 'grok-imagine-video-1.5' } } })
    if (route === '/creator/model-image-generate') {
      const relativePath = `${payload.output.dataRelativeDir}/side-pose.png`
      const output = path.join(f.dataDir, relativePath)
      fs.mkdirSync(path.dirname(output), { recursive: true })
      fs.copyFileSync(path.join(f.dataDir, f.poseReference.relativePath), output)
      generatedPosePath = output
      result = { outputs: [{ dataRelativePath: relativePath, mimeType: 'image/png', sha256: hash(fs.readFileSync(output)) }] }
    } else if (route === '/creator/model-video-generate') {
      const relativePath = `${payload.output.dataRelativeDir}/${payload.output.fileName}`
      const output = path.join(f.dataDir, relativePath)
      fs.mkdirSync(path.dirname(output), { recursive: true })
      fs.copyFileSync(videoPath, output)
      result = { outputs: [{ dataRelativePath: relativePath, sha256: hash(fs.readFileSync(output)), taskId: `test-video-${calls.length}` }] }
    } else if (route === '/creator/hatch-pet/evaluate') {
      const passed = payload.scope === 'final-package' || payload.board.relativePath.includes('/rig/')
      result = { gate: { ok: passed, outcome: passed ? 'pass' : 'repair', failures: passed ? [] : ['visual-defect-style-drift'] }, evaluation: { scores: { overall: passed ? 96 : 80 } } }
    } else throw new Error(`Unexpected test bridge route: ${route}`)
    return Response.json({ ok: true, result })
  }
  try {
    const profileData = { ...f.profile }
    const profile = { ...profileData, hash: hash(JSON.stringify(profileData)) }
    const run = { runId, petId: 'rig-test', input: { referenceImage: { relativePath: f.canonical.relativePath } } }
    const runtime = await createQualityFirstHostRuntime({ dataDir: f.dataDir, run, planOverride: plan })
    const result = await runtime.runAction({ actionId, canonical: f.canonical, profile })
    assert.equal(result.ok, true, JSON.stringify(result))
    assert.equal(result.selectedCandidate.provider, 'canonical-rig')
    assert.equal(calls.filter(route => route === '/creator/model-image-generate').length, actionId === 'running-right' ? 1 : 0)
    if (actionId === 'running-right') {
      const artifact = result.selectedCandidate.artifacts.find(file => file.role === 'rig-pose-source')
      assert.ok(artifact, 'production rig must retain its generated side pose')
      assert.equal(hash(fs.readFileSync(artifact.path)), artifact.sha256)
      assert.notEqual(artifact.path, generatedPosePath)
      assert.ok(artifact.path.endsWith('/rig/pose-source.png'))
      const mirror = await runtime.mirrorRunningLeft({ source: result })
      assert.equal(mirror.ok, true)
      for (const [index, frame] of mirror.selectedCandidate.processed.frames.entries()) {
        assert.deepEqual(await sharp(frame.path).ensureAlpha().raw().toBuffer(), await sharp(result.selectedCandidate.processed.frames[index].path).flop().ensureAlpha().raw().toBuffer())
      }
      await runtime.persistActionResult({ actionId: 'running-left', result: mirror, canonical: f.canonical, profile })
    }
    const videos = calls.filter(route => route === '/creator/model-video-generate').length
    assert.ok(videos >= 2 && videos <= 3)
    assert.equal(result.candidates.filter(candidate => candidate.provenance?.kind === 'canonical-rig').length, 1)
    assert.ok(result.candidates.filter(candidate => !candidate.provenance).every(candidate => candidate.gate.ok === false))
    await runtime.persistActionResult({ actionId, result, canonical: f.canonical, profile })
    if (actionId === 'running-right') fs.writeFileSync(generatedPosePath, 'later Provider output')
    const before = calls.length
    const resumed = await runtime.runAction({ actionId, canonical: f.canonical, profile })
    assert.equal(resumed.checkpointReused, true)
    assert.equal(calls.length, before)
    const idle = []
    for (let index = 0; index < 6; index++) {
      const target = path.join(f.dataDir, `idle-${index}.png`)
      await sharp(Buffer.from(`<svg width="192" height="208"><ellipse cx="96" cy="115" rx="35" ry="42" fill="#ffcc42"/><rect x="105" y="${80 + index * 2}" width="13" height="20" fill="#391a10"/></svg>`)).png().toFile(target)
      idle.push({ path: target, frameIndex: index })
    }
    writeActionCheckpoint({ dataDir: f.dataDir, runId, result: { actionId: 'idle', ok: true, row: { quality: 'row-real', frames: idle } } })
    const packaged = await runtime.finalizePackage({ canonical: f.canonical })
    const metadata = JSON.parse(fs.readFileSync(path.join(f.dataDir, packaged.petJsonRelativePath)))
    assert.equal(metadata.actionGeneration[actionId].quality, 'approved-rig')
    const auditRoot = path.join(path.dirname(path.join(f.dataDir, packaged.petJsonRelativePath)), metadata.actionGeneration[actionId].evidenceRoot)
    await validateCanonicalRigRow({ dataDir: auditRoot, provenance: metadata.actionGeneration[actionId].provenance, frames: metadata.actionGeneration[actionId].frames, actionId })
    if (actionId === 'running-right') {
      assert.equal(metadata.actionGeneration['running-left'].quality, 'approved-mirror')
      const rigManifest = JSON.parse(fs.readFileSync(path.join(auditRoot, metadata.actionGeneration[actionId].provenance.manifest.relativePath)))
      assert.equal(hash(fs.readFileSync(path.join(auditRoot, rigManifest.poseReference.relativePath))), rigManifest.poseReference.sha256)
    }
    assert.ok(execFileSync('unzip', ['-Z1', path.join(f.dataDir, packaged.bundleRelativePath)], { encoding: 'utf8' }).includes('rig-manifest.json'))
    const archive = archiveCandidateRevision({ dataDir: f.dataDir, runId, scope: `action-${actionId}`, now: () => '2026-11-07T01:00:00Z' })
    const archived = JSON.parse(fs.readFileSync(path.join(f.dataDir, archive, result.selectedCandidateId, 'candidate.json'))).candidate
    const restored = await runtime.materializeActionCandidate({ actionId, candidate: archived, canonical: f.canonical, profile })
    assert.deepEqual(restored.selectedCandidate.processed.frames.map(frame => frame.sha256), result.selectedCandidate.processed.frames.map(frame => frame.sha256))
  } finally {
    global.fetch = oldFetch
    if (oldUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = oldUrl
    if (oldToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = oldToken
  }
})
