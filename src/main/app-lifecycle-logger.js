const safeRecordAppLog = (appLogService, entry) => {
  try {
    appLogService?.record?.(entry)
  } catch (_) {
    // Lifecycle logging must never block startup or shutdown.
  }
}

const registerAppLifecycleLogs = ({ app, appLogService, pid = process.pid }) => {
  safeRecordAppLog(appLogService, {
    scope: 'app',
    level: 'info',
    actor: 'system',
    event: 'app.ready',
    message: 'OpenPet app services initialized',
    details: {
      pid,
      logPath: appLogService?.logPath || ''
    }
  })

  app.on('before-quit', () => {
    safeRecordAppLog(appLogService, {
      scope: 'app',
      level: 'info',
      actor: 'system',
      event: 'app.before-quit',
      message: 'OpenPet app is preparing to quit',
      details: { pid }
    })
  })

  app.on('will-quit', () => {
    safeRecordAppLog(appLogService, {
      scope: 'app',
      level: 'info',
      actor: 'system',
      event: 'app.will-quit',
      message: 'OpenPet app will quit',
      details: { pid }
    })
  })
}

module.exports = { registerAppLifecycleLogs, safeRecordAppLog }
