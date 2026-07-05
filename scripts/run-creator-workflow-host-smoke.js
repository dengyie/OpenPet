#!/usr/bin/env node

const fs = require('fs')
const os = require('os')
const path = require('path')

const { sanitizeLogText } = require('../src/main/services/log-safety')
const { createBasicBehaviorPlugin } = require('../src/main/plugins/official/basic-behavior')
const { getLegacyPetAnimations } = require('../src/main/pet-pack/loader')
const { OFFICIAL_FULL_PET_ACTION_IDS } = require('../examples/plugins/creator-studio/lib/full-pet-row-contract')
const { LEGACY_USER_DATA_DIR_NAME } = require('../src/main/user-data-path')
const { syncBundledPlugins } = require('../src/main/services/bundled-plugin-sync-service')
const { createActionImportService } = require('../src/main/services/action-import-service')
const { createActionService } = require('../src/main/services/action-service')
const { createAiService } = require('../src/main/services/ai-service')
const { createAppLogService } = require('../src/main/services/app-log-service')
const { createCreatorReferenceService } = require('../src/main/services/creator-reference-service')
const {
  CREATOR_STUDIO_PLUGIN_ID,
  createCreatorWorkflowService
} = require('../src/main/services/creator-workflow-service')
const { createEventBus } = require('../src/main/services/event-bus')
const { createImageGenerationModelService } = require('../src/main/services/image-generation-model-service')
const { createPetPackService } = require('../src/main/services/pet-pack-service')
const { createPetService } = require('../src/main/services/pet-service')
const { createPluginService } = require('../src/main/services/plugin-service')
const { createSecretService } = require('../src/main/services/secret-service')
const { createSettingsService } = require('../src/main/services/settings-service')

const DEFAULT_OUTPUT_DIR = path.join(__dirname, '..', 'release', 'creator-workflow-host-smoke')
const DEFAULT_SCENARIO = 'both'
const DEFAULT_LOG_LIMIT = 80
const DEFAULT_NEW_CHARACTER_NAME = 'Smoke Mango Cat'
const DEFAULT_NEW_CHARACTER_STYLE_PROMPT = 'Friendly orange helper cat for creator workflow smoke validation.'
const DEFAULT_EXISTING_ACTION_NAME = 'smoke-wave'
const DEFAULT_EXISTING_ACTION_PROMPT = 'Add a friendly wave action for creator workflow smoke validation.'
const DEFAULT_REFERENCE_IMAGE_CANDIDATES = [
  ['cat_anime', 'flames', 'bai_no_bg', '01_no_bg.png'],
  ['cat_anime', 'flames', 'eat_no_bg', '01_no_bg.png']
]
const DEFAULT_SOURCE_USER_DATA_LABEL = '[redacted-local-user-data]'
const DEFAULT_REFERENCE_IMAGE_LABEL = 'reference.png'
const DEFAULT_SESSION_DIR_LABEL = 'creator-workflow-host-smoke'

const usage = () => [
  'Usage: node scripts/run-creator-workflow-host-smoke.js [options]',
  '',
  'Options:',
  '  --source-user-data-dir <dir>  Seed userData directory. Defaults to desktop ibot/OpenPet location.',
  '  --reference-image <file>      Reference image for both scenarios.',
  '  --output-dir <dir>            Directory for smoke artifacts. Default: release/creator-workflow-host-smoke',
  '  --scenario <both|new-character|existing-action>',
  '                               Which real workflow scenarios to run. Default: both',
  '  --new-character-name <text>   Character name for the new-character scenario.',
  '  --new-character-style-prompt <text>',
  '                               Style prompt for the new-character scenario.',
  '  --existing-action-name <text> Action id/name for the existing-action scenario.',
  '  --existing-action-prompt <text>',
  '                               Motion prompt for the existing-action scenario.',
  '  --json                        Print the final report as JSON.',
  '  --help',
  '',
  'Runs the real host-owned creatorWorkflowService in isolated userData/workspace sandboxes.',
  'It validates provider generation plus import/apply handoff. Canonical-frame actions',
  'must record complete provider-generated keyframe sprite-row evidence; provider action',
  'anchors alone are not acceptable deliverable action-completion evidence.'
].join('\n')

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

