import type {
  ControlCenterApi,
  PluginServiceHealthViewState,
  PluginServiceRuntimeViewState
} from '../../../shared/openpet-contracts'

type CreatorStudioServiceApi = Pick<
  ControlCenterApi,
  'startPluginService' | 'checkPluginServiceHealth'
>

interface EnsureCreatorStudioServiceReadyOptions {
  api: CreatorStudioServiceApi
  pluginId: string
  serviceId: string
  serviceStatus: string
  onProgress?: (message: string) => void
  onRuntime?: (runtime: PluginServiceRuntimeViewState) => void
  maxHealthAttempts?: number
  healthRetryDelayMs?: number
  delay?: (delayMs: number) => Promise<void>
}

interface CreatorStudioServiceReadiness {
  started: boolean
  runtime: PluginServiceRuntimeViewState
  health: PluginServiceHealthViewState
}

const wait = (delayMs: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, Math.max(0, delayMs))
})

const messageFromUnknown = (value: unknown) => (
  value instanceof Error ? value.message : String(value || '').trim()
)

export const ensureCreatorStudioServiceReady = async ({
  api,
  pluginId,
  serviceId,
  serviceStatus,
  onProgress = () => {},
  onRuntime = () => {},
  maxHealthAttempts = 6,
  healthRetryDelayMs = 250,
  delay = wait
}: EnsureCreatorStudioServiceReadyOptions): Promise<CreatorStudioServiceReadiness> => {
  const normalizedStatus = String(serviceStatus || 'stopped').trim().toLowerCase()
  if (normalizedStatus === 'stopping') {
    throw new Error('Creator Studio Service 正在停止，请稍后重试')
  }

  let started = false
  let runtime: PluginServiceRuntimeViewState | null = null
  if (!['running', 'starting'].includes(normalizedStatus)) {
    onProgress('正在启动 Creator Studio Service…')
    const startResult = await api.startPluginService(pluginId, serviceId)
    runtime = startResult.runtime
    started = true
    onRuntime(runtime)
  }

  onProgress(started
    ? 'Creator Studio Service 已启动，正在等待详情服务就绪…'
    : '正在检查 Creator Studio 详情服务…')
  const attempts = Math.max(1, Math.min(12, Number(maxHealthAttempts) || 1))
  let lastHealth: PluginServiceHealthViewState | null = null
  let lastError = ''
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const healthResult = await api.checkPluginServiceHealth(pluginId, serviceId)
      runtime = healthResult.runtime
      lastHealth = healthResult.health
      lastError = healthResult.health.message || ''
      onRuntime(runtime)
      if (healthResult.health.status === 'healthy') {
        return { started, runtime, health: healthResult.health }
      }
    } catch (error) {
      lastError = messageFromUnknown(error)
    }
    if (attempt + 1 < attempts) await delay(healthRetryDelayMs)
  }

  const reason = lastError || lastHealth?.status || '健康检查未通过'
  throw new Error(`Creator Studio Service 启动后未就绪：${reason}`)
}
