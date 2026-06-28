#!/usr/bin/env node

const fs = require('fs')
const os = require('os')
const path = require('path')
const { createAppLogService } = require('../src/main/services/app-log-service')
const { createSecretService } = require('../src/main/services/secret-service')
const { createImageGenerationModelService } = require('../src/main/services/image-generation-model-service')
const { normalizeGenerationTask } = require('../examples/plugins/creator-studio/lib/generation-task')
const { buildOpenPetImagePrompt, sanitizeCreativeBrief } = require('../examples/plugins/creator-studio/lib/openpet-prompt-builder')
const { buildActionFramesFromGeneratedImage } = require('../examples/plugins/creator-studio/lib/action-frame-builder')
const { LEGACY_USER_DATA_DIR_NAME } = require('../src/main/user-data-path')

const DEFAULT_OUTPUT_DIR = path.join(__dirname, '..', 'release', 'creator-studio-provider-smoke')
const DEFAULT_LOG_LIMIT = 20
const DEFAULT_PROMPT = '新增一个自定义动作：开心挥手，菜单手动触发，保持当前宠物风格。'
const DEFAULT_ACTION_ID = 'provider-smoke-wave'
const DEFAULT_ACTION_NAME = '开心挥手'
const DEFAULT_FRAME_COUNT = 16
const DEFAULT_IMAGE_WIDTH = 1024
const DEFAULT_IMAGE_HEIGHT = 1024

const usage = () => [
  'Usage: node scripts/run-creator-studio-provider-smoke.js [options]',
  '',
  'Options:',
  '  --prompt <text>            Natural-language action request used for the Creator Studio smoke run.',
  '  --user-data-dir <dir>      OpenPet/ibot userData directory. Defaults to desktop conventions.',
  '  --output-dir <dir>         Directory for smoke session artifacts. Default: release/creator-studio-provider-smoke',
  '  --backend <provider|cloud|local>',
  '                            Creator Studio backend selector. cloud/local normalize to provider.',
  '  --action-id <id>           Safe action id for the generated action. Default: provider-smoke-wave',
  '  --action-name <name>       Action display name. Default: 开心挥手',
  '  --frame-count <n>          Frame count for action-frame QA. Default: 16',
  `  --width <n>                Generation width. Default: ${DEFAULT_IMAGE_WIDTH}`,
  `  --height <n>               Generation height. Default: ${DEFAULT_IMAGE_HEIGHT}`,
  '  --timeout-ms <n>           Temporary image Provider timeout for this smoke run only.',
  '  --skip-health-check        Skip image Provider health check and run generation directly.',
  '  --log-limit <n>            Number of redacted log entries to include. Default: 20',
  '  --help',
  '',
  'This smoke path reuses the host-owned image Provider settings, Creator Studio prompt',
  'builder, and action-frame QA pipeline. It produces a redacted JSON report and does',
  'not claim production asset quality automatically.'
].join('\n')

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

const defaultAppDataDir = ({ platform = process.platform, env = process.env, homedir = os.homedir } = {}) => {
  if (platform === 'darwin') return path.join(homedir(), 'Library', 'Application Support')
  if (platform === 'win32') return env.APPDATA || path.join(homedir(), 'AppData', 'Roaming')
  return env.XDG_CONFIG_HOME || path.join(homedir(), '.config')
}

const defaultUserDataDir = ({ appDataDir = defaultAppDataDir(), legacyDirName = LEGACY_USER_DATA_DIR_NAME } = {}) => (
  path.join(path.resolve(appDataDir), legacyDirName)
)

const sanitizeText = (value, maxChars = 240) => sanitizeCreativeBrief(String(value || ''))
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, maxChars)

const sanitizeError = (error) => ({
  name: sanitizeText(error?.name || 'Error', 80),
  message: sanitizeText(error?.message || 'Unknown error', 240)
})

const createSessionId = (date) => date.toISOString().replace(/[:.]/g, '-')

