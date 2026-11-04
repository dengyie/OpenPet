#!/usr/bin/env node

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const { createVideoGenerationModelService } = require('../apps/desktop/src/services/video-generation-model-service')
const { getSpriteLayout } = require('../examples/plugins/creator-studio/lib/action-sheet-layout')
const { createMotionDriver } = require('../examples/plugins/creator-studio/lib/motion-driver-registry')
const {
  createVideoCandidateArtifacts,
  runVideoAction
} = require('../examples/plugins/creator-studio/lib/video-action-runner')
const { isGrokVideoModel } = require('../examples/plugins/creator-studio/lib/video-provider-capabilities')

const DEFAULT_OUTPUT_DIR = path.join(__dirname, '..', 'release', 'video-action-matrix-smoke')
const DEFAULT_MODELS = Object.freeze(['grok-imagine-video-1.5', 'grok-imagine-video'])
const DEFAULT_ACTIONS = Object.freeze(['idle', 'waving', 'jumping'])
const VIDEO_KEY_REF = 'secret:model.video.openai-compatible.apiKey'
const ACTION_PROMPTS = Object.freeze({
  idle: 'A quiet seamless idle loop with subtle breathing and source-appropriate secondary motion.',
  waving: 'A clear friendly greeting wave with one visible source-appropriate limb, then return to neutral.',
  jumping: 'A readable vertical jump with anticipation, takeoff, airborne peak, landing, and grounded recovery.'
})

const usage = () => [
  'Usage: node scripts/run-video-action-matrix-smoke.js --reference-image <file> [options]',
  '',
  'Options:',
  '  --reference-image <file>       Canonical character image (required).',
  '  --output-dir <dir>             Evidence root. Default: release/video-action-matrix-smoke',
  '  --provider-keys-file <file>    JSON key store. The key value is never written to output.',
  '  --base-url <url>               Provider base URL. Default: https://api.mangoqwq.com/v1',
  '  --models <csv>                 Grok video models. Default: 1.5 and legacy.',
  '  --actions <csv>                Registered actions. Default: idle,waving,jumping.',
  '  --timeout-ms <ms>              Per-provider-operation timeout. Default: 300000.',
  '  --json                         Print the redacted report.',
  '  --help',
  '',
  'Runs the real Provider, decoder, chroma matte, stabilization, sprite/GIF/contact-sheet',
  'pipeline. Each matrix cell is checkpointed so later failures preserve earlier evidence.'
].join('\n')

const safeSegment = (value, fallback = 'item') => String(value || '')
  .trim()
  .replace(/[^a-zA-Z0-9._-]+/g, '-') || fallback

const parseCsv = (value, label) => {
  const entries = [...new Set(String(value || '').split(',').map((entry) => entry.trim()).filter(Boolean))]
  if (!entries.length) throw new Error(`${label} must contain at least one value`)
  return entries
}

const positiveInteger = (value, label, fallback) => {
  const normalized = value === undefined ? fallback : Number(value)
  if (!Number.isInteger(normalized) || normalized < 1) throw new Error(`${label} must be a positive integer`)
  return normalized
}

const parseArgs = (argv) => {
  const options = {
    referenceImage: '',
    outputDir: DEFAULT_OUTPUT_DIR,
    providerKeysFile: process.env.OPENPET_PROVIDER_KEYS_FILE || '',
    baseUrl: 'https://api.mangoqwq.com/v1',
    models: [...DEFAULT_MODELS],
    actions: [...DEFAULT_ACTIONS],
    timeoutMs: 300_000,
    json: false,
    help: false
  }
  const valueAfter = (index, flag) => {
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
    return value
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--reference-image') {
      options.referenceImage = valueAfter(index, arg)
      index += 1
    } else if (arg === '--output-dir') {
      options.outputDir = valueAfter(index, arg)
      index += 1
    } else if (arg === '--provider-keys-file') {
      options.providerKeysFile = valueAfter(index, arg)
      index += 1
    } else if (arg === '--base-url') {
      options.baseUrl = valueAfter(index, arg)
      index += 1
    } else if (arg === '--models') {
      options.models = parseCsv(valueAfter(index, arg), '--models')
      index += 1
    } else if (arg === '--actions') {
      options.actions = parseCsv(valueAfter(index, arg), '--actions')
      index += 1
    } else if (arg === '--timeout-ms') {
      options.timeoutMs = positiveInteger(valueAfter(index, arg), '--timeout-ms', 300_000)
      index += 1
    } else if (arg === '--json') {
      options.json = true
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }
  if (options.help) return options
  options.referenceImage = path.resolve(String(options.referenceImage || '').trim())
  options.outputDir = path.resolve(String(options.outputDir || '').trim())
  options.providerKeysFile = String(options.providerKeysFile || '').trim()
    ? path.resolve(String(options.providerKeysFile).trim())
    : ''
  options.baseUrl = new URL(String(options.baseUrl || '').trim()).toString().replace(/\/$/, '')
  options.timeoutMs = positiveInteger(options.timeoutMs, '--timeout-ms', 300_000)
  if (!fs.existsSync(options.referenceImage) || !fs.statSync(options.referenceImage).isFile()) {
    throw new Error('--reference-image must point to a file')
  }
  if (!options.models.every(isGrokVideoModel)) throw new Error('--models contains an unsupported video model')
  for (const actionId of options.actions) createMotionDriver({ actionId })
  return options
}

