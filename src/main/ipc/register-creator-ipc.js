const { IPC } = require('../../shared/ipc-channels')

const registerCreatorIpc = ({
  ipcMainService,
  showOpenDialogForEvent = async () => ({ canceled: true, filePaths: [] }),
  creatorWorkflowService = null
}) => {
  const requireService = () => {
    if (!creatorWorkflowService) throw new Error('Creator workflow service is not available')
    return creatorWorkflowService
  }

  ipcMainService.handle(IPC.CREATOR_GET_STATE, () => requireService().getState())
  ipcMainService.handle(IPC.CREATOR_PICK_REFERENCE_IMAGE, async (event) => {
    const selected = await showOpenDialogForEvent(event, {
      title: '选择 Creator 参考图片',
      properties: ['openFile'],
      filters: [{ name: 'Reference Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    })
    if (selected.canceled || !selected.filePaths[0]) {
      return {
        ok: true,
        canceled: true,
        referenceToken: '',
        fileName: ''
      }
    }
    const approved = requireService().approveReferenceSourcePath(selected.filePaths[0])
    return {
      ok: true,
      canceled: false,
      referenceToken: approved.referenceToken,
      fileName: approved.fileName
    }
  })
  ipcMainService.handle(IPC.CREATOR_BIND_REFERENCE, (_event, payload) => requireService().bindReference({
    targetType: payload?.targetType,
    targetId: payload?.targetId,
    referenceToken: payload?.referenceToken
  }))
  ipcMainService.handle(IPC.CREATOR_GENERATE_NEW_CHARACTER, (_event, payload) => requireService().generateNewCharacter({
    characterName: payload?.characterName,
    stylePrompt: payload?.stylePrompt,
    referenceImageToken: payload?.referenceImageToken
  }))
  ipcMainService.handle(IPC.CREATOR_GENERATE_EXISTING_ACTION, (_event, payload) => requireService().generateExistingAction({
    actionName: payload?.actionName,
    motionPrompt: payload?.motionPrompt,
    referenceImageToken: payload?.referenceImageToken
  }))
  ipcMainService.handle(IPC.CREATOR_RETRY_ACTION, (_event, payload) => requireService().retryFullPetAction({
    runId: payload?.runId,
    actionId: payload?.actionId
  }))
  ipcMainService.handle(IPC.CREATOR_RETRY_IDENTITY, (_event, payload) => requireService().retryFullPetIdentity({
    runId: payload?.runId
  }))
  ipcMainService.handle(IPC.CREATOR_IMPORT_AVAILABLE_ACTIONS, (_event, payload) => requireService().importAvailableActions({
    runId: payload?.runId,
    activate: payload?.activate
  }))
  ipcMainService.handle(IPC.CREATOR_GET_LAST_RUN, () => requireService().getLastRun())
}

module.exports = {
  registerCreatorIpc
}
