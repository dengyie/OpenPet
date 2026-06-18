const focusExistingPetWindow = (petWindow) => {
  if (!petWindow || petWindow.isDestroyed?.()) return
  if (petWindow.isMinimized?.()) petWindow.restore()
  petWindow.focus?.()
}

const configureSingleInstanceLock = ({ app, getPetWindow }) => {
  if (!app?.requestSingleInstanceLock || !app?.quit || !app?.on) {
    throw new Error('Electron app is required')
  }
  if (typeof getPetWindow !== 'function') {
    throw new Error('getPetWindow is required')
  }

  const gotTheLock = app.requestSingleInstanceLock()
  if (!gotTheLock) {
    app.quit()
    return false
  }

  app.on('second-instance', () => {
    focusExistingPetWindow(getPetWindow())
  })
  return true
}

module.exports = {
  configureSingleInstanceLock,
  focusExistingPetWindow
}
