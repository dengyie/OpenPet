const PLUGIN_BRIDGE_ROUTE_INVENTORY = Object.freeze([
  { method: 'GET', path: '/context', handlerName: 'context', permission: '', description: 'Read bounded command bridge context.' },
  { method: 'GET', path: '/creator/actions', handlerName: 'creatorActionsRead', permission: 'actions:read', description: 'Read the current host-owned action snapshot.' },
  { method: 'POST', path: '/creator/actions/validate', handlerName: 'creatorActionsValidate', permission: 'actions:write', description: 'Validate a proposed action mutation without applying it.' },
  { method: 'POST', path: '/creator/actions/apply', handlerName: 'creatorActionsApply', permission: 'actions:write', description: 'Apply a validated host-owned action mutation.' },
  { method: 'POST', path: '/creator/actions/submit-trigger-proposal', handlerName: 'creatorActionsSubmitTriggerProposal', permission: 'actions:write', description: 'Submit a trigger proposal into the host review inbox.' },
  { method: 'GET', path: '/creator/pack-manifest', handlerName: 'creatorPackManifestRead', permission: 'pack-manifest:read', description: 'Read the active installed user pack manifest view.' },
  { method: 'POST', path: '/creator/pack-manifest/validate', handlerName: 'creatorPackManifestValidate', permission: 'pack-manifest:write', description: 'Validate a bounded pack-manifest mutation.' },
  { method: 'POST', path: '/creator/pack-manifest/apply', handlerName: 'creatorPackManifestApply', permission: 'pack-manifest:write', description: 'Apply a bounded pack-manifest mutation through the host.' },
  { method: 'POST', path: '/creator/assets/inspect-frames', handlerName: 'creatorAssetsInspectFrames', permission: 'assets:inspect', description: 'Inspect package-local or data-local action frames.' },
  { method: 'POST', path: '/creator/assets/import-frames', handlerName: 'creatorAssetsImportFrames', permission: 'assets:generate', description: 'Import package-local or data-local action frames through host generation paths.' },
  { method: 'POST', path: '/creator/assets/pick-frames/inspect', handlerName: 'creatorAssetsPickFramesInspect', permission: 'assets:inspect', description: 'Inspect user-picked action frames without exposing absolute paths to the command.' },
  { method: 'POST', path: '/creator/assets/pick-frames/import', handlerName: 'creatorAssetsPickFramesImport', permission: 'assets:generate', description: 'Import user-picked action frames after host approval and inspection.' },
  { method: 'POST', path: '/creator/pet-pack/inspect-output', handlerName: 'creatorPetPackInspectOutput', permission: 'pet-pack:import', description: 'Inspect approved pet-pack output before host import.' },
  { method: 'POST', path: '/creator/pet-pack/import-output', handlerName: 'creatorPetPackImportOutput', permission: 'pet-pack:import', description: 'Import approved pet-pack output through the host boundary.' },
  { method: 'GET', path: '/creator/model-settings', handlerName: 'creatorModelSettingsRead', permission: 'model:image-generate', description: 'Read sanitized host-owned image model settings.' },
  { method: 'POST', path: '/creator/model-health-check', handlerName: 'creatorModelHealthCheck', permission: 'model:image-generate', description: 'Run a host-owned image provider health check.' },
  { method: 'POST', path: '/creator/model-image-generate', handlerName: 'creatorModelImageGenerate', permission: 'model:image-generate', description: 'Generate image output through the host-owned provider path.' },
  { method: 'POST', path: '/pet/say', handlerName: 'petSay', permission: 'pet:say', description: 'Send pet speech through PetService.' },
  { method: 'POST', path: '/pet/action', handlerName: 'petAction', permission: 'pet:action', description: 'Play a pet action through PetService.' },
  { method: 'POST', path: '/pet/event', handlerName: 'petEvent', permission: 'pet:event', description: 'Emit a bounded pet event through PetService.' }
])

const PLUGIN_BRIDGE_ROUTE_PERMISSION_NAMES = Object.freeze(PLUGIN_BRIDGE_ROUTE_INVENTORY
  .map((entry) => entry.permission)
  .filter(Boolean)
  .filter((permission, index, values) => values.indexOf(permission) === index))

