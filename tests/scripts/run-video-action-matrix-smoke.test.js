const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const sharp = require('sharp')

const packageJson = require('../../package.json')
const {
  DEFAULT_ACTIONS,
  DEFAULT_MODELS,
  parseArgs,
  readProviderKey,
  runVideoActionMatrixSmoke,
  sanitizeError
} = require('../../scripts/run-video-action-matrix-smoke')

const tempDir = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix))

const makeReference = async (root) => {
  const target = path.join(root, 'reference.png')
  await sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 40, g: 60, b: 80, alpha: 1 } } }).png().toFile(target)
  return target
}

test('package exposes the video action matrix smoke entrypoint', () => {
  assert.equal(packageJson.scripts['smoke:video-actions'], 'node scripts/run-video-action-matrix-smoke.js')
})

test('parseArgs defaults to both deployed models and all three actions', async () => {
  const root = tempDir('openpet-video-matrix-args-')
  const referenceImage = await makeReference(root)
  const options = parseArgs(['--reference-image', referenceImage, '--provider-keys-file', path.join(root, 'keys.json')])
  assert.deepEqual(options.models, [...DEFAULT_MODELS])
  assert.deepEqual(options.actions, [...DEFAULT_ACTIONS])
  assert.equal(options.referenceImage, referenceImage)
})

test('readProviderKey accepts resident key ids without exposing the key', () => {
  const root = tempDir('openpet-video-matrix-key-')
  const providerKeysFile = path.join(root, 'provider-keys.json')
  fs.writeFileSync(providerKeysFile, JSON.stringify({ 'model.video.openai-compatible.apiKey': 'sk-private-test-value' }))
  assert.equal(readProviderKey({ providerKeysFile, env: {} }), 'sk-private-test-value')
})

test('matrix continues after a failed action and writes only safe relative evidence paths', async () => {
  const root = tempDir('openpet-video-matrix-run-')
  const outputDir = path.join(root, 'output')
  const referenceImage = await makeReference(root)
  const keysPath = path.join(root, 'keys.json')
  fs.writeFileSync(keysPath, JSON.stringify({ 'model.video.openai-compatible.apiKey': 'sk-private-test-value' }))
  const calls = []
  let tick = 0
  const now = () => new Date(Date.UTC(2026, 10, 5, 1, 0, tick++))
  const runVideoActionImpl = async ({ action, model, dataDir, outputRelativeDir }) => {
    calls.push(`${model}:${action.actionId}`)
    if (action.actionId === 'waving') throw Object.assign(new Error('provider rejected sk-private-test-value https://api.example.test/v1'), { code: 'provider_failed' })
    const rawPath = path.join(dataDir, outputRelativeDir, 'raw', `${action.actionId}.mp4`)
    fs.mkdirSync(path.dirname(rawPath), { recursive: true })
    fs.writeFileSync(rawPath, 'video')
    return {
      driver: { fps: 12 },
      rawVideo: { relativePath: path.relative(dataDir, rawPath).replace(/\\/g, '/'), sha256: 'a'.repeat(64), byteLength: 5, mimeType: 'video/mp4', taskId: `task-${action.actionId}` },
      decoded: { framePaths: Array.from({ length: action.frameCount }, () => 'frame'), fps: 12 },
      processed: { normalizedFrames: [] },
      temporalQuality: { ok: true, failures: [], metrics: { frameCount: action.frameCount } }
    }
  }
  const createArtifactsImpl = async ({ outputDir: artifactDir, expectedFrameCount }) => {
    fs.mkdirSync(artifactDir, { recursive: true })
    const create = (name) => {
      const target = path.join(artifactDir, name)
      fs.writeFileSync(target, name)
      return { path: target, sha256: 'b'.repeat(64) }
    }
    return {
      processedSheet: create('processed-sheet.png'),
      rawSheet: create('raw-sheet.png'),
      contactSheet: create('contact-sheet.png'),
      gif: create('animation.gif'),
      frames: Array.from({ length: expectedFrameCount }, (_entry, index) => create(`frame-${index}.png`))
    }
  }
  const report = await runVideoActionMatrixSmoke({
    referenceImage,
    outputDir,
    providerKeysFile: keysPath,
    models: ['grok-imagine-video-1.5'],
    actions: ['idle', 'waving', 'jumping'],
    now,
    runVideoActionImpl,
    createArtifactsImpl,
    createVideoServiceImpl: () => ({ generateVideo: async () => { throw new Error('unused') } })
  })
  assert.deepEqual(calls, [
    'grok-imagine-video-1.5:idle',
    'grok-imagine-video-1.5:waving',
    'grok-imagine-video-1.5:jumping'
  ])
  assert.deepEqual(report.summary, { expected: 3, completed: 3, passed: 2, failed: 1 })
  assert.equal(report.ok, false)
  const persisted = fs.readFileSync(path.join(outputDir, report.sessionId, report.resultPath), 'utf8')
  assert.doesNotMatch(persisted, /sk-private-test-value/)
  assert.doesNotMatch(persisted, /api\.example\.test/)
  assert.doesNotMatch(persisted, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  const parsed = JSON.parse(persisted)
  const paths = parsed.results.flatMap((result) => Object.values(result.artifacts || {}).flat()).filter((value) => value?.relativePath).map((value) => value.relativePath)
  assert.equal(paths.length > 0, true)
  assert.equal(paths.every((value) => !path.isAbsolute(value) && !value.includes('..')), true)
})

test('sanitizeError redacts tokens, URLs, and absolute paths', () => {
  const value = sanitizeError(new Error('failed sk-supersecret123 at https://api.example.test/v1 /var/lib/openpet/private/file'))
  assert.doesNotMatch(value.message, /supersecret|api\.example|\/var\/lib/)
})