const parsePositiveInt = (value, label) => {
  const number = Number(value)
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${label} must be a positive integer`)
  return number
}

const normalizeOptionalPositiveInt = (value, label) => {
  if (value == null || value === '') return 0
  if (Number(value) === 0) return 0
  return parsePositiveInt(value, label)
}

const defaultAppDataDir = ({ platform = process.platform, env = process.env, homedir = os.homedir } = {}) => {
  if (platform === 'darwin') return path.join(homedir(), 'Library', 'Application Support')
  if (platform === 'win32') return env.APPDATA || path.join(homedir(), 'AppData', 'Roaming')
  return env.XDG_CONFIG_HOME || path.join(homedir(), '.config')
}

const defaultUserDataDir = ({ appDataDir = defaultAppDataDir(), legacyDirName = LEGACY_USER_DATA_DIR_NAME } = {}) => (
  path.join(path.resolve(appDataDir), legacyDirName)
)

const createSessionId = (date) => date.toISOString().replace(/[:.]/g, '-')

const createSessionPaths = ({ outputDir = DEFAULT_OUTPUT_DIR, now = () => new Date() } = {}) => {
  const sessionId = createSessionId(now())
  const sessionDir = path.resolve(outputDir, sessionId)
  return {
    sessionId,
    sessionDir,
    reportPath: path.join(sessionDir, 'creator-workflow-host-smoke-report.json'),
    scenariosDir: path.join(sessionDir, 'scenarios')
  }
}

const ensureDir = (dirPath) => fs.mkdirSync(dirPath, { recursive: true })

const writeJson = (filePath, value) => {
  ensureDir(path.dirname(path.resolve(filePath)))
  fs.writeFileSync(path.resolve(filePath), `${JSON.stringify(value, null, 2)}\n`, 'utf-8')
}

const readJsonIfExists = (filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return {}
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch (_) {
    return {}
  }
}

const copyDirectory = (sourceDir, targetDir) => {
  fs.rmSync(targetDir, { recursive: true, force: true })
  ensureDir(path.dirname(targetDir))
  fs.cpSync(sourceDir, targetDir, { recursive: true })
}

const sanitizeScenarioName = (value) => String(value || '').trim().toLowerCase()

const createScenarioList = (scenario) => {
  const normalized = sanitizeScenarioName(scenario || DEFAULT_SCENARIO)
  if (normalized === 'both') return ['new-character', 'existing-action']
  if (normalized === 'new-character' || normalized === 'existing-action') return [normalized]
  throw new Error('--scenario must be both, new-character, or existing-action')
}

const parseArgs = (argv) => {
  const options = {
    sourceUserDataDir: defaultUserDataDir(),
    referenceImagePath: '',
    outputDir: DEFAULT_OUTPUT_DIR,
    scenario: DEFAULT_SCENARIO,
    newCharacterName: DEFAULT_NEW_CHARACTER_NAME,
    newCharacterStylePrompt: DEFAULT_NEW_CHARACTER_STYLE_PROMPT,
    existingActionName: DEFAULT_EXISTING_ACTION_NAME,
    existingActionPrompt: DEFAULT_EXISTING_ACTION_PROMPT,
    json: false,
    help: false
  }

  const readValue = (index, flag) => {
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
    return value
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--source-user-data-dir') {
      options.sourceUserDataDir = readValue(index, arg)
      index += 1
    } else if (arg === '--reference-image') {
      options.referenceImagePath = readValue(index, arg)
      index += 1
    } else if (arg === '--output-dir') {
      options.outputDir = readValue(index, arg)
      index += 1
    } else if (arg === '--scenario') {
      options.scenario = readValue(index, arg)
      index += 1
    } else if (arg === '--new-character-name') {
      options.newCharacterName = readValue(index, arg)
      index += 1
    } else if (arg === '--new-character-style-prompt') {
      options.newCharacterStylePrompt = readValue(index, arg)
      index += 1
    } else if (arg === '--existing-action-name') {
      options.existingActionName = readValue(index, arg)
      index += 1
    } else if (arg === '--existing-action-prompt') {
      options.existingActionPrompt = readValue(index, arg)
      index += 1
    } else if (arg === '--json') {
      options.json = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  if (options.help) return options
  options.sourceUserDataDir = path.resolve(String(options.sourceUserDataDir || '').trim())
  options.outputDir = path.resolve(String(options.outputDir || '').trim())
  options.referenceImagePath = String(options.referenceImagePath || '').trim()
    ? path.resolve(String(options.referenceImagePath || '').trim())
    : ''
  options.scenario = sanitizeScenarioName(options.scenario || DEFAULT_SCENARIO)
  options.newCharacterName = String(options.newCharacterName || DEFAULT_NEW_CHARACTER_NAME).trim() || DEFAULT_NEW_CHARACTER_NAME
  options.newCharacterStylePrompt = String(options.newCharacterStylePrompt || DEFAULT_NEW_CHARACTER_STYLE_PROMPT).trim() || DEFAULT_NEW_CHARACTER_STYLE_PROMPT
  options.existingActionName = String(options.existingActionName || DEFAULT_EXISTING_ACTION_NAME).trim() || DEFAULT_EXISTING_ACTION_NAME
  options.existingActionPrompt = String(options.existingActionPrompt || DEFAULT_EXISTING_ACTION_PROMPT).trim() || DEFAULT_EXISTING_ACTION_PROMPT
  createScenarioList(options.scenario)
  return options
}

const prepareSeedSettings = (settings = {}, { providerTimeoutMs = 0 } = {}) => {
  const normalizedProviderTimeoutMs = normalizeOptionalPositiveInt(providerTimeoutMs, 'Provider timeout MS')
  return {
    ...settings,
    ...(normalizedProviderTimeoutMs ? {
      models: {
        ...(isObject(settings.models) ? settings.models : {}),
        imageGeneration: {
          ...(isObject(settings.models?.imageGeneration) ? settings.models.imageGeneration : {}),
          timeoutMs: normalizedProviderTimeoutMs
        }
      }
    } : {}),
    creator: {
      ...(isObject(settings.creator) ? settings.creator : {}),
      references: {}
    },
    petPacks: {
      ...(isObject(settings.petPacks) ? settings.petPacks : {}),
      activePackId: 'legacy-cat',
      installed: isObject(settings.petPacks?.installed) ? settings.petPacks.installed : {}
    },
    plugins: {
      ...(isObject(settings.plugins) ? settings.plugins : {}),
      enabled: {
        ...(isObject(settings.plugins?.enabled) ? settings.plugins.enabled : {}),
        'official.basic-behavior': settings.plugins?.enabled?.['official.basic-behavior'] !== false,
        [CREATOR_STUDIO_PLUGIN_ID]: true
      },
      nativeExecutionApproved: {
        ...(isObject(settings.plugins?.nativeExecutionApproved) ? settings.plugins.nativeExecutionApproved : {}),
        [CREATOR_STUDIO_PLUGIN_ID]: true
      },
      config: isObject(settings.plugins?.config) ? settings.plugins.config : {},
      storage: isObject(settings.plugins?.storage) ? settings.plugins.storage : {},
      logs: []
    },
    localHttp: {
      ...(isObject(settings.localHttp) ? settings.localHttp : {}),
      enabled: false,
      logs: []
    }
  }
}

const resolveStoredReferenceImagePath = (settings = {}) => {
  const references = isObject(settings.creator?.references) ? settings.creator.references : {}
  const preferredKeys = [
    'editable-action-host:legacy-editable-host',
    ...Object.keys(references)
  ]
  for (const key of preferredKeys) {
    const record = references[key]
    const assetPath = typeof record?.assetPath === 'string' ? record.assetPath.trim() : ''
    if (assetPath && fs.existsSync(assetPath)) return path.resolve(assetPath)
  }
  return ''
}

const resolveFallbackReferenceImagePath = (projectRoot) => {
  for (const candidateParts of DEFAULT_REFERENCE_IMAGE_CANDIDATES) {
    const candidatePath = path.join(projectRoot, ...candidateParts)
    if (fs.existsSync(candidatePath)) return path.resolve(candidatePath)
  }
  return ''
}

const resolveReferenceImagePath = ({
  referenceImagePath = '',
  sourceSettings = {},
  projectRoot
} = {}) => {
  const explicitPath = String(referenceImagePath || '').trim()
  if (explicitPath) {
    if (!fs.existsSync(explicitPath)) {
      throw new Error(`Reference image does not exist: ${explicitPath}`)
    }
    return path.resolve(explicitPath)
  }
  const storedReference = resolveStoredReferenceImagePath(sourceSettings)
  if (storedReference) return storedReference
  const fallbackReference = resolveFallbackReferenceImagePath(projectRoot)
  if (fallbackReference) return fallbackReference
  throw new Error('No usable reference image was found. Pass --reference-image to run this smoke.')
}

const seedScenarioUserData = ({
  sourceUserDataDir,
  targetUserDataDir,
  providerTimeoutMs = 0
} = {}) => {
  ensureDir(targetUserDataDir)
  const sourceSettings = readJsonIfExists(path.join(sourceUserDataDir, 'settings.json'))
  const sourceSecrets = readJsonIfExists(path.join(sourceUserDataDir, 'secrets.json'))
  const seededSettings = prepareSeedSettings(sourceSettings, { providerTimeoutMs })
  const seededSecrets = isObject(sourceSecrets) ? sourceSecrets : { secrets: {} }
  writeJson(path.join(targetUserDataDir, 'settings.json'), seededSettings)
  writeJson(path.join(targetUserDataDir, 'secrets.json'), seededSecrets)
  return {
    sourceSettings,
    seededSettings
  }
}

const createFileBackedSettingsRuntime = ({ settingsPath }) => ({
  loadSettings: () => readJsonIfExists(settingsPath),
  saveSettings: (nextSettings) => writeJson(settingsPath, nextSettings),
  syncLoginItemSettings: () => {}
})

const createSmokeRuntime = ({
  repoRoot,
  workspaceRoot,
  userDataDir
} = {}) => {
  const settingsPath = path.join(userDataDir, 'settings.json')
  const secretsPath = path.join(userDataDir, 'secrets.json')
  const pluginDir = path.join(userDataDir, 'plugins')
  const logDir = path.join(userDataDir, 'logs')
  const referenceRoot = path.join(userDataDir, 'creator-references')
  const userPacksDir = path.join(userDataDir, 'pet-packs')
  const catAnimeRoot = path.join(workspaceRoot, 'cat_anime')
  const animationsPath = path.join(catAnimeRoot, 'animations.json')
  const eventBus = createEventBus()
  const settingsRuntime = createFileBackedSettingsRuntime({ settingsPath })
  const settingsService = createSettingsService({
    eventBus,
    loadSettings: settingsRuntime.loadSettings,
    saveSettings: settingsRuntime.saveSettings
  })
  const secretService = createSecretService({ storePath: secretsPath })
  const appLogService = createAppLogService({ logDir })
  const petPackService = createPetPackService({
    settingsService,
    userPacksDir,
    projectRoot: workspaceRoot,
    bundledPacksDir: path.join(repoRoot, 'assets', 'pet-packs'),
    loadLegacyAnimations: () => getLegacyPetAnimations({ configPath: animationsPath })
  })
  const actionService = createActionService({
    petPackService,
    projectRoot: workspaceRoot,
    saveLegacyAnimations: (config) => {
      writeJson(animationsPath, config)
      return config
    }
  })
  const petService = createPetService({ eventBus, settingsService, actionService, appLogService })
  const aiService = createAiService({ settingsService, secretService, appLogService })
  const imageGenerationModelService = createImageGenerationModelService({ settingsService, secretService, appLogService })
  const creatorReferenceService = createCreatorReferenceService({
    settingsService,
    referenceRoot
  })
  const actionImportService = createActionImportService({
    framesRoot: path.join(catAnimeRoot, 'flames'),
    spritesDir: path.join(catAnimeRoot, 'sprites'),
    configPath: animationsPath
  })

  syncBundledPlugins({
    pluginDir,
    bundledPluginDirs: [path.join(repoRoot, 'examples', 'plugins', 'creator-studio')],
    settingsService
  })

  const pluginService = createPluginService({
    settingsService,
    petService,
    actionService,
    actionImportService,
    petPackService,
    aiService,
    imageGenerationModelService,
    pluginDirs: [pluginDir],
    officialPlugins: [createBasicBehaviorPlugin()],
    openExternal: async () => ({ ok: true }),
    selectCreatorAssetFrameFolder: async () => ({ canceled: true }),
    onPetPackActivated: () => {
      actionService.reload?.()
    },
    getPluginBlockStatus: () => ({ blocked: false, reasons: [] })
  })

  const creatorWorkflowService = createCreatorWorkflowService({
    pluginService,
    imageGenerationModelService,
    actionService,
    creatorReferenceService,
    appLogService
  })

  return {
    actionService,
    appLogService,
    creatorWorkflowService,
    imageGenerationModelService,
    pluginService,
    settingsService
  }
}

const prepareScenarioWorkspace = ({ repoRoot, workspaceRoot } = {}) => {
  copyDirectory(path.join(repoRoot, 'cat_anime'), path.join(workspaceRoot, 'cat_anime'))
}

const toRelativePath = ({ rootDir, targetPath }) => {
  if (!targetPath) return ''
  const relative = path.relative(path.resolve(rootDir), path.resolve(targetPath))
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return ''
  return relative.split(path.sep).join('/')
}

const toPosixPath = (value) => String(value || '').split(path.sep).join('/')
const isSafeRelativePath = (value) => {
  const normalized = toPosixPath(String(value || '').trim())
  if (!normalized) return false
  if (normalized.startsWith('/')) return false
  if (/^[A-Za-z]:\//.test(normalized)) return false
  return !normalized.split('/').some((segment) => segment === '..')
}

const createSafeProjectPath = (targetPath, fallback) => {
  if (!targetPath) return fallback || ''
  const relative = toPosixPath(path.relative(process.cwd(), String(targetPath || '').trim()))
  return isSafeRelativePath(relative) ? relative : fallback
}

const createSafeSessionPath = ({ sessionDir, targetPath, fallback }) => {
  const normalizedTargetPath = String(targetPath || '').trim()
  if (!normalizedTargetPath) return fallback || ''
  if (isSafeRelativePath(normalizedTargetPath)) return toPosixPath(normalizedTargetPath)
  const relative = toRelativePath({ rootDir: sessionDir, targetPath })
  if (relative) return relative
  const absolutePath = path.resolve(normalizedTargetPath)
  return createSafeProjectPath(absolutePath, path.basename(absolutePath) || fallback)
}

const sanitizeText = (value, maxChars = 240) => sanitizeLogText(String(value || ''), { maxChars })

const sanitizeReportPathValue = ({ sessionDir, key, value }) => {
  const rawValue = String(value || '').trim()
  if (!rawValue) return ''
  if (key === 'assetUrl') return undefined
  if (key === 'userDataDir' || key === 'sourceUserDataDir') return DEFAULT_SOURCE_USER_DATA_LABEL
  return createSafeSessionPath({
    sessionDir,
    targetPath: rawValue,
    fallback: key === 'referenceImagePath' || key === 'assetPath'
      ? (path.basename(rawValue) || DEFAULT_REFERENCE_IMAGE_LABEL)
      : key === 'pluginDataDir'
        ? 'plugin-data'
        : key === 'workspaceRoot' || key === 'rootPath'
          ? 'workspace'
          : key === 'runRecordPath'
            ? 'run.json'
            : (path.basename(rawValue) || key)
  })
}

const isReportPathKey = (key) => (
  key === 'rootPath'
  || key === 'assetPath'
  || key === 'assetUrl'
  || /(?:Path|Dir|Root)$/.test(String(key || ''))
)

const sanitizeReportValue = (value, { sessionDir, key = '', depth = 0 } = {}) => {
  if (value == null) return value
  if (depth >= 6) return '[truncated]'
  if (typeof value === 'string') {
    if (isReportPathKey(key)) return sanitizeReportPathValue({ sessionDir, key, value })
    return sanitizeText(value, 500)
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeReportValue(entry, { sessionDir, key, depth: depth + 1 }))
      .filter((entry) => entry !== undefined)
  }
  if (!isObject(value)) return undefined
  return Object.fromEntries(
    Object.entries(value)
      .map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeReportValue(entryValue, { sessionDir, key: entryKey, depth: depth + 1 })
      ])
      .filter(([, entryValue]) => entryValue !== undefined)
  )
}

const readRunRecordSummary = ({ pluginDataDir, runId }) => {
  if (!pluginDataDir || !runId) return { runRecord: null, runRecordPath: '' }
  const runRecordPath = path.join(pluginDataDir, 'runs', runId, 'run.json')
  const runRecord = readJsonIfExists(runRecordPath)
  const generatedImage = isObject(runRecord?.artifacts?.generatedImage)
    ? runRecord.artifacts.generatedImage
    : {}
  const conditioning = isObject(generatedImage?.conditioning)
    ? generatedImage.conditioning
    : null
  const artReadiness = isObject(generatedImage?.artReadiness)
    ? generatedImage.artReadiness
    : {
        level: 'technical-chain-ready',
        approved: false,
        reason: 'no-matching-human-art-approval'
      }
  return {
    runRecordPath,
    runRecord: isObject(runRecord) ? {
      runId: String(runRecord.runId || ''),
      status: String(runRecord.status || ''),
      taskStatus: String(runRecord.taskStatus || ''),
      currentStep: String(runRecord.currentStep || ''),
      backend: String(runRecord.backend || runRecord.input?.backend || ''),
      reviewStatus: String(runRecord.reviewStatus || ''),
      error: sanitizeText(runRecord.error || '', 500),
      artifacts: isObject(runRecord.artifacts) ? Object.keys(runRecord.artifacts) : [],
      artReadiness: sanitizeReportValue(artReadiness, { sessionDir: pluginDataDir }),
      conditioning: conditioning ? {
        mode: String(conditioning.mode || ''),
        endpoint: String(conditioning.endpoint || ''),
        referenceImageCount: Number(conditioning.referenceImageCount) || 0,
        references: Array.isArray(conditioning.references)
          ? conditioning.references.map((reference) => ({
              fileName: String(reference?.fileName || ''),
              relativePath: String(reference?.relativePath || ''),
              metadataRelativePath: String(reference?.metadataRelativePath || ''),
              role: String(reference?.role || '')
            }))
          : []
      } : null,
      anchorGenerationStages: summarizeGenerationStages(generatedImage?.anchorGeneration?.stages),
      generationStages: summarizeGenerationStages(generatedImage?.generationStages)
    } : null
  }
}

const verifyConditioningEvidence = ({ runRecord, allowedFailedActionIds = [] }) => {
  const conditioning = runRecord?.conditioning
  if (!conditioning) {
    return {
      ok: false,
      message: 'Run record is missing reference conditioning evidence'
    }
  }
  const referencePaths = Array.isArray(conditioning.references)
    ? conditioning.references.map((reference) => String(reference?.relativePath || '')).filter(Boolean)
    : []
  const allowedFailures = new Set((Array.isArray(allowedFailedActionIds) ? allowedFailedActionIds : []).map(String))
  const failedStage = [...(runRecord?.anchorGenerationStages || []), ...(runRecord?.generationStages || [])]
    .find((stage) => stage?.ok === false && !allowedFailures.has(String(stage?.actionId || '')))
  if (failedStage) {
    return { ok: false, message: `Provider generation stage failed: ${failedStage.stage || 'unknown'}` }
  }
  if ((Number(conditioning.referenceImageCount) || 0) <= 0) {
    return {
      ok: false,
      message: 'Run conditioning evidence did not record any reference images'
    }
  }
  if (!referencePaths.length) {
    return {
      ok: false,
      message: 'Run conditioning evidence is missing reference relative paths'
    }
  }
  if (conditioning.mode !== 'image-edit') {
    if (conditioning.mode === 'provider-keyframe-sprite-row') {
      const referenceRoles = Array.isArray(conditioning.references)
        ? conditioning.references.map((reference) => String(reference?.role || '')).filter(Boolean)
        : []
      const finalKeyframeRowStage = Array.isArray(runRecord?.generationStages)
        ? runRecord.generationStages.find((stage) => (
          stage?.stage === 'final-image'
          && stage?.ok === true
          && Array.isArray(stage?.referenceRoles)
          && stage.referenceRoles.includes('keyframe-action-reference-board')
        ))
        : null
      if (!finalKeyframeRowStage) {
        return {
          ok: false,
          message: 'Provider keyframe sprite row conditioning is missing a successful final-image stage'
        }
      }
      if (!finalKeyframeRowStage.outputRelativePath) {
        return { ok: false, message: 'Provider keyframe sprite row final stage is missing its output path' }
      }
      if (
        Number(conditioning.referenceImageCount) !== 1 ||
        referencePaths.length !== 1 ||
        referenceRoles.length !== 1 ||
        referenceRoles[0] !== 'keyframe-action-reference-board'
      ) {
        return {
          ok: false,
          message: 'Provider keyframe sprite row conditioning must record exactly one single conditioning board reference'
        }
      }
      if (
        !Array.isArray(finalKeyframeRowStage.referenceRoles) ||
        finalKeyframeRowStage.referenceRoles.length !== 1 ||
        finalKeyframeRowStage.referenceRoles[0] !== 'keyframe-action-reference-board'
      ) {
        return {
          ok: false,
          message: 'Provider keyframe sprite row final stage must use exactly one single conditioning board reference'
        }
      }
      return {
        ok: true,
        message: `Provider keyframe sprite row recorded with a single conditioning board: ${referencePaths.join(', ')}`,
        artifactPaths: {
          referenceInput: referencePaths[0]
        }
      }
    }
    return {
      ok: false,
      message: `Run conditioning mode is not complete provider sprite-row evidence: ${conditioning.mode || 'unknown'}`
    }
  }
  return {
    ok: true,
    message: `Reference conditioning recorded ${conditioning.referenceImageCount} image input(s) through ${conditioning.endpoint || '/images/edits'}`,
    artifactPaths: {
      referenceInput: referencePaths[0]
    }
  }
}

const summarizeCandidateSelection = (candidateSelection = {}) => {
  if (!isObject(candidateSelection)) return null
  const candidateCount = Math.max(0, Number(candidateSelection.candidateCount) || 0)
  const selectedCandidateId = sanitizeText(candidateSelection.selectedCandidateId || '', 160)
  const selectedCandidateRelativePath = sanitizeText(candidateSelection.selectedCandidateRelativePath || '', 500)
  if (candidateCount <= 0 && !selectedCandidateId && !selectedCandidateRelativePath) return null
  return {
    candidateCount,
    selectedCandidateId,
    selectedCandidateRelativePath,
    selectedScore: Math.max(0, Number(candidateSelection.selectedScore) || 0),
    acceptable: Boolean(candidateSelection.acceptable)
  }
}

const summarizeGenerationStages = (stages = []) => (
  Array.isArray(stages)
    ? stages.map((stage) => ({
      ...(stage?.actionId ? { actionId: String(stage.actionId) } : {}),
      stage: String(stage?.stage || ''),
      ok: Object.hasOwn(stage || {}, 'ok') ? Boolean(stage?.ok) : null,
      referenceRole: String(stage?.referenceRole || ''),
      referenceRoles: Array.isArray(stage?.referenceRoles)
        ? stage.referenceRoles.map((role) => String(role || '')).filter(Boolean)
        : [],
      timeoutMs: Math.max(0, Number(stage?.timeoutMs) || 0),
      durationMs: Math.max(0, Number(stage?.durationMs) || 0),
      model: String(stage?.model || ''),
      outputRelativePath: String(stage?.outputRelativePath || ''),
      promptRelativePath: String(stage?.promptRelativePath || ''),
      ...(stage?.adopted ? { adopted: true } : {}),
      ...(summarizeCandidateSelection(stage?.candidateSelection)
        ? { candidateSelection: summarizeCandidateSelection(stage.candidateSelection) }
        : {}),
      error: sanitizeText(stage?.error || '', 500)
    }))
    : []
)

const verifyExistingActionScenario = ({ result, workspaceRoot }) => {
  const actionId = String(result?.run?.importedActionId || result?.importedAction?.actionId || '').trim()
  if (!actionId) return { ok: false, message: 'Imported action id is missing' }
  const framesDir = path.join(workspaceRoot, 'cat_anime', 'flames', actionId)
  const spritePath = path.join(workspaceRoot, 'cat_anime', 'sprites', `${actionId}.png`)
  const animations = readJsonIfExists(path.join(workspaceRoot, 'cat_anime', 'animations.json'))
  const importedAction = Array.isArray(animations.actions)
    ? animations.actions.find((action) => action?.id === actionId)
    : null
  if (!fs.existsSync(framesDir)) return { ok: false, message: `Imported action frames were not found: ${actionId}` }
  if (!fs.existsSync(spritePath)) return { ok: false, message: `Imported action sprite was not found: ${actionId}` }
  if (!importedAction) return { ok: false, message: `Imported action is missing from animations.json: ${actionId}` }
  return {
    ok: true,
    message: `Imported action ${actionId} exists in isolated editable workspace`,
    artifactPaths: {
      framesDir,
      spritePath
    }
  }
}

const resolveImportedPetRoot = ({ result, userDataDir }) => {
  const activePetRoot = String(result?.activePet?.rootPath || '').trim()
  if (activePetRoot && fs.existsSync(activePetRoot)) return activePetRoot
  const resolvedPackId = String(result?.run?.activatedPackId || result?.run?.importedPackId || result?.activePet?.id || '').trim()
  if (!resolvedPackId || !userDataDir) return ''
  const installedPackRoot = path.join(path.resolve(userDataDir), 'pet-packs', resolvedPackId)
  if (fs.existsSync(path.join(installedPackRoot, 'pet.json'))) return installedPackRoot
  return ''
}

const verifyNewCharacterScenario = ({ result, userDataDir }) => {
  const activePetRoot = resolveImportedPetRoot({ result, userDataDir })
  const resolvedPackId = String(result?.run?.activatedPackId || result?.run?.importedPackId || result?.activePet?.id || '').trim()
  if (!resolvedPackId) return { ok: false, message: 'Activated pack id is missing' }
  if (!activePetRoot || !fs.existsSync(activePetRoot)) {
    return { ok: false, message: `Imported pet pack root was not found: ${resolvedPackId}` }
  }
  const petManifestPath = path.join(activePetRoot, 'pet.json')
  if (!fs.existsSync(petManifestPath)) {
    return { ok: false, message: `Imported pet manifest was not found: ${resolvedPackId}` }
  }
  return {
    ok: true,
    message: `Imported pet pack ${resolvedPackId} exists in isolated userData`,
    artifactPaths: {
      petRoot: activePetRoot,
      petManifestPath
    }
  }
}

const verifyPreviewReadyNewCharacterScenario = ({ result }) => {
  const missingOfficialActionIds = Array.isArray(result?.basicActions?.missingRequiredOfficialActionIds)
    ? result.basicActions.missingRequiredOfficialActionIds.map((actionId) => String(actionId || '').trim()).filter(Boolean)
    : []
  if (result?.state !== 'preview-ready' || result?.code !== 'preview_ready') {
    return {
      ok: false,
      message: `Workflow did not complete successfully: ${result?.state || 'unknown'}`
    }
  }
  if (missingOfficialActionIds.length === 0) {
    return {
      ok: false,
      message: 'Preview-ready full-pet output did not report missing official action rows'
    }
  }
  return {
    ok: true,
    message: `Preview-only full-pet output is correctly gated until official rows are generated: ${missingOfficialActionIds.join(', ')}`,
    artifactPaths: {}
  }
}

const verifyScenarioResult = ({ scenario, result, workspaceRoot, userDataDir, runRecord }) => {
  if (scenario === 'new-character' && result?.state === 'preview-ready') {
    return {
      ok: false,
      message: 'New-character workflow stopped at preview-ready; complete provider-generated official action rows are required before this smoke can pass.'
    }
  }
  if (result?.state !== 'completed') {
    return {
      ok: false,
      message: `Workflow did not complete successfully: ${result?.state || 'unknown'}`
    }
  }
  let availableActionIds = []
  let omittedActionIds = []
  if (scenario === 'new-character') {
    availableActionIds = Array.isArray(result?.basicActions?.availableActionIds)
      ? result.basicActions.availableActionIds.map(String).filter((actionId) => OFFICIAL_FULL_PET_ACTION_IDS.includes(actionId))
      : (result?.basicActions?.realActionIds || []).map(String).filter((actionId) => OFFICIAL_FULL_PET_ACTION_IDS.includes(actionId))
    omittedActionIds = OFFICIAL_FULL_PET_ACTION_IDS.filter((actionId) => !availableActionIds.includes(actionId))
    if (!availableActionIds.includes('idle')) {
      return { ok: false, message: 'Completed pet is missing required approved idle action' }
    }
    const generationStages = Array.isArray(runRecord?.generationStages) ? runRecord.generationStages : []
    const oversizedReferenceStage = generationStages.find((stage) => (
      Array.isArray(stage?.referenceRoles) && stage.referenceRoles.length > 1
    ))
    if (oversizedReferenceStage) {
      return { ok: false, message: `Provider stage ${oversizedReferenceStage.stage || 'unknown'} used more than one reference image` }
    }
    if (generationStages.some((stage) => stage?.actionId === 'running-left')) {
      return { ok: false, message: 'running-left must be derived by mirror and must not have a Provider stage' }
    }
    for (const actionId of availableActionIds.filter((candidate) => candidate !== 'running-left')) {
      const stages = (runRecord?.generationStages || []).filter((stage) => stage.actionId === actionId)
      for (const stageNames of [['action-start-keyframe', 'start-keyframe'], ['action-peak-keyframe', 'peak-keyframe'], ['final-image']]) {
        const stage = stages.find((candidate) => stageNames.includes(candidate.stage) && candidate.ok === true)
        const stageName = stageNames[0]
        if (!stage) return { ok: false, message: `Official action ${actionId} is missing successful ${stageName} evidence` }
        if (stageName === 'final-image' && !stage.outputRelativePath) {
          return { ok: false, message: `Official action ${actionId} final-image evidence is missing its output path` }
        }
      }
    }
    if (availableActionIds.includes('running-left')) {
      const mirrorQuality = result?.basicActions?.actionAvailability?.['running-left']?.quality ||
        (result?.basicActions?.rows || []).find((row) => row?.actionId === 'running-left')?.quality
      if (mirrorQuality !== 'approved-mirror') {
        return { ok: false, message: 'Available running-left action is missing approved-mirror evidence' }
      }
    }
  }
  const importVerification = scenario === 'existing-action'
    ? verifyExistingActionScenario({ result, workspaceRoot })
    : verifyNewCharacterScenario({ result, userDataDir })
  if (!importVerification.ok) return importVerification
  const conditioningVerification = verifyConditioningEvidence({
    runRecord,
    allowedFailedActionIds: scenario === 'new-character' ? omittedActionIds : []
  })
  if (!conditioningVerification.ok) return conditioningVerification
  return {
    ok: true,
    technicalCompletion: true,
    artisticApproval: false,
    artReadiness: isObject(runRecord?.artReadiness)
      ? runRecord.artReadiness
      : {
          level: 'technical-chain-ready',
          approved: false,
          reason: 'no-matching-human-art-approval'
        },
    claimBoundary: 'Technical completion and automated QA do not constitute human visual approval.',
    message: `${importVerification.message}. ${conditioningVerification.message}.${scenario === 'new-character' ? ` Available actions: ${availableActionIds.join(', ')}. Omitted actions: ${omittedActionIds.join(', ') || 'none'}.` : ''}`,
    artifactPaths: {
      ...(isObject(importVerification.artifactPaths) ? importVerification.artifactPaths : {}),
      ...(isObject(conditioningVerification.artifactPaths) ? conditioningVerification.artifactPaths : {})
    }
  }
}

const summarizeVerification = (verification = {}, sessionDir) => {
  const artifactPaths = isObject(verification?.artifactPaths)
    ? Object.fromEntries(Object.entries(verification.artifactPaths).map(([key, value]) => [
        key,
        createSafeSessionPath({ sessionDir, targetPath: value, fallback: `${key}.artifact` })
      ]))
    : {}
  return {
    ok: Boolean(verification?.ok),
    message: sanitizeText(verification?.message || '', 500),
    technicalCompletion: verification?.technicalCompletion === true,
    artisticApproval: verification?.artisticApproval === true,
    artReadiness: isObject(verification?.artReadiness)
      ? sanitizeReportValue(verification.artReadiness, { sessionDir })
      : {
          level: 'technical-chain-ready',
          approved: false,
          reason: 'no-matching-human-art-approval'
        },
    claimBoundary: sanitizeText(verification?.claimBoundary || '', 240),
    artifactPaths
  }
}

const approveScenarioReferenceImage = ({ runtime, referenceImagePath } = {}) => {
  const approval = runtime?.creatorWorkflowService?.approveReferenceSourcePath?.(referenceImagePath)
  const referenceImageToken = String(approval?.referenceToken || '').trim()
  if (!referenceImageToken) {
    throw new Error('Creator workflow did not approve the reference image')
  }
  return referenceImageToken
}

const runScenarioWorkflow = async ({
  scenario,
  scenarioDir,
  repoRoot,
  sourceUserDataDir,
  referenceImagePath,
  newCharacterName = DEFAULT_NEW_CHARACTER_NAME,
  newCharacterStylePrompt = DEFAULT_NEW_CHARACTER_STYLE_PROMPT,
  existingActionName = DEFAULT_EXISTING_ACTION_NAME,
  existingActionPrompt = DEFAULT_EXISTING_ACTION_PROMPT,
  logLimit = DEFAULT_LOG_LIMIT,
  createSmokeRuntimeImpl = createSmokeRuntime
} = {}) => {
  const userDataDir = path.join(scenarioDir, 'user-data')
  const workspaceRoot = path.join(scenarioDir, 'workspace')
  prepareScenarioWorkspace({ repoRoot, workspaceRoot })
  const { seededSettings } = seedScenarioUserData({ sourceUserDataDir, targetUserDataDir: userDataDir, providerTimeoutMs })
  const runtime = createSmokeRuntimeImpl({ repoRoot, workspaceRoot, userDataDir })
  const seededProviderConfig = typeof runtime.imageGenerationModelService?.getConfig === 'function'
    ? runtime.imageGenerationModelService.getConfig()
    : {}
  const startedAt = new Date().toISOString()
  const startedAtMs = Date.now()
  try {
    const stateBefore = await runtime.creatorWorkflowService.getState()
    const referenceImageToken = approveScenarioReferenceImage({ runtime, referenceImagePath })
    const result = scenario === 'new-character'
      ? await runtime.creatorWorkflowService.generateNewCharacter({
          characterName: newCharacterName,
          stylePrompt: newCharacterStylePrompt,
          referenceImageToken
        })
      : await runtime.creatorWorkflowService.generateExistingAction({
          actionName: existingActionName,
          motionPrompt: existingActionPrompt,
          referenceImageToken
        })
    const stateAfter = await runtime.creatorWorkflowService.getState()
    const pluginDataDir = runtime.pluginService.getPluginCreatorDataDir(CREATOR_STUDIO_PLUGIN_ID)
    const runId = String(result?.run?.runId || '').trim()
    const { runRecordPath, runRecord } = readRunRecordSummary({ pluginDataDir, runId })
    const conditioningVerification = verifyConditioningEvidence({
      runRecord,
      allowedFailedActionIds: scenario === 'new-character'
        ? (result?.basicActions?.omittedActionIds || [])
        : []
    })
    const verification = verifyScenarioResult({ scenario, result, workspaceRoot, userDataDir, runRecord })
    return {
      scenario,
      ok: Boolean(result?.ok) && verification.ok,
      startedAt,
      durationMs: Date.now() - startedAtMs,
      userDataDir,
      workspaceRoot,
      pluginDataDir,
      referenceImagePath,
      providerBefore: stateBefore?.provider || null,
      providerAfter: stateAfter?.provider || null,
      result,
      verification,
      conditioningVerification,
      runRecordPath,
      runRecord,
      seededSettingsSummary: {
        activePackId: String(seededSettings?.petPacks?.activePackId || ''),
        provider: String(seededProviderConfig?.provider || ''),
        model: String(seededProviderConfig?.model || '')
      },
      appLogs: runtime.appLogService.read({ limit: logLimit }),
      pluginLogs: runtime.pluginService.getLogs({ pluginId: CREATOR_STUDIO_PLUGIN_ID }).slice(-logLimit)
    }
  } finally {
    await runtime.pluginService.stopAllServices()
  }
}

const summarizeScenarioForReport = (scenarioResult, sessionDir) => {
  return {
    scenario: scenarioResult.scenario,
    ok: Boolean(scenarioResult.ok),
    startedAt: scenarioResult.startedAt,
    durationMs: Number(scenarioResult.durationMs) || 0,
    referenceImagePath: createSafeSessionPath({
      sessionDir,
      targetPath: scenarioResult.referenceImagePath,
      fallback: path.basename(String(scenarioResult.referenceImagePath || '').trim()) || DEFAULT_REFERENCE_IMAGE_LABEL
    }),
    userDataDir: createSafeSessionPath({
      sessionDir,
      targetPath: scenarioResult.userDataDir,
      fallback: DEFAULT_SOURCE_USER_DATA_LABEL
    }),
    workspaceRoot: createSafeSessionPath({
      sessionDir,
      targetPath: scenarioResult.workspaceRoot,
      fallback: 'workspace'
    }),
    pluginDataDir: createSafeSessionPath({
      sessionDir,
      targetPath: scenarioResult.pluginDataDir,
      fallback: 'plugin-data'
    }),
    providerBefore: sanitizeReportValue(scenarioResult.providerBefore, { sessionDir }),
    providerAfter: sanitizeReportValue(scenarioResult.providerAfter, { sessionDir }),
    result: sanitizeReportValue(scenarioResult.result, { sessionDir }),
    verification: summarizeVerification(scenarioResult.verification, sessionDir),
    conditioningVerification: summarizeVerification(scenarioResult.conditioningVerification, sessionDir),
    runRecordPath: createSafeSessionPath({
      sessionDir,
      targetPath: scenarioResult.runRecordPath,
      fallback: 'run.json'
    }),
    runRecord: sanitizeReportValue(scenarioResult.runRecord, { sessionDir }),
    seededSettingsSummary: scenarioResult.seededSettingsSummary,
    appLogs: sanitizeReportValue(Array.isArray(scenarioResult.appLogs) ? scenarioResult.appLogs : [], { sessionDir }),
    pluginLogs: sanitizeReportValue(Array.isArray(scenarioResult.pluginLogs) ? scenarioResult.pluginLogs : [], { sessionDir })
  }
}

const runCreatorWorkflowHostSmoke = async ({
  sourceUserDataDir = defaultUserDataDir(),
  referenceImagePath = '',
  outputDir = DEFAULT_OUTPUT_DIR,
  scenario = DEFAULT_SCENARIO,
  newCharacterName = DEFAULT_NEW_CHARACTER_NAME,
  newCharacterStylePrompt = DEFAULT_NEW_CHARACTER_STYLE_PROMPT,
  existingActionName = DEFAULT_EXISTING_ACTION_NAME,
  existingActionPrompt = DEFAULT_EXISTING_ACTION_PROMPT,
  now = () => new Date(),
  runScenarioImpl = runScenarioWorkflow,
  repoRoot = path.join(__dirname, '..')
} = {}) => {
  const sessionPaths = createSessionPaths({ outputDir, now })
  ensureDir(sessionPaths.scenariosDir)
  const sourceSettings = readJsonIfExists(path.join(sourceUserDataDir, 'settings.json'))
  const resolvedReferenceImagePath = resolveReferenceImagePath({
    referenceImagePath,
    sourceSettings,
    projectRoot: repoRoot
  })
  const scenarios = createScenarioList(scenario)
  const scenarioResults = []
  const errors = []

  for (const scenarioName of scenarios) {
    const scenarioDir = path.join(sessionPaths.scenariosDir, scenarioName)
    try {
      const scenarioResult = await runScenarioImpl({
        scenario: scenarioName,
        scenarioDir,
        repoRoot,
        sourceUserDataDir,
        referenceImagePath: resolvedReferenceImagePath,
        newCharacterName,
        newCharacterStylePrompt,
        existingActionName,
        existingActionPrompt
      })
      scenarioResults.push(scenarioResult)
      if (!scenarioResult.ok) {
        errors.push(sanitizeText(
          `${scenarioName}: ${scenarioResult.verification?.message || scenarioResult.result?.message || 'workflow failed'}`,
          500
        ))
      }
    } catch (error) {
      errors.push(sanitizeText(`${scenarioName}: ${error.message || String(error)}`, 500))
      scenarioResults.push({
        scenario: scenarioName,
        ok: false,
        startedAt: now().toISOString(),
        durationMs: 0,
        referenceImagePath: resolvedReferenceImagePath,
        userDataDir: path.join(scenarioDir, 'user-data'),
        workspaceRoot: path.join(scenarioDir, 'workspace'),
        pluginDataDir: '',
        providerBefore: null,
        providerAfter: null,
        result: null,
        verification: {
          ok: false,
          message: sanitizeText(error.message || String(error), 500)
        },
        runRecordPath: '',
        runRecord: null,
        seededSettingsSummary: {},
        appLogs: [],
        pluginLogs: []
      })
    }
  }

  const report = {
    ok: errors.length === 0,
    schemaVersion: 1,
    evidenceType: 'creator-workflow-host-smoke',
    generatedAt: now().toISOString(),
    claimBoundary: 'Validates the real host-owned creator workflow through provider generation plus import/apply handoff, and requires complete provider-generated keyframe sprite-row evidence for canonical-frame action completion. Provider action anchors alone are not acceptable deliverable action-completion evidence; this smoke still does not guarantee the provider visually obeyed that conditioning.',
    sessionId: sessionPaths.sessionId,
    sessionDir: createSafeProjectPath(sessionPaths.sessionDir, `${DEFAULT_SESSION_DIR_LABEL}/${sessionPaths.sessionId}`),
    reportPath: createSafeSessionPath({
      sessionDir: sessionPaths.sessionDir,
      targetPath: sessionPaths.reportPath,
      fallback: 'creator-workflow-host-smoke-report.json'
    }),
    sourceUserDataDir: DEFAULT_SOURCE_USER_DATA_LABEL,
    request: sanitizeReportValue({
      scenario,
      newCharacterName,
      newCharacterStylePrompt,
      existingActionName,
      existingActionPrompt
    }, { sessionDir: sessionPaths.sessionDir }),
    referenceImagePath: createSafeProjectPath(
      path.resolve(resolvedReferenceImagePath),
      path.basename(path.resolve(resolvedReferenceImagePath)) || DEFAULT_REFERENCE_IMAGE_LABEL
    ),
    scenarios: scenarioResults.map((entry) => summarizeScenarioForReport(entry, sessionPaths.sessionDir)),
    errors
  }

  writeJson(sessionPaths.reportPath, report)
  return report
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const report = await runCreatorWorkflowHostSmoke({
    sourceUserDataDir: options.sourceUserDataDir,
    referenceImagePath: options.referenceImagePath,
    outputDir: options.outputDir,
    scenario: options.scenario,
    newCharacterName: options.newCharacterName,
    newCharacterStylePrompt: options.newCharacterStylePrompt,
    existingActionName: options.existingActionName,
    existingActionPrompt: options.existingActionPrompt
  })

  if (options.json) {
    console.log(JSON.stringify(report, null, 2))
    if (report.errors.length) {
      process.exitCode = 1
    }
  } else {
    console.log(`creator workflow host smoke: ${report.ok ? 'ok' : 'failed'}`)
    console.log(`report: ${report.reportPath}`)
    if (report.errors.length) {
      console.error(report.errors.join('\n'))
      process.exitCode = 1
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || String(error))
    process.exitCode = 1
  })
}

module.exports = {
  DEFAULT_OUTPUT_DIR,
  DEFAULT_SCENARIO,
  createScenarioList,
  createSessionPaths,
  defaultAppDataDir,
  defaultUserDataDir,
  parseArgs,
  prepareSeedSettings,
  resolveReferenceImagePath,
  resolveImportedPetRoot,
  verifyConditioningEvidence,
  verifyNewCharacterScenario,
  verifyScenarioResult,
  summarizeGenerationStages,
  approveScenarioReferenceImage,
  runScenarioWorkflow,
  runCreatorWorkflowHostSmoke
}
