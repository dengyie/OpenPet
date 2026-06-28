const { IPC } = require('../../shared/ipc-channels')

const registerSettingsIpc = (context) => {
  const {
    ipcMainService,
    getPetWindow,
    petService,
    petPackService,
    actionService,
    actionImportService,
    cursorAssetService,
    petMovementPolicy,
    browserWindowService,
    helpers
  } = context
  const {
    showOpenDialogForEvent,
    createSelectionId,
    getPendingActionFrameSelection,
    inspectPendingActionFrameSelection,
    setPendingActionFrameSelection,
    clearPendingActionFrameSelection,
    reloadAndSendAnimations,
    recordAppLog,
    collectCustomCursorAssetPaths,
    sendToPetWindow,
    createPetRendererSettings,
    mergePetSettingsViewIntoHostSettings,
    createActionFrameImportResult,
    createActionsMutationResult,
    createPetPackMutationResult
  } = helpers

  ipcMainService.handle(IPC.SETTINGS_GET, () => createPetRendererSettings(petService.getSettings()))

  ipcMainService.handle(IPC.SETTINGS_IMPORT_CURSOR, async (event) => {
    if (!cursorAssetService?.importCursor) throw new Error('Cursor asset import is not available')
    recordAppLog({
      scope: 'settings',
      level: 'info',
      actor: 'user',
      event: 'settings.cursor.import.opened',
      message: 'Cursor image picker opened'
    })
    try {
      const selected = await showOpenDialogForEvent(event, {
        title: '选择自定义鼠标指针图片',
        properties: ['openFile'],
        filters: [{ name: 'Cursor Images', extensions: ['png', 'webp'] }]
      })
      if (selected.canceled || !selected.filePaths[0]) {
        recordAppLog({
          scope: 'settings',
          level: 'info',
          actor: 'user',
          event: 'settings.cursor.import.canceled',
          message: 'Cursor image picker canceled'
        })
        return { canceled: true }
      }
      const cursor = await cursorAssetService.importCursor(selected.filePaths[0])
      recordAppLog({
        scope: 'settings',
        level: 'info',
        actor: 'system',
        event: 'settings.cursor.import.completed',
        message: 'Cursor image imported',
        details: {
          fileName: cursor.fileName,
          enabled: cursor.enabled
        }
      })
      return { canceled: false, cursor }
    } catch (error) {
      recordAppLog({
        scope: 'settings',
        level: 'error',
        actor: 'system',
        event: 'settings.cursor.import.failed',
        message: error.message
      })
      throw error
    }
  })

  ipcMainService.handle(IPC.ACTIONS_GET, () => petService.getPreviewAnimations())
  ipcMainService.handle(IPC.ACTIONS_INSPECT_FRAMES, async (event, payload) => {
    const selected = await showOpenDialogForEvent(event, {
      title: '选择动作帧文件夹',
      properties: ['openDirectory']
    })
    if (selected.canceled || !selected.filePaths[0]) return { canceled: true }
    const selectionId = createSelectionId()
    const sourceDir = selected.filePaths[0]
    const result = await actionImportService.inspectActionFrames({ sourceDir, actionId: payload.actionId })
    setPendingActionFrameSelection({ id: selectionId, sourceDir })
    return { canceled: false, selectionId, ...result }
  })
  ipcMainService.handle(IPC.ACTIONS_REINSPECT_FRAMES, async (_event, payload) => {
    return inspectPendingActionFrameSelection({ selectionId: payload.selectionId, actionId: payload.actionId })
  })
  ipcMainService.handle(IPC.ACTIONS_CLEAR_FRAME_SELECTION, (_event, payload) => {
    if (!payload?.selectionId || context.state.pendingActionFrameSelection?.id === payload.selectionId) {
      clearPendingActionFrameSelection()
    }
    return { ok: true }
  })
  ipcMainService.handle(IPC.ACTIONS_IMPORT_FRAMES, async (_event, payload) => {
    const selection = getPendingActionFrameSelection(payload.selectionId)
    const inspectionResult = await inspectPendingActionFrameSelection({ selectionId: payload.selectionId, actionId: payload.actionId })
    if (!inspectionResult.inspection.valid) {
      return createActionFrameImportResult({ ok: false, inspectionResult })
    }
    const result = await actionImportService.importActionFrames({
      sourceDir: selection.sourceDir,
      actionId: payload.actionId,
      label: payload.label
    })
    clearPendingActionFrameSelection()
    reloadAndSendAnimations(getPetWindow, petService)
    return createActionFrameImportResult({ ok: true, canceled: false, result }, petService.getPreviewAnimations())
  })

  ipcMainService.handle(IPC.ACTIONS_SAVE_CONFIG, async (_event, payload) => {
    if (payload?.triggerProposal) {
      if (!actionService?.acceptTriggerProposal) throw new Error('Action trigger proposal acceptance is not available')
      const triggerProposal = actionService.acceptTriggerProposal(payload.triggerProposal)
      const animations = triggerProposal.applied
        ? reloadAndSendAnimations(getPetWindow, petService)
        : petService.getPreviewAnimations()
      recordAppLog({
        scope: 'actions',
        level: 'info',
        actor: 'user',
        event: 'actions.trigger-proposal.accepted',
        message: 'Action trigger proposal accepted',
        details: {
          actionId: triggerProposal.actionId,
          type: triggerProposal.type,
          binding: triggerProposal.binding,
          applied: triggerProposal.applied,
          code: triggerProposal.code,
          sourcePluginId: triggerProposal.sourcePluginId || '',
          sourceRunId: triggerProposal.sourceRunId || '',
          sourceCommandId: triggerProposal.sourceCommandId || ''
        }
      })
      return createActionsMutationResult(animations, { triggerProposal })
    }
    await actionImportService.updateActionConfig(payload)
    reloadAndSendAnimations(getPetWindow, petService)
    return createActionsMutationResult(petService.getPreviewAnimations())
  })

  ipcMainService.handle(IPC.ACTIONS_SUBMIT_TRIGGER_PROPOSAL, async (_event, payload) => {
    if (!actionService?.submitTriggerProposal) throw new Error('Action trigger proposal inbox is not available')
    const result = actionService.submitTriggerProposal(payload)
    recordAppLog({
      scope: 'actions',
      level: 'info',
      actor: 'plugin',
      event: 'actions.trigger-proposal.submitted',
      message: 'Action trigger proposal submitted',
      details: {
        proposalId: result.proposal.id,
        actionId: result.proposal.actionId,
        type: result.proposal.type,
        sourcePluginId: result.proposal.sourcePluginId || '',
        sourceRunId: result.proposal.sourceRunId || '',
        sourceCommandId: result.proposal.sourceCommandId || ''
      }
    })
    return createActionsMutationResult(result.animations, { proposal: result.proposal })
  })
  ipcMainService.handle(IPC.ACTIONS_ACCEPT_TRIGGER_PROPOSAL, async (_event, payload) => {
    if (!actionService?.acceptTriggerProposalItem) throw new Error('Action trigger proposal inbox is not available')
    const result = actionService.acceptTriggerProposalItem(payload?.proposalId)
    const animations = result.triggerProposal?.applied
      ? reloadAndSendAnimations(getPetWindow, petService)
      : result.animations
    recordAppLog({
      scope: 'actions',
      level: 'info',
      actor: 'user',
      event: 'actions.trigger-proposal.inbox.accepted',
      message: 'Action trigger proposal accepted from inbox',
      details: {
        proposalId: result.proposal.id,
        actionId: result.proposal.actionId,
        type: result.proposal.type,
        applied: Boolean(result.triggerProposal?.applied),
        code: result.triggerProposal?.code || ''
      }
    })
    return createActionsMutationResult(animations, { proposal: result.proposal, triggerProposal: result.triggerProposal })
  })
  ipcMainService.handle(IPC.ACTIONS_REJECT_TRIGGER_PROPOSAL, async (_event, payload) => {
    if (!actionService?.rejectTriggerProposalItem) throw new Error('Action trigger proposal inbox is not available')
    const result = actionService.rejectTriggerProposalItem(payload?.proposalId, payload?.reason)
    recordAppLog({
      scope: 'actions',
      level: 'info',
      actor: 'user',
      event: 'actions.trigger-proposal.inbox.rejected',
      message: 'Action trigger proposal rejected from inbox',
      details: {
        proposalId: result.proposal.id,
        actionId: result.proposal.actionId,
        type: result.proposal.type
      }
    })
    return createActionsMutationResult(result.animations, { proposal: result.proposal })
  })
  ipcMainService.handle(IPC.ACTIONS_DELETE_TRIGGER_RULE, async (_event, payload) => {
    if (!actionService?.removeTriggerRule) throw new Error('Action trigger rule deletion is not available')
    const animations = actionService.removeTriggerRule(payload?.ruleId)
    recordAppLog({
      scope: 'actions',
      level: 'info',
      actor: 'user',
      event: 'actions.trigger-rule.deleted',
      message: 'Action trigger rule deleted',
      details: { ruleId: String(payload?.ruleId || '') }
    })
    return createActionsMutationResult(animations)
  })
  ipcMainService.handle(IPC.ACTIONS_SET_TRIGGER_RULE_ENABLED, async (_event, payload) => {
    if (!actionService?.setTriggerRuleEnabled) throw new Error('Action trigger rule toggle is not available')
    const animations = actionService.setTriggerRuleEnabled(payload?.ruleId, payload?.enabled)
    recordAppLog({
      scope: 'actions',
      level: 'info',
      actor: 'user',
      event: 'actions.trigger-rule.toggled',
      message: 'Action trigger rule enabled state updated',
      details: {
        ruleId: String(payload?.ruleId || ''),
        enabled: Boolean(payload?.enabled)
      }
    })
    return createActionsMutationResult(animations)
  })
  ipcMainService.handle(IPC.ACTIONS_DELETE, async (_event, payload) => {
    await actionImportService.deleteAction(payload.actionId)
    reloadAndSendAnimations(getPetWindow, petService)
    return createActionsMutationResult(petService.getPreviewAnimations())
  })

  ipcMainService.handle(IPC.PET_PACKS_LIST, () => petPackService.listPacks())
  ipcMainService.handle(IPC.PET_PACKS_INSPECT_DIRECTORY, async (event) => {
    const selected = await showOpenDialogForEvent(event, {
      title: '选择 Pet Pack 文件夹或 Codex Pet 包',
      properties: ['openFile', 'openDirectory'],
      filters: [{ name: 'Pet Pack Package', extensions: ['zip'] }]
    })
    if (selected.canceled || !selected.filePaths[0]) return { canceled: true }
    return { canceled: false, ...petPackService.inspectPackSource(selected.filePaths[0]) }
  })
  ipcMainService.handle(IPC.PET_PACKS_CLEAR_SELECTION, (_event, payload) => petPackService.clearPendingSelection(payload?.selectionId))
  ipcMainService.handle(IPC.PET_PACKS_IMPORT, (_event, payload) => {
    const result = petPackService.importPack(payload.selectionId)
    const petPacks = petPackService.listPacks()
    if (result?.pack?.id && petPacks?.activePackId === result.pack.id) {
      const animations = reloadAndSendAnimations(getPetWindow, petService)
      return createPetPackMutationResult(result, petPacks, animations)
    }
    return createPetPackMutationResult(result, petPacks)
  })
  ipcMainService.handle(IPC.PET_PACKS_EXPORT, async (event, payload) => {
    const selected = await showOpenDialogForEvent(event, {
      title: '选择 Pet Pack 导出目录',
      properties: ['openDirectory', 'createDirectory']
    })
    if (selected.canceled || !selected.filePaths[0]) return { canceled: true }
    return { canceled: false, ...petPackService.exportPack(payload.packId, selected.filePaths[0]) }
  })
  ipcMainService.handle(IPC.PET_PACKS_REMOVE, (_event, payload) => {
    const result = petPackService.removePack(payload.packId)
    return createPetPackMutationResult(result, petPackService.listPacks())
  })

  ipcMainService.handle(IPC.SETTINGS_SAVE, (_event, settings) => {
    const petWindow = getPetWindow()
    const previousSettings = petService.getSettings()
    const nextSettings = mergePetSettingsViewIntoHostSettings(petService.getSettings(), settings)
    if (petMovementPolicy && petWindow && !petWindow.isDestroyed()) {
      const behavior = petMovementPolicy.normalizePetBehaviorSettings(nextSettings.petBehavior)
      const currentBehavior = petMovementPolicy.normalizePetBehaviorSettings(previousSettings.petBehavior)
      const needsInitialHomeAnchor = behavior.home.enabled && !behavior.home.anchor
      if (needsInitialHomeAnchor || (!currentBehavior.home.enabled && behavior.home.enabled)) {
        behavior.home.anchor = petMovementPolicy.createHomeAnchorFromWindow({ windowBounds: petWindow.getBounds() })
      }
      nextSettings.petBehavior = behavior
    }
    const savedSettings = petService.saveSettings(nextSettings)
    const previousAssetPaths = new Set(collectCustomCursorAssetPaths(previousSettings.customCursors))
    const nextAssetPaths = new Set(collectCustomCursorAssetPaths(savedSettings.customCursors))
    const orphanedAssetPaths = Array.from(previousAssetPaths).filter((assetPath) => !nextAssetPaths.has(assetPath))
    if (orphanedAssetPaths.length > 0) cursorAssetService?.deleteAssets?.(orphanedAssetPaths)
    const rendererSettings = createPetRendererSettings(savedSettings)
    sendToPetWindow(getPetWindow, IPC.SETTINGS_CHANGED, rendererSettings)
    recordAppLog({
      scope: 'settings',
      level: 'info',
      actor: 'user',
      event: 'settings.saved',
      message: 'Settings saved',
      details: {
        grounded: Boolean(savedSettings.petBehavior?.grounded),
        homeEnabled: Boolean(savedSettings.petBehavior?.home?.enabled),
        homeRadius: savedSettings.petBehavior?.home?.radius || 'medium',
        customCursorEnabled: Boolean(savedSettings.customCursor?.enabled),
        customCursorFileName: savedSettings.customCursor?.fileName || ''
      }
    })
    return rendererSettings
  })

  ipcMainService.on(IPC.SETTINGS_PREVIEW_SCALE, (_event, scale) => {
    petService.previewSettings({ scale })
    sendToPetWindow(getPetWindow, IPC.SETTINGS_CHANGED, { scale })
  })

  ipcMainService.on(IPC.SETTINGS_CLOSE, (_event) => {
    const win = browserWindowService.fromWebContents(_event.sender)
    if (win) {
      const petWindow = getPetWindow()
      if (petWindow && petWindow.settingsWindow === win) {
        petWindow.settingsWindow = null
      }
      win.close()
    }
  })
}

module.exports = {
  registerSettingsIpc
}