const sha256File = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

const sanitizeError = (error) => ({
  code: String(error?.code || 'video_action_smoke_failed').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 100),
  message: String(error?.message || 'Video action smoke failed')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk|key)-[a-zA-Z0-9_-]{8,}\b/g, '[redacted]')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/(?:^|\s)(?:\/[\w.-]+){2,}/g, ' [path-redacted]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, 320),
  retryable: error?.retryable === true
})

const readProviderKey = ({ providerKeysFile, env = process.env } = {}) => {
  const environmentKey = String(env.OPENPET_VIDEO_API_KEY || '').trim()
  if (environmentKey) return environmentKey
  if (!providerKeysFile) throw new Error('Video Provider key source is required')
  const parsed = JSON.parse(fs.readFileSync(providerKeysFile, 'utf8'))
  const candidates = [
    parsed[VIDEO_KEY_REF],
    parsed[VIDEO_KEY_REF.replace(/^secret:/, '')],
    parsed.secrets?.[VIDEO_KEY_REF],
    parsed.secrets?.[VIDEO_KEY_REF.replace(/^secret:/, '')]
  ]
  const key = candidates.find((value) => typeof value === 'string' && value.trim())
  if (!key) throw new Error('Video Provider key is missing')
  return key.trim()
}

const createSession = ({ outputDir, now }) => {
  const sessionId = now().toISOString().replace(/[:.]/g, '-')
  const sessionDir = path.join(path.resolve(outputDir), sessionId)
  fs.mkdirSync(sessionDir, { recursive: true, mode: 0o700 })
  return { sessionId, sessionDir, reportPath: path.join(sessionDir, 'video-action-matrix-report.json') }
}

const safeRelative = (root, target) => {
  const relative = path.relative(path.resolve(root), path.resolve(String(target || ''))).split(path.sep).join('/')
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) throw new Error('Evidence path escaped the session directory')
  return relative
}

const publicArtifact = ({ sessionDir, artifact }) => ({
  relativePath: safeRelative(sessionDir, artifact.path),
  sha256: String(artifact.sha256 || sha256File(artifact.path))
})

const writeReport = (reportPath, report) => {
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
}

const createActionDefinition = (actionId) => {
  const driver = createMotionDriver({ actionId })
  return {
    actionId,
    name: actionId,
    motionPrompt: ACTION_PROMPTS[actionId] || `A clear readable ${actionId} action.`,
    motionPresetId: driver.motionPresetId,
    frameCount: driver.frameCount,
    layout: getSpriteLayout(driver.frameCount)
  }
}

