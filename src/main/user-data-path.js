const fs = require('fs')
const path = require('path')
const {
  AUTOMATION_USER_DATA_DIR_ENV,
  getAutomationDesktopProfile
} = require('./runtime/automation-desktop-mode')

const LEGACY_USER_DATA_DIR_NAME = 'ibot'

const configureUserDataPath = ({ app, legacyDirName = LEGACY_USER_DATA_DIR_NAME } = {}) => {
  if (typeof app?.getPath !== 'function' || typeof app?.setPath !== 'function') {
    throw new Error('Electron app is required')
  }
  const automationProfile = getAutomationDesktopProfile({
    env: process.env,
    appDataPath: app.getPath('appData')
  })
  if (automationProfile.enabled) {
    const automationUserDataPath = automationProfile.userDataPath
    fs.mkdirSync(automationUserDataPath, { recursive: true })
    if (path.resolve(app.getPath('userData')) !== path.resolve(automationUserDataPath)) {
      app.setPath('userData', automationUserDataPath)
    }
    process.env[AUTOMATION_USER_DATA_DIR_ENV] = automationUserDataPath
    return automationUserDataPath
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
