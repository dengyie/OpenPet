#!/usr/bin/env node

const fs = require('fs')
const os = require('os')
const path = require('path')

const { createBasicBehaviorPlugin } = require('../src/main/plugins/official/basic-behavior')
const { getLegacyPetAnimations } = require('../src/main/pet-pack/loader')
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

const usage = () => [
  'Usage: node scripts/run-creator-workflow-host-smoke.js [options]',
  '',
  'Options:',
  '  --source-user-data-dir <dir>  Seed userData directory. Defaults to desktop ibot/OpenPet location.',
  '  --reference-image <file>      Reference image for both scenarios.',
  '  --output-dir <dir>            Directory for smoke artifacts. Default: release/creator-workflow-host-smoke',
  '  --scenario <both|new-character|existing-action>',
  '                               Which real workflow scenarios to run. Default: both',
  '  --json                        Print the final report as JSON.',
  '  --help',
  '',
  'Runs the real host-owned creatorWorkflowService in isolated userData/workspace sandboxes.',
  'It validates provider generation plus import/apply handoff, but does not claim that the',
  'uploaded reference image is already sent to the provider as a true multimodal condition.'
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
  createScenarioList(options.scenario)
  return options
}

const prepareSeedSettings = (settings = {}) => ({
  ...settings,
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
    config: isObject(settings.plugins?.config) ? settings.plugins.config : {},
    storage: isObject(settings.plugins?.storage) ? settings.plugins.storage : {},
    logs: []
  },
  localHttp: {
    ...(isObject(settings.localHttp) ? settings.localHttp : {}),
    enabled: false,
    logs: []
  }
})

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
  targetUserDataDir
} = {}) => {
  ensureDir(targetUserDataDir)
  const sourceSettings = readJsonIfExists(path.join(sourceUserDataDir, 'settings.json'))
  const sourceSecrets = readJsonIfExists(path.join(sourceUserDataDir, 'secrets.json'))
  const seededSettings = prepareSeedSettings(sourceSettings)
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

const readRunRecordSummary = ({ pluginDataDir, runId }) => {
  if (!pluginDataDir || !runId) return { runRecord: null, runRecordPath: '' }
  const runRecordPath = path.join(pluginDataDir, 'runs', runId, 'run.json')
  const runRecord = readJsonIfExists(runRecordPath)
  const conditioning = isObject(runRecord?.artifacts?.generatedImage?.conditioning)
    ? runRecord.artifacts.generatedImage.conditioning
    : null
  return {
    runRecordPath,
    runRecord: isObject(runRecord) ? {
      runId: String(runRecord.runId || ''),
      status: String(runRecord.status || ''),
      taskStatus: String(runRecord.taskStatus || ''),
      currentStep: String(runRecord.currentStep || ''),
      backend: String(runRecord.backend || runRecord.input?.backend || ''),
      reviewStatus: String(runRecord.reviewStatus || ''),
      error: String(runRecord.error || ''),
      artifacts: isObject(runRecord.artifacts) ? Object.keys(runRecord.artifacts) : [],
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
      } : null
    } : null
  }
}