const createSessionPaths = ({ outputDir = DEFAULT_OUTPUT_DIR, now = () => new Date() } = {}) => {
  const sessionId = createSessionId(now())
  const sessionDir = path.resolve(outputDir, sessionId)
  return {
    sessionId,
    sessionDir,
    resultPath: path.join(sessionDir, 'creator-studio-provider-smoke-result.json'),
    logDir: path.join(sessionDir, 'logs'),
    qaDir: path.join(sessionDir, 'qa'),
    baseFramesDir: path.join(sessionDir, 'frames', 'base'),
    actionFramesDir: path.join(sessionDir, 'frames', 'actions')
  }
}

const readJsonIfExists = (filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return {}
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch (_) {
    return {}
  }
}

const createFileBackedSettingsService = ({ settingsPath }) => {
  let currentSettings = readJsonIfExists(settingsPath)
  return {
    get: () => JSON.parse(JSON.stringify(currentSettings)),
    save: (nextSettings) => {
      currentSettings = isObject(nextSettings) ? nextSettings : {}
      return JSON.parse(JSON.stringify(currentSettings))
    }
  }
}

const readRelevantLogs = ({ appLogService, limit = DEFAULT_LOG_LIMIT } = {}) => (
  appLogService.read({ limit: Math.max(limit * 3, limit) })
    .filter((entry) => entry.scope === 'image-generation')
    .slice(-limit)
)

