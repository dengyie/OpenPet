const fs = require('fs')
const path = require('path')

const LEGACY_USER_DATA_DIR_NAME = 'ibot'

const resolveExplicitUserDataPath = (env = process.env) => {
  const candidate = String(env?.OPENPET_USER_DATA_DIR || '').trim()
  return candidate ? path.resolve(candidate) : ''
}

const configureUserDataPath = ({ app, legacyDirName = LEGACY_USER_DATA_DIR_NAME, env = process.env } = {}) => {
  if (typeof app?.getPath !== 'function' || typeof app?.setPath !== 'function') {
    throw new Error('Electron app is required')
  }
  const explicitUserDataPath = resolveExplicitUserDataPath(env)
  if (explicitUserDataPath) {
    fs.mkdirSync(explicitUserDataPath, { recursive: true })
    const currentUserDataPath = app.getPath('userData')
    if (path.resolve(currentUserDataPath) !== explicitUserDataPath) {
      app.setPath('userData', explicitUserDataPath)
    }
    return explicitUserDataPath
  }
  const legacyUserDataPath = path.join(app.getPath('appData'), legacyDirName)
  const currentUserDataPath = app.getPath('userData')
  fs.mkdirSync(legacyUserDataPath, { recursive: true })
  if (path.resolve(currentUserDataPath) !== path.resolve(legacyUserDataPath)) {
    app.setPath('userData', legacyUserDataPath)
  }
  return legacyUserDataPath
}

module.exports = { LEGACY_USER_DATA_DIR_NAME, configureUserDataPath, resolveExplicitUserDataPath }
