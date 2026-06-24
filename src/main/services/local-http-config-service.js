const { createServiceStatusView } = require('../control-center-adapters')
const { createLocalHttpToken } = require('./local-http-service')

const normalizeLocalHttpConfig = (currentConfig = {}, nextConfig = {}, { createToken = createLocalHttpToken } = {}) => {
  const enabled = Boolean(nextConfig.enabled)
  const token = nextConfig.token || currentConfig.token || (enabled ? createToken() : '')
  return {
    ...currentConfig,
    ...nextConfig,
    host: '127.0.0.1',
    port: Number(nextConfig.port ?? currentConfig.port ?? 0),
    enabled,
    token
  }
}

const createLocalHttpConfigService = ({
  petService,
  localHttpService,
  createToken = createLocalHttpToken,
  createStatusView = createServiceStatusView
}) => {
  if (!petService) throw new Error('petService is required')
  if (!localHttpService) throw new Error('localHttpService is required')

  const getStatus = () => createStatusView(
    petService.getSettings().localHttp,
    localHttpService.getStatus()
  )

  const saveConfig = async (config) => {
    const currentSettings = petService.getSettings()
    const nextConfig = normalizeLocalHttpConfig(currentSettings.localHttp, config, { createToken })
    const runtime = nextConfig.enabled
      ? await localHttpService.start(nextConfig)
      : await localHttpService.stop()
    const savedSettings = petService.saveSettings({ ...currentSettings, localHttp: nextConfig })
    return createStatusView(savedSettings.localHttp, localHttpService.getStatus() || runtime)
  }

  const rotateToken = async () => {
    const currentSettings = petService.getSettings()
    const nextConfig = normalizeLocalHttpConfig(currentSettings.localHttp, {
      ...currentSettings.localHttp,
      token: createToken()
    }, { createToken })
    const runtime = nextConfig.enabled
      ? await localHttpService.start(nextConfig)
      : localHttpService.getStatus()
    const savedSettings = petService.saveSettings({ ...currentSettings, localHttp: nextConfig })
    return createStatusView(savedSettings.localHttp, localHttpService.getStatus() || runtime)
  }

  const revokeMcpSessions = () => {
    const mcp = localHttpService.revokeMcpSessions()
    return createStatusView(petService.getSettings().localHttp, { ...localHttpService.getStatus(), mcp })
  }

  return {
    getStatus,
    revokeMcpSessions,
    rotateToken,
    saveConfig
  }
}

module.exports = {
  createLocalHttpConfigService,
  normalizeLocalHttpConfig
}
