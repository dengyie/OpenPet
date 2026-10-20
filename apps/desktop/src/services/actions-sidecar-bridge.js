"use strict"

const crypto = require("node:crypto")

function createActionsSidecarBridge({
  actionService,
  actionImportService,
  petService,
  dialog,
  getPetWindow = () => null,
  reloadAndSendAnimations = () => {},
  refreshTriggerRuleRuntime = () => {},
  getTriggerRuntimeDiagnostics = () => ({ currentState: { actionId: "" }, decisions: [] }),
  selectionTtlMs = 10 * 60 * 1000,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
} = {}) {
  if (!actionService || !actionImportService || !petService) throw new TypeError("Actions Shell authority services are required")

  const selections = new Map()
  const viewState = (animations = null) => ({
    ...(animations || petService.getPreviewAnimations()),
    triggerRuntimeDiagnostics: getTriggerRuntimeDiagnostics(),
  })
  const selectionId = () => `action-selection:${crypto.randomUUID()}`
  const deleteSelection = (id) => {
    const selection = selections.get(id)
    if (!selection) return false
    clearTimeoutImpl(selection.timer)
    selections.delete(id)
    return true
  }
  const rememberSelection = (id, sourceDir) => {
    const timer = setTimeoutImpl(() => deleteSelection(id), selectionTtlMs)
    timer?.unref?.()
    selections.set(id, { sourceDir, timer })
  }

  const inspectFrames = async ({ actionId, path } = {}) => {
    let sourceDir = path
    if (!sourceDir) {
      if (typeof dialog?.showOpenDialog !== "function") throw new Error("Shell dialog unavailable")
      const selected = await dialog.showOpenDialog({ title: "选择动作帧文件夹", properties: ["openDirectory"] })
      if (selected?.canceled || !selected?.filePaths?.[0]) return { canceled: true }
      sourceDir = selected.filePaths[0]
    }
    const result = await actionImportService.inspectActionFrames({ sourceDir, actionId })
    const id = selectionId()
    rememberSelection(id, sourceDir)
    return { canceled: false, selectionId: id, ...result }
  }

  const resolveSelection = (id) => {
    if (typeof id !== "string" || !selections.has(id)) throw new Error("Action frame selection does not exist")
    return selections.get(id)
  }

  const handle = async ({ operation, payload = {} } = {}) => {
    switch (operation) {
      case "get":
        return viewState()
      case "save-config": {
		if (payload.triggerProposal) {
			const triggerProposal = actionService.acceptTriggerProposal(payload.triggerProposal)
			const animations = triggerProposal.applied
				? reloadAndSendAnimations(getPetWindow, petService)
				: viewState()
			if (triggerProposal.applied || triggerProposal.triggerRule) refreshTriggerRuleRuntime()
			return { animations: viewState(animations), triggerProposal }
		}
        const animations = actionService.applyCreatorActionMutation(payload)
        const reloaded = reloadAndSendAnimations(getPetWindow, petService)
        refreshTriggerRuleRuntime()
        return { animations: viewState(reloaded || animations) }
      }
      case "preview-proposal":
        return actionService.previewTriggerProposal(payload)
      case "submit-proposal":
        {
          const result = actionService.submitTriggerProposal(payload)
          return { ...result, animations: viewState(result.animations) }
        }
      case "accept-proposal": {
        const result = actionService.acceptTriggerProposalItem(payload.proposalId)
        const animations = result.triggerProposal?.applied
          ? reloadAndSendAnimations(getPetWindow, petService)
          : result.animations
        if (result.triggerProposal?.applied || result.triggerProposal?.triggerRule) refreshTriggerRuleRuntime()
        return { ...result, animations: viewState(animations) }
      }
      case "reject-proposal":
        {
          const result = actionService.rejectTriggerProposalItem(payload.proposalId, payload.reason || "")
          return { ...result, animations: viewState(result.animations) }
        }
      case "update-rule": {
        const result = actionService.updateTriggerRule(payload.ruleId, {
          ...(payload.status !== undefined ? { status: payload.status } : {}),
          ...(payload.ruleSpec !== undefined ? { ruleSpec: payload.ruleSpec } : {}),
        })
        refreshTriggerRuleRuntime()
        return { ...result, animations: viewState(result.animations) }
      }
      case "delete-rule": {
        const result = actionService.deleteTriggerRule(payload.ruleId)
        refreshTriggerRuleRuntime()
        return { ...result, animations: viewState(result.animations) }
      }
      case "inspect-frames":
        return inspectFrames(payload)
      case "reinspect-frames": {
        const selected = resolveSelection(payload.selectionId)
        const result = await actionImportService.inspectActionFrames({ sourceDir: selected.sourceDir, actionId: payload.actionId })
        return { canceled: false, selectionId: payload.selectionId, ...result }
      }
      case "clear-selection":
        deleteSelection(payload.selectionId)
        return { ok: true }
      case "import-frames": {
        const selected = payload.selectionId ? resolveSelection(payload.selectionId) : { sourceDir: payload.path }
        if (!selected?.sourceDir) throw new Error("Action frame selection is required")
        let result
        try {
          result = await actionImportService.importActionFrames({
            sourceDir: selected.sourceDir, actionId: payload.actionId, label: payload.label,
          })
        } finally {
          if (payload.selectionId) deleteSelection(payload.selectionId)
        }
        const animations = reloadAndSendAnimations(getPetWindow, petService)
        refreshTriggerRuleRuntime()
        return { ok: true, canceled: false, result, animations: viewState(animations) }
      }
      case "delete-action": {
        const result = await actionImportService.deleteAction(payload.actionId)
        const animations = reloadAndSendAnimations(getPetWindow, petService)
        refreshTriggerRuleRuntime()
        return { animations: viewState(animations), result }
      }
      default:
        throw new Error(`Unsupported Actions bridge operation: ${String(operation || "")}`)
    }
  }

  return { handle }
}

module.exports = { createActionsSidecarBridge }