const runVideoActionMatrixSmoke = async ({
  referenceImage,
  outputDir = DEFAULT_OUTPUT_DIR,
  providerKeysFile = '',
  baseUrl = 'https://api.mangoqwq.com/v1',
  models = DEFAULT_MODELS,
  actions = DEFAULT_ACTIONS,
  timeoutMs = 300_000,
  now = () => new Date(),
  env = process.env,
  runVideoActionImpl = runVideoAction,
  createArtifactsImpl = createVideoCandidateArtifacts,
  createVideoServiceImpl = createVideoGenerationModelService
} = {}) => {
  const { sessionId, sessionDir, reportPath } = createSession({ outputDir, now })
  const canonicalDir = path.join(sessionDir, 'inputs')
  fs.mkdirSync(canonicalDir, { recursive: true })
  const extension = path.extname(referenceImage).toLowerCase() || '.png'
  const canonicalPath = path.join(canonicalDir, `canonical${extension}`)
  fs.copyFileSync(referenceImage, canonicalPath)
  const canonical = {
    relativePath: safeRelative(sessionDir, canonicalPath),
    fileName: path.basename(canonicalPath),
    mimeType: extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : extension === '.webp' ? 'image/webp' : 'image/png',
    sha256: sha256File(canonicalPath)
  }
  const apiKey = readProviderKey({ providerKeysFile, env })
  const settings = {
    models: {
      videoGeneration: {
        provider: 'openai-compatible',
        baseUrl,
        model: models[0],
        apiKeyRef: VIDEO_KEY_REF,
        timeoutMs,
        maxConcurrentJobs: 1
      }
    }
  }
  const videoService = createVideoServiceImpl({
    settingsService: { get: () => settings, save: () => settings },
    secretService: { getSecretValue: (id) => id === VIDEO_KEY_REF ? apiKey : '' }
  })
  const report = {
    schemaVersion: 1,
    evidenceType: 'video-action-matrix-smoke',
    claimBoundary: 'Real Provider and technical artifact evidence; human art approval is separate.',
    sessionId,
    generatedAt: now().toISOString(),
    provider: { id: 'mango-api', baseUrl: new URL(baseUrl).origin, models: [...models] },
    canonical: { ...canonical },
    actions: [...actions],
    results: [],
    summary: { expected: models.length * actions.length, completed: 0, passed: 0, failed: 0 },
    ok: false,
    resultPath: path.basename(reportPath)
  }
  writeReport(reportPath, report)
  const bridge = async (_route, payload, { signal } = {}) => ({
    result: await videoService.generateVideo({
      ...payload,
      output: { ...payload.output, dataDir: sessionDir },
      timeoutMs,
      signal
    })
  })
  for (const model of models) {
    for (const actionId of actions) {
      const action = createActionDefinition(actionId)
      const startedAt = now()
      const outputRelativeDir = `runs/${safeSegment(model)}/${actionId}`
      const entry = { model, actionId, startedAt: startedAt.toISOString(), ok: false }
      try {
        const result = await runVideoActionImpl({
          dataDir: sessionDir,
          run: { runId: `${sessionId}-${safeSegment(model)}`, input: { petName: 'OpenPet video matrix canonical' } },
          action,
          canonical,
          model,
          outputRelativeDir,
          bridge
        })
        const artifacts = await createArtifactsImpl({
          processed: result.processed,
          outputDir: path.join(sessionDir, outputRelativeDir, 'candidate'),
          layout: action.layout,
          expectedFrameCount: action.frameCount,
          characterClass: 'grounded-compact-character'
        })
        entry.ok = result.temporalQuality.ok === true
        entry.durationMs = Math.max(0, now().getTime() - startedAt.getTime())
        entry.providerTaskId = String(result.rawVideo.taskId || '')
        entry.rawVideo = {
          relativePath: safeRelative(sessionDir, path.join(sessionDir, result.rawVideo.relativePath)),
          sha256: String(result.rawVideo.sha256 || ''),
          byteLength: Number(result.rawVideo.byteLength) || 0,
          mimeType: String(result.rawVideo.mimeType || 'video/mp4')
        }
        entry.decoded = {
          frameCount: Array.isArray(result.decoded?.framePaths) ? result.decoded.framePaths.length : 0,
          fps: Number(result.decoded?.fps) || Number(result.driver?.fps) || 0
        }
        entry.technicalQuality = result.temporalQuality
        entry.artifacts = {
          processedSheet: publicArtifact({ sessionDir, artifact: artifacts.processedSheet }),
          rawSheet: publicArtifact({ sessionDir, artifact: artifacts.rawSheet }),
          contactSheet: publicArtifact({ sessionDir, artifact: artifacts.contactSheet }),
          gif: publicArtifact({ sessionDir, artifact: artifacts.gif }),
          frames: artifacts.frames.map((frame) => publicArtifact({ sessionDir, artifact: frame }))
        }
      } catch (error) {
        entry.durationMs = Math.max(0, now().getTime() - startedAt.getTime())
        entry.error = sanitizeError(error)
      }
      report.results.push(entry)
      report.summary.completed = report.results.length
      report.summary.passed = report.results.filter((result) => result.ok).length
      report.summary.failed = report.results.filter((result) => !result.ok).length
      report.ok = report.summary.completed === report.summary.expected && report.summary.failed === 0
      writeReport(reportPath, report)
    }
  }
  return report
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(`${usage()}\n`)
    return
  }
  const report = await runVideoActionMatrixSmoke(options)
  if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  else process.stdout.write(`${report.ok ? 'PASS' : 'FAIL'} ${report.summary.passed}/${report.summary.expected} ${path.join(options.outputDir, report.sessionId, report.resultPath)}\n`)
  if (!report.ok) process.exitCode = 1
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${sanitizeError(error).message}\n`)
    process.exitCode = 1
  })
}

module.exports = {
  DEFAULT_ACTIONS,
  DEFAULT_MODELS,
  createActionDefinition,
  parseArgs,
  readProviderKey,
  runVideoActionMatrixSmoke,
  sanitizeError,
  usage
}
