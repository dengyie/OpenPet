const fs = require('fs')
const path = require('path')

const LEGACY_USER_DATA_DIR_NAME = 'ibot'

const configureUserDataPath = ({ app, legacyDirName = LEGACY_USER_DATA_DIR_NAME } = {}) => {
  if (typeof app?.getPath !== 'function' || typeof app?.setPath !== 'function') {
    throw new Error('Electron app is required')
  }
  const legacyUserDataPath = path.join(app.getPath('appData'), legacyDirName)
  const currentUserDataPath = app.getPath('userData')
  fs.mkdirSync(legacyUserDataPath, { recursive: true })
  if (path.resolve(currentUserDataPath) !== path.resolve(legacyUserDataPath)) {
    app.setPath('userData', legacyUserDataPath)
  }
  return legacyUserDataPath
}

module.exports = { LEGACY_USER_DATA_DIR_NAME, configureUserDataPath }
