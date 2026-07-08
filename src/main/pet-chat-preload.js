const { contextBridge, ipcRenderer } = require('electron')

const IPC = {
  PET_CHAT_GET_STATE: 'pet-chat:get-state',
  PET_CHAT_HIDE: 'pet-chat:hide',
  PET_CHAT_SET_ALWAYS_ON_TOP: 'pet-chat:set-always-on-top',
  PET_CHAT_OPEN_SETTINGS: 'pet-chat:open-settings',
  PET_CHAT_SEND_MESSAGE: 'pet-chat:send-message',
  PET_CHAT_CANCEL_MESSAGE: 'pet-chat:cancel-message',
  PET_CHAT_STATE_CHANGED: 'pet-chat:state-changed',
  PET_BUBBLE_CHAT_OPEN: 'pet-bubble-chat:open',
  PET_BUBBLE_CHAT_SET_PINNED: 'pet-bubble-chat:set-pinned'
}

contextBridge.exposeInMainWorld('petChatAPI', {
  getState: () => ipcRenderer.invoke(IPC.PET_CHAT_GET_STATE),
  hide: () => ipcRenderer.send(IPC.PET_CHAT_HIDE),
  setAlwaysOnTop: (alwaysOnTop) => ipcRenderer.invoke(IPC.PET_CHAT_SET_ALWAYS_ON_TOP, { alwaysOnTop: Boolean(alwaysOnTop) }),
  openBubbleChat: () => ipcRenderer.invoke(IPC.PET_BUBBLE_CHAT_OPEN),
  setBubblePinned: async (pinned) => {
    await ipcRenderer.invoke(IPC.PET_BUBBLE_CHAT_SET_PINNED, { pinned: Boolean(pinned) })
    return ipcRenderer.invoke(IPC.PET_CHAT_GET_STATE)
  },
  openSettings: () => ipcRenderer.send(IPC.PET_CHAT_OPEN_SETTINGS),
  sendMessage: (payload) => ipcRenderer.invoke(IPC.PET_CHAT_SEND_MESSAGE, payload),
  cancelMessage: (payload = {}) => ipcRenderer.invoke(IPC.PET_CHAT_CANCEL_MESSAGE, {
    requestId: typeof payload.requestId === 'string' ? payload.requestId : ''
  }),
  onStateChanged: (callback) => {
    ipcRenderer.on(IPC.PET_CHAT_STATE_CHANGED, (_event, state) => callback(state))
  }
})