const toRelativeSessionPath = ({ sessionDir, targetPath }) => {
  const root = path.resolve(sessionDir)
  const target = path.resolve(String(targetPath || ''))
  const relative = path.relative(root, target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return ''
  return relative.split(path.sep).join('/')
}

const parsePositiveInt = (value, flag) => {
  const number = Number(value)
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${flag} must be a positive integer`)
  return number
}

const normalizeBackend = (value) => {
  const backend = String(value || '').trim().toLowerCase()
  if (!backend) return 'provider'
  if (backend === 'cloud' || backend === 'local') return 'provider'
  if (backend === 'provider') return 'provider'
  throw new Error('--backend must be provider, cloud, or local')
}

const parseArgs = (argv) => {
  const options = {
    prompt: DEFAULT_PROMPT,
    userDataDir: defaultUserDataDir(),
    outputDir: DEFAULT_OUTPUT_DIR,
    backend: 'provider',
    actionId: DEFAULT_ACTION_ID,
    actionName: DEFAULT_ACTION_NAME,
    frameCount: DEFAULT_FRAME_COUNT,
    width: DEFAULT_IMAGE_WIDTH,
    height: DEFAULT_IMAGE_HEIGHT,
    timeoutMs: 0,
    skipHealthCheck: false,
    logLimit: DEFAULT_LOG_LIMIT,
    help: false
  }

  const readValue = (index, flag) => {
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
    return value
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--prompt') {
      options.prompt = readValue(index, arg)
      index += 1
    } else if (arg === '--user-data-dir') {
      options.userDataDir = readValue(index, arg)
      index += 1
    } else if (arg === '--output-dir') {
      options.outputDir = readValue(index, arg)
      index += 1
    } else if (arg === '--backend') {
      options.backend = readValue(index, arg)
      index += 1
    } else if (arg === '--action-id') {
      options.actionId = readValue(index, arg)
      index += 1
    } else if (arg === '--action-name') {
      options.actionName = readValue(index, arg)
      index += 1
    } else if (arg === '--frame-count') {
      options.frameCount = readValue(index, arg)
      index += 1
    } else if (arg === '--width') {
      options.width = readValue(index, arg)
      index += 1
    } else if (arg === '--height') {
      options.height = readValue(index, arg)
      index += 1
    } else if (arg === '--timeout-ms') {
      options.timeoutMs = readValue(index, arg)
      index += 1
    } else if (arg === '--skip-health-check') {
      options.skipHealthCheck = true
    } else if (arg === '--log-limit') {
      options.logLimit = readValue(index, arg)
      index += 1
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  if (options.help) return options
  options.prompt = String(options.prompt || '').trim()
  if (!options.prompt) throw new Error('--prompt must not be empty')
  options.userDataDir = path.resolve(options.userDataDir)
  options.outputDir = path.resolve(options.outputDir)
  options.backend = normalizeBackend(options.backend)
  options.actionId = String(options.actionId || '').trim()
  if (!options.actionId) throw new Error('--action-id must not be empty')
  options.actionName = String(options.actionName || '').trim()
  if (!options.actionName) throw new Error('--action-name must not be empty')
  options.frameCount = parsePositiveInt(options.frameCount, '--frame-count')
  options.width = parsePositiveInt(options.width, '--width')
  options.height = parsePositiveInt(options.height, '--height')
  options.timeoutMs = Number(options.timeoutMs) === 0 ? 0 : parsePositiveInt(options.timeoutMs, '--timeout-ms')
  options.logLimit = parsePositiveInt(options.logLimit, '--log-limit')
  return options
}

const createSmokeGenerationTask = ({
  prompt,
  actionId = DEFAULT_ACTION_ID,
  actionName = DEFAULT_ACTION_NAME,
  frameCount = DEFAULT_FRAME_COUNT
} = {}) => normalizeGenerationTask({
  mode: 'single-action',
  targetPet: 'current',
  styleSource: 'currentPet',
  characterBrief: prompt,
  actions: [{
    actionId,
    name: actionName,
    motionPrompt: prompt,
    loop: false,
    frameCount,
    triggerProposal: {
      type: 'manual',
      notes: 'Creator Studio provider smoke uses a review-only manual trigger.'
    }
  }]
})

const createSmokeRun = ({
  sessionId,
  prompt,
  backend,
  generationTask,
  createdAt
} = {}) => ({
  runId: `creator-studio-provider-smoke:${sessionId}`,
  petId: 'creator-studio-smoke-pet',
  backend,
  status: 'confirmed',
  taskStatus: 'confirmed',
  currentStep: 'generate',
  createdAt,
  updatedAt: createdAt,
  input: {
    prompt,
    originalPrompt: prompt,
    petName: 'Creator Studio Smoke Pet',
    backend
  },
  generationTask,
  artifacts: {}
})

const runCreatorStudioProviderSmoke = async ({
  prompt = DEFAULT_PROMPT,
  userDataDir = defaultUserDataDir(),
  outputDir = DEFAULT_OUTPUT_DIR,
  backend = 'provider',
  actionId = DEFAULT_ACTION_ID,
  actionName = DEFAULT_ACTION_NAME,
  frameCount = DEFAULT_FRAME_COUNT,
  width = DEFAULT_IMAGE_WIDTH,
  height = DEFAULT_IMAGE_HEIGHT,
  timeoutMs = 0,
  skipHealthCheck = false,
  logLimit = DEFAULT_LOG_LIMIT,
  now = () => new Date(),
  createAppLogServiceImpl = createAppLogService,
  createSecretServiceImpl = createSecretService,
  createImageGenerationModelServiceImpl = createImageGenerationModelService,
  buildActionFramesFromGeneratedImageImpl = buildActionFramesFromGeneratedImage
} = {}) => {
  const normalizedPrompt = String(prompt || '').trim()
  if (!normalizedPrompt) throw new Error('Smoke prompt is required')
  const normalizedWidth = parsePositiveInt(width, '--width')
  const normalizedHeight = parsePositiveInt(height, '--height')
  const normalizedTimeoutMs = Number(timeoutMs) === 0 ? 0 : parsePositiveInt(timeoutMs, '--timeout-ms')

  const sessionPaths = createSessionPaths({ outputDir, now })
  fs.mkdirSync(sessionPaths.sessionDir, { recursive: true })

  const settingsPath = path.join(userDataDir, 'settings.json')
  const secretsPath = path.join(userDataDir, 'secrets.json')
  const settingsService = createFileBackedSettingsService({ settingsPath })
  if (normalizedTimeoutMs > 0) {
    const currentSettings = settingsService.get()
    settingsService.save({
      ...currentSettings,
      models: {
        ...(isObject(currentSettings.models) ? currentSettings.models : {}),
        imageGeneration: {
          ...(isObject(currentSettings.models?.imageGeneration) ? currentSettings.models.imageGeneration : {}),
          timeoutMs: normalizedTimeoutMs
        }
      }
    })
  }
  const appLogService = createAppLogServiceImpl({ logDir: sessionPaths.logDir, maxEntries: Math.max(logLimit * 5, 200) })
  const secretService = createSecretServiceImpl({ storePath: secretsPath })
  const imageGenerationModelService = createImageGenerationModelServiceImpl({
    settingsService,
    secretService,
    appLogService
  })

  const config = typeof imageGenerationModelService.getConfig === 'function' ? imageGenerationModelService.getConfig() : {}
  const generationTask = createSmokeGenerationTask({ prompt: normalizedPrompt, actionId, actionName, frameCount })
  const action = generationTask.actions[0]
  const generatedAt = now().toISOString()
  const run = createSmokeRun({
    sessionId: sessionPaths.sessionId,
    prompt: normalizedPrompt,
    backend,
    generationTask,
    createdAt: generatedAt
  })
  const promptBuilder = buildOpenPetImagePrompt({
    run,
    generationTask,
    backend,
    model: config.model || ''
  })

  const summary = {
    schemaVersion: 1,
    ok: false,
    generatedAt,
    evidenceType: 'creator-studio-provider-smoke',
    claimBoundary: 'Creator Studio host-owned provider-path validation only; generated image and action-frame artifacts still require human review before any production asset-quality claim.',
    source: 'scripts/run-creator-studio-provider-smoke.js',
    sessionId: sessionPaths.sessionId,
    sessionDir: sessionPaths.sessionDir,
    logPath: appLogService.logPath,
    config: {
      provider: sanitizeText(config.provider || '', 80),
      baseUrl: sanitizeText(config.baseUrl || '', 200),
      model: sanitizeText(config.model || '', 120),
      hasApiKey: Boolean(config.hasApiKey),
      timeoutMs: Number(config.timeoutMs) || 0,
      maxConcurrentJobs: Number(config.maxConcurrentJobs) || 0
    },
    backend: {
      requested: sanitizeText(backend, 40)
    },
    promptBuilder: {
      version: Number(promptBuilder.promptBuilderVersion) || 0,
      mode: sanitizeText(promptBuilder.mode || '', 40),
      actionId: sanitizeText(promptBuilder.actionId || '', 120),
      sectionCount: Array.isArray(promptBuilder.sections) ? promptBuilder.sections.length : 0,
      warnings: Array.isArray(promptBuilder.warnings) ? promptBuilder.warnings.map((warning) => sanitizeText(warning, 80)) : [],
      promptPreview: sanitizeText(promptBuilder.prompt || '', 2000),
      promptChars: String(promptBuilder.prompt || '').length
    },
    action: {
      actionId: sanitizeText(action.actionId || '', 120),
      name: sanitizeText(action.name || '', 120),
      frameCount: Number(action.frameCount) || 0,
      loop: Boolean(action.loop),
      triggerType: sanitizeText(action.triggerProposal?.type || '', 40)
    },
    generationConstraints: {
      width: normalizedWidth,
      height: normalizedHeight,
      transparent: true,
      timeoutOverrideMs: normalizedTimeoutMs
    },
    healthCheck: {
      skipped: Boolean(skipHealthCheck),
      ok: false
    },
    generation: {
      ok: false,
      outputCount: 0
    },
    actionFrames: {
      ok: false
    },
    manualReviewChecklist: [
      'Inspect the contact sheet before claiming production asset quality.',
      'Review QA JSON and generated frame readability before import or release evidence claims.',
      'Treat this smoke as provider-path validation, not automatic artistic approval.'
    ],
    logs: []
  }

  try {
    if (!skipHealthCheck && typeof imageGenerationModelService.checkHealth === 'function') {
      const health = await imageGenerationModelService.checkHealth()
      summary.healthCheck = {
        skipped: false,
        ok: Boolean(health.ok),
        code: sanitizeText(health.code || '', 80),
        message: sanitizeText(health.message || '', 200),
        modelsProbe: sanitizeText(health.modelsProbe || '', 40),
        availableModelCount: Array.isArray(health.availableModels) ? health.availableModels.length : 0,
        currentModelDiscovered: Boolean(health.currentModelDiscovered)
      }
      if (!health.ok) {
        throw new Error(health.message || 'Image Provider health check failed')
      }
    }

    const generationResult = await imageGenerationModelService.generateImage({
      prompt: promptBuilder.prompt,
      output: {
        dataDir: sessionPaths.sessionDir,
        dataRelativeDir: path.join('frames', 'base')
      },
      constraints: {
        width: normalizedWidth,
        height: normalizedHeight,
        transparent: true
      }
    })

    summary.generation = {
      ok: true,
      requestId: sanitizeText(generationResult.requestId || '', 120),
      provider: sanitizeText(generationResult.provider || '', 80),
      model: sanitizeText(generationResult.model || '', 120),
      generatedAt: sanitizeText(generationResult.generatedAt || '', 80),
      outputCount: Array.isArray(generationResult.outputs) ? generationResult.outputs.length : 0,
      outputs: Array.isArray(generationResult.outputs)
        ? generationResult.outputs.map((output) => ({
            dataRelativePath: sanitizeText(output.dataRelativePath || '', 240),
            mimeType: sanitizeText(output.mimeType || '', 80),
            sha256: sanitizeText(output.sha256 || '', 80)
          }))
        : [],
      usageEstimatedCostUsd: Number(generationResult.usage?.estimatedCostUsd) || 0
    }

    const actionFrameResult = await buildActionFramesFromGeneratedImageImpl({
      dataDir: sessionPaths.sessionDir,
      generationResult,
      action,
      outputFramesDir: path.join(sessionPaths.actionFramesDir, action.actionId),
      qaDir: sessionPaths.qaDir
    })
    const qa = readJsonIfExists(actionFrameResult.qaPath)
    summary.actionFrames = {
      ok: Boolean(qa.ok),
      actionId: sanitizeText(actionFrameResult.actionId || '', 120),
      frameCount: Number(actionFrameResult.frameCount) || 0,
      frameWidth: Number(actionFrameResult.frameWidth) || 0,
      frameHeight: Number(actionFrameResult.frameHeight) || 0,
      framesDir: toRelativeSessionPath({ sessionDir: sessionPaths.sessionDir, targetPath: actionFrameResult.framesDir }),
      qaPath: toRelativeSessionPath({ sessionDir: sessionPaths.sessionDir, targetPath: actionFrameResult.qaPath }),
      contactSheetPath: toRelativeSessionPath({ sessionDir: sessionPaths.sessionDir, targetPath: actionFrameResult.contactSheetPath }),
      visibleFrameCount: Array.isArray(qa.frames) ? qa.frames.filter((frame) => Number(frame?.visiblePixels) > 0).length : 0,
      warningCount: Array.isArray(qa.warnings) ? qa.warnings.length : 0,
      warnings: Array.isArray(qa.warnings) ? qa.warnings.map((warning) => sanitizeText(warning, 160)) : []
    }

    summary.ok = summary.generation.ok && summary.actionFrames.ok && (summary.healthCheck.skipped || summary.healthCheck.ok)
  } catch (error) {
    summary.error = sanitizeError(error)
    summary.ok = false
  } finally {
    summary.logs = readRelevantLogs({ appLogService, limit: logLimit })
    fs.writeFileSync(sessionPaths.resultPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8')
    summary.resultPath = sessionPaths.resultPath
  }

  return summary
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }
  const result = await runCreatorStudioProviderSmoke(options)
  console.log(JSON.stringify({
    ok: result.ok,
    resultPath: result.resultPath,
    logPath: result.logPath,
    healthOk: result.healthCheck?.skipped ? 'skipped' : Boolean(result.healthCheck?.ok),
    generationOk: Boolean(result.generation?.ok),
    actionFramesOk: Boolean(result.actionFrames?.ok),
    requestId: result.generation?.requestId || '',
    promptWarnings: result.promptBuilder?.warnings || [],
    error: result.error || null
  }, null, 2))
  if (!result.ok) process.exitCode = 1
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error)
    process.exit(1)
  })
}

module.exports = {
  DEFAULT_ACTION_ID,
  DEFAULT_ACTION_NAME,
  DEFAULT_FRAME_COUNT,
  DEFAULT_LOG_LIMIT,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_PROMPT,
  createSessionPaths,
  createSmokeGenerationTask,
  defaultAppDataDir,
  defaultUserDataDir,
  parseArgs,
  runCreatorStudioProviderSmoke
}