const createPluginBridgeHandlersController = ({
  appendLog,
  assertPermission,
  getBridgeContext,
  getActionsSnapshot,
  validateActionMutation,
  applyActionMutation,
  submitTriggerProposal,
  readPackManifest,
  validatePackManifestMutation,
  applyPackManifestMutation,
  inspectFrames,
  importFrames,
  inspectPackOutput,
  importPackOutput,
  setActivePack,
  onPetPackActivated,
  readModelSettings,
  checkModelHealth,
  generateModelImage,
  petService,
  resolveAssetPath,
  resolveDataPath,
  selectAssetSourceDir,
  assertDirectoryHasNoSymlinks,
  assertCreatorAssetImportWithinLimits,
  ensureCreatorDirs
} = {}) => {
  if (typeof appendLog !== 'function') throw new Error('appendLog is required')
  if (typeof assertPermission !== 'function') throw new Error('assertPermission is required')
  if (typeof getBridgeContext !== 'function') throw new Error('getBridgeContext is required')
  if (!petService) throw new Error('petService is required')

  const createHandlers = (plugin, commandId) => ({
    context: async () => {
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge context requested' })
      return { ok: true, context: getBridgeContext() }
    },
    creatorActionsRead: async () => {
      assertPermission(plugin.manifest, 'actions:read')
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.actions read invoked' })
      if (typeof getActionsSnapshot !== 'function') throw new Error('Creator action read is not available')
      return { ok: true, actions: getActionsSnapshot() }
    },
    creatorActionsValidate: async (payload = {}) => {
      assertPermission(plugin.manifest, 'actions:write')
      if (typeof validateActionMutation !== 'function') throw new Error('Creator action validation is not available')
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.actions validate invoked' })
      return { ok: true, validation: validateActionMutation(payload) }
    },
    creatorActionsApply: async (payload = {}) => {
      assertPermission(plugin.manifest, 'actions:write')
      if (typeof applyActionMutation !== 'function') throw new Error('Creator action apply is not available')
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.actions apply invoked' })
      return { ok: true, actions: applyActionMutation(payload) }
    },
    creatorActionsSubmitTriggerProposal: async (payload = {}) => {
      assertPermission(plugin.manifest, 'actions:write')
      if (typeof submitTriggerProposal !== 'function') throw new Error('Creator action trigger proposal submission is not available')
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.actions submit-trigger-proposal invoked' })
      return { ok: true, ...submitTriggerProposal(payload) }
    },
    creatorPackManifestRead: async () => {
      assertPermission(plugin.manifest, 'pack-manifest:read')
      if (typeof readPackManifest !== 'function') throw new Error('Creator pack manifest read is not available')
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.pack-manifest read invoked' })
      return { ok: true, manifest: readPackManifest() }
    },
    creatorPackManifestValidate: async (payload = {}) => {
      assertPermission(plugin.manifest, 'pack-manifest:write')
      if (typeof validatePackManifestMutation !== 'function') throw new Error('Creator pack manifest validation is not available')
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.pack-manifest validate invoked' })
      return { ok: true, validation: validatePackManifestMutation(payload) }
    },
    creatorPackManifestApply: async (payload = {}) => {
      assertPermission(plugin.manifest, 'pack-manifest:write')
      if (typeof applyPackManifestMutation !== 'function') throw new Error('Creator pack manifest apply is not available')
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.pack-manifest apply invoked' })
      return { ok: true, manifest: applyPackManifestMutation(payload) }
    },
    creatorAssetsInspectFrames: async (payload = {}) => {
      assertPermission(plugin.manifest, 'assets:inspect')
      if (typeof inspectFrames !== 'function') throw new Error('Creator asset inspection is not available')
      const sourceDir = payload.dataRelativePath
        ? resolveDataPath(plugin.manifest, payload.dataRelativePath)
        : resolveAssetPath(plugin.manifest, payload.relativePath)
      assertDirectoryHasNoSymlinks(sourceDir)
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.assets inspect-frames invoked' })
      return { ok: true, result: await inspectFrames({ sourceDir, actionId: payload.actionId }) }
    },
    creatorAssetsImportFrames: async (payload = {}) => {
      assertPermission(plugin.manifest, 'assets:generate')
      if (typeof inspectFrames !== 'function' || typeof importFrames !== 'function') {
        throw new Error('Creator asset import is not available')
      }
      const sourceDir = payload.dataRelativePath
        ? resolveDataPath(plugin.manifest, payload.dataRelativePath)
        : resolveAssetPath(plugin.manifest, payload.relativePath)
      assertDirectoryHasNoSymlinks(sourceDir)
      const actionId = String(payload.actionId || '')
      const label = payload.label == null || payload.label === '' ? undefined : String(payload.label)
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.assets import-frames invoked' })
      const preflight = await inspectFrames({ sourceDir, actionId })
      assertCreatorAssetImportWithinLimits(preflight.inspection, sourceDir)
      const result = await importFrames({ sourceDir, actionId, label })
      const { importedAction, ...actions } = result
      return { ok: true, actions, importedAction }
    },
    creatorAssetsPickFramesInspect: async (payload = {}) => {
      assertPermission(plugin.manifest, 'assets:inspect')
      if (typeof inspectFrames !== 'function') throw new Error('Creator asset inspection is not available')
      const selected = await selectAssetSourceDir()
      if (selected.canceled) return { ok: true, canceled: true }
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.assets pick-frames inspect invoked' })
      return {
        ok: true,
        canceled: false,
        result: await inspectFrames({ sourceDir: selected.sourceDir, actionId: payload.actionId })
      }
    },
    creatorAssetsPickFramesImport: async (payload = {}) => {
      assertPermission(plugin.manifest, 'assets:generate')
      if (typeof inspectFrames !== 'function' || typeof importFrames !== 'function') {
        throw new Error('Creator asset import is not available')
      }
      const selected = await selectAssetSourceDir()
      if (selected.canceled) return { ok: true, canceled: true }
      const actionId = String(payload.actionId || '')
      const label = payload.label == null || payload.label === '' ? undefined : String(payload.label)
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.assets pick-frames import invoked' })
      const preflight = await inspectFrames({ sourceDir: selected.sourceDir, actionId })
      assertCreatorAssetImportWithinLimits(preflight.inspection, selected.sourceDir)
      const result = await importFrames({ sourceDir: selected.sourceDir, actionId, label })
      const { importedAction, ...actions } = result
      return { ok: true, canceled: false, actions, importedAction }
    },
    creatorPetPackInspectOutput: async (payload = {}) => {
      assertPermission(plugin.manifest, 'pet-pack:import')
      if (typeof inspectPackOutput !== 'function') throw new Error('Creator pet pack inspection is not available')
      const sourcePath = payload.dataRelativePath
        ? resolveDataPath(plugin.manifest, payload.dataRelativePath)
        : resolveAssetPath(plugin.manifest, payload.relativePath)
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.pet-pack inspect-output invoked' })
      return { ok: true, inspection: inspectPackOutput(sourcePath) }
    },
    creatorPetPackImportOutput: async (payload = {}) => {
      assertPermission(plugin.manifest, 'pet-pack:import')
      if (typeof importPackOutput !== 'function') throw new Error('Creator pet pack import is not available')
      const selectionId = String(payload.selectionId || '')
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.pet-pack import-output invoked' })
      const imported = importPackOutput(selectionId)
      const activated = payload.activate && imported?.pack?.id && typeof setActivePack === 'function'
        ? setActivePack(imported.pack.id)
        : null
      if (activated && typeof onPetPackActivated === 'function') {
        onPetPackActivated({
          pluginId: plugin.manifest.id,
          commandId,
          packId: imported.pack.id,
          imported,
          activated
        })
      }
      return { ok: true, imported, activated }
    },
    creatorModelSettingsRead: async () => {
      assertPermission(plugin.manifest, 'model:image-generate')
      if (typeof readModelSettings !== 'function') throw new Error('Creator model settings are not available')
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.model-settings read invoked' })
      return { ok: true, config: readModelSettings() }
    },
    creatorModelHealthCheck: async () => {
      assertPermission(plugin.manifest, 'model:image-generate')
      if (typeof checkModelHealth !== 'function') throw new Error('Creator model health check is not available')
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.model-health-check invoked' })
      return { ok: true, result: await checkModelHealth({}) }
    },
    creatorModelImageGenerate: async (payload = {}) => {
      assertPermission(plugin.manifest, 'model:image-generate')
      if (typeof generateModelImage !== 'function') throw new Error('Creator model image generation is not available')
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.model-image-generate invoked' })
      const { backend: _ignoredBackend, ...providerPayload } = payload
      return {
        ok: true,
        result: await generateModelImage({
          ...providerPayload,
          output: {
            ...(payload.output || {}),
            dataDir: ensureCreatorDirs(plugin.manifest).dataDir
          }
        })
      }
    },
    petSay: async (payload = {}) => {
      assertPermission(plugin.manifest, 'pet:say')
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge pet.say invoked' })
      return {
        ok: true,
        result: petService.say({
          text: payload.text,
          ttlMs: payload.ttlMs,
          source: `plugin:${plugin.manifest.id}:bridge`
        })
      }
    },
    petAction: async (payload = {}) => {
      assertPermission(plugin.manifest, 'pet:action')
      const actionId = String(payload.actionId || '')
      appendLog({
        pluginId: plugin.manifest.id,
        commandId,
        level: 'info',
        message: `Bridge pet.action invoked: ${actionId}`.slice(0, 240)
      })
      return {
        ok: true,
        result: petService.playAction({
          actionId,
          source: `plugin:${plugin.manifest.id}:bridge`
        })
      }
    },
    petEvent: async (payload = {}) => {
      assertPermission(plugin.manifest, 'pet:event')
      const eventType = String(payload.type || '')
      appendLog({
        pluginId: plugin.manifest.id,
        commandId,
        level: 'info',
        message: `Bridge pet.event invoked: ${eventType}`.slice(0, 240)
      })
      return {
        ok: true,
        result: petService.setEvent({
          type: payload.type,
          message: payload.message,
          ttlMs: payload.ttlMs,
          source: `plugin:${plugin.manifest.id}:bridge`
        })
      }
    }
  })

  return {
    createHandlers
  }
}

module.exports = {
  PLUGIN_BRIDGE_ROUTE_INVENTORY,
  PLUGIN_BRIDGE_ROUTE_PERMISSION_NAMES,
  createPluginBridgeHandlersController
}