const verifyConditioningEvidence = ({ runRecord }) => {
  const conditioning = runRecord?.conditioning
  if (!conditioning) {
    return {
      ok: false,
      message: 'Run record is missing reference conditioning evidence'
    }
  }
  if (conditioning.mode !== 'image-edit') {
    return {
      ok: false,
      message: `Run conditioning mode is not image-edit: ${conditioning.mode || 'unknown'}`
    }
  }
  if ((Number(conditioning.referenceImageCount) || 0) <= 0) {
    return {
      ok: false,
      message: 'Run conditioning evidence did not record any reference images'
    }
  }
  const referencePaths = Array.isArray(conditioning.references)
    ? conditioning.references.map((reference) => String(reference?.relativePath || '')).filter(Boolean)
    : []
  if (!referencePaths.length) {
    return {
      ok: false,
      message: 'Run conditioning evidence is missing reference relative paths'
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

const verifyScenarioResult = ({ scenario, result, workspaceRoot, userDataDir, runRecord }) => {
  if (result?.state !== 'completed') {
    return {
      ok: false,
      message: `Workflow did not complete successfully: ${result?.state || 'unknown'}`
    }
  }
  const importVerification = scenario === 'existing-action'
    ? verifyExistingActionScenario({ result, workspaceRoot })
    : verifyNewCharacterScenario({ result, userDataDir })
  if (!importVerification.ok) return importVerification
  const conditioningVerification = verifyConditioningEvidence({ runRecord })
  if (!conditioningVerification.ok) return conditioningVerification
  return {
    ok: true,
    message: `${importVerification.message}. ${conditioningVerification.message}.`,
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
        toRelativePath({ rootDir: sessionDir, targetPath: value }) || String(value || '')
      ]))
    : {}
  return {
    ok: Boolean(verification?.ok),
    message: String(verification?.message || ''),
    artifactPaths
  }
}

const runScenarioWorkflow = async ({
  scenario,
  scenarioDir,
  repoRoot,
  sourceUserDataDir,
  referenceImagePath,
  logLimit = DEFAULT_LOG_LIMIT
} = {}) => {
  const userDataDir = path.join(scenarioDir, 'user-data')
  const workspaceRoot = path.join(scenarioDir, 'workspace')
  prepareScenarioWorkspace({ repoRoot, workspaceRoot })
  const { seededSettings } = seedScenarioUserData({ sourceUserDataDir, targetUserDataDir: userDataDir })
  const runtime = createSmokeRuntime({ repoRoot, workspaceRoot, userDataDir })
  const startedAt = new Date().toISOString()
  const startedAtMs = Date.now()
  try {
    const stateBefore = await runtime.creatorWorkflowService.getState()
    const result = scenario === 'new-character'
      ? await runtime.creatorWorkflowService.generateNewCharacter({
          characterName: DEFAULT_NEW_CHARACTER_NAME,
          stylePrompt: DEFAULT_NEW_CHARACTER_STYLE_PROMPT,
          referenceImagePath
        })
      : await runtime.creatorWorkflowService.generateExistingAction({
          actionName: DEFAULT_EXISTING_ACTION_NAME,
          motionPrompt: DEFAULT_EXISTING_ACTION_PROMPT,
          referenceImagePath
        })
    const stateAfter = await runtime.creatorWorkflowService.getState()
    const pluginDataDir = runtime.pluginService.getPluginCreatorDataDir(CREATOR_STUDIO_PLUGIN_ID)
    const runId = String(result?.run?.runId || '').trim()
    const { runRecordPath, runRecord } = readRunRecordSummary({ pluginDataDir, runId })
    const conditioningVerification = verifyConditioningEvidence({ runRecord })
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
        provider: String(seededSettings?.models?.imageGeneration?.provider || ''),
        model: String(seededSettings?.models?.imageGeneration?.model || '')
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
    referenceImagePath: toRelativePath({ rootDir: sessionDir, targetPath: scenarioResult.referenceImagePath }) || scenarioResult.referenceImagePath,
    userDataDir: toRelativePath({ rootDir: sessionDir, targetPath: scenarioResult.userDataDir }) || scenarioResult.userDataDir,
    workspaceRoot: toRelativePath({ rootDir: sessionDir, targetPath: scenarioResult.workspaceRoot }) || scenarioResult.workspaceRoot,
    pluginDataDir: toRelativePath({ rootDir: sessionDir, targetPath: scenarioResult.pluginDataDir }) || scenarioResult.pluginDataDir,
    providerBefore: scenarioResult.providerBefore,
    providerAfter: scenarioResult.providerAfter,
    result: scenarioResult.result,
    verification: summarizeVerification(scenarioResult.verification, sessionDir),
    conditioningVerification: summarizeVerification(scenarioResult.conditioningVerification, sessionDir),
    runRecordPath: toRelativePath({ rootDir: sessionDir, targetPath: scenarioResult.runRecordPath }) || scenarioResult.runRecordPath,
    runRecord: scenarioResult.runRecord,
    seededSettingsSummary: scenarioResult.seededSettingsSummary,
    appLogs: Array.isArray(scenarioResult.appLogs) ? scenarioResult.appLogs : [],
    pluginLogs: Array.isArray(scenarioResult.pluginLogs) ? scenarioResult.pluginLogs : []
  }
}

const runCreatorWorkflowHostSmoke = async ({
  sourceUserDataDir = defaultUserDataDir(),
  referenceImagePath = '',
  outputDir = DEFAULT_OUTPUT_DIR,
  scenario = DEFAULT_SCENARIO,
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
        referenceImagePath: resolvedReferenceImagePath
      })
      scenarioResults.push(scenarioResult)
      if (!scenarioResult.ok) {
        errors.push(`${scenarioName}: ${scenarioResult.verification?.message || scenarioResult.result?.message || 'workflow failed'}`)
      }
    } catch (error) {
      errors.push(`${scenarioName}: ${error.message || String(error)}`)
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
          message: error.message || String(error)
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
    claimBoundary: 'Validates the real host-owned creator workflow through provider generation plus import/apply handoff, and records evidence that the run-local canonical reference image was sent into the provider request as an image-edit conditioning input. It does not guarantee the provider visually obeyed that conditioning.',
    sessionId: sessionPaths.sessionId,
    sessionDir: sessionPaths.sessionDir,
    reportPath: sessionPaths.reportPath,
    sourceUserDataDir: path.resolve(sourceUserDataDir),
    referenceImagePath: path.resolve(resolvedReferenceImagePath),
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
    scenario: options.scenario
  })

  if (options.json) {
    console.log(JSON.stringify(report, null, 2))
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
  verifyNewCharacterScenario,
  verifyScenarioResult,
  runCreatorWorkflowHostSmoke
}
