const { contextBridge, ipcRenderer } = require('electron')

const IPC = {
  PET_BUBBLE_CHAT_GET_STATE: 'pet-bubble-chat:get-state',
  PET_BUBBLE_CHAT_HIDE: 'pet-bubble-chat:hide',
  PET_BUBBLE_CHAT_SET_PINNED: 'pet-bubble-chat:set-pinned',
  PET_BUBBLE_CHAT_SET_INTERACTING: 'pet-bubble-chat:set-interacting',
  PET_BUBBLE_CHAT_STATE_CHANGED: 'pet-bubble-chat:state-changed'
}

contextBridge.exposeInMainWorld('petBubbleChatAPI', {
  getState: () => ipcRenderer.invoke(IPC.PET_BUBBLE_CHAT_GET_STATE),
  hide: () => ipcRenderer.send(IPC.PET_BUBBLE_CHAT_HIDE),
  setPinned: (pinned) => ipcRenderer.invoke(IPC.PET_BUBBLE_CHAT_SET_PINNED, { pinned: Boolean(pinned) }),
  setInteracting: (interacting) => ipcRenderer.invoke(IPC.PET_BUBBLE_CHAT_SET_INTERACTING, { interacting: Boolean(interacting) }),
  onStateChanged: (callback) => {
    ipcRenderer.on(IPC.PET_BUBBLE_CHAT_STATE_CHANGED, (_event, state) => callback(state))
  }
})
