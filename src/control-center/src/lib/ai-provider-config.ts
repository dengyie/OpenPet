import type {
  AiConfigViewState,
  AiConnectionTestResult,
  ImageGenerationConfigViewState
} from '../../../shared/openpet-contracts'

export const normalizeProviderBaseUrl = (value: string) => value.trim().replace(/\/+$/, '')

export const validateProviderConfig = (config: AiConfigViewState): string => {
  if (config.provider !== 'openai-compatible') return '当前只支持 OpenAI compatible provider'
  try {
    const parsed = new URL(config.baseUrl.trim())
    if (!['http:', 'https:'].includes(parsed.protocol)) return 'Base URL 只支持 http 或 https'
    if (parsed.username || parsed.password) return 'Base URL 不能包含用户名或密码，请把凭证放在 API Key 中'
    if (parsed.search || parsed.hash) return 'Base URL 不能包含 query 或 hash，请仅保留 API 根路径'
  } catch (_) {
    return 'Base URL 不是有效 URL'
  }
  if (!config.model.trim()) return 'Model 不能为空'
  return ''
}

export const formatProviderDisplayName = (provider: string) => (
  provider === 'openai-compatible' ? 'OpenAI compatible' : provider
)

export const getProviderConfigChanges = (draft: AiConfigViewState, active: AiConfigViewState) => {
  const changes: string[] = []
  if (draft.enabled !== active.enabled) changes.push('启用聊天')
  if (draft.provider !== active.provider) changes.push('Provider')
  if (normalizeProviderBaseUrl(draft.baseUrl) !== normalizeProviderBaseUrl(active.baseUrl)) changes.push('Base URL')
  if (draft.model.trim() !== active.model.trim()) changes.push('Model')
  if (draft.systemPrompt !== active.systemPrompt) changes.push('System Prompt')
  if (Boolean(draft.memory?.enabled) !== Boolean(active.memory?.enabled)) changes.push('长期记忆')
  return changes
}

export const hasProviderConfigChanges = (draft: AiConfigViewState, active: AiConfigViewState) => (
  getProviderConfigChanges(draft, active).length > 0
)

export const buildProviderConfigSavePayload = (
  config: AiConfigViewState,
  activeConfig: AiConfigViewState
): Partial<AiConfigViewState> => {
  const payload: Partial<AiConfigViewState> = {}

  if (Boolean(config.enabled) !== Boolean(activeConfig.enabled)) {
    payload.enabled = Boolean(config.enabled)
  }
  if (String(config.provider || '') !== String(activeConfig.provider || '')) {
    payload.provider = String(config.provider || '')
  }
  if (normalizeProviderBaseUrl(config.baseUrl || '') !== normalizeProviderBaseUrl(activeConfig.baseUrl || '')) {
    payload.baseUrl = normalizeProviderBaseUrl(config.baseUrl || '')
  }
  if (String(config.model || '').trim() !== String(activeConfig.model || '').trim()) {
    payload.model = String(config.model || '').trim()
  }
  if (String(config.systemPrompt || '') !== String(activeConfig.systemPrompt || '')) {
    payload.systemPrompt = String(config.systemPrompt || '')
  }
  if (Boolean(config.memory?.enabled) !== Boolean(activeConfig.memory?.enabled)) {
    payload.memory = { enabled: Boolean(config.memory?.enabled) }
  }

  return payload
}

export const formatActiveProviderSummary = (config: AiConfigViewState) => (
  `${formatProviderDisplayName(config.provider)} · ${normalizeProviderBaseUrl(config.baseUrl)} · ${config.model.trim() || '未设置 Model'} · ${config.hasApiKey ? 'API key saved' : 'API key missing'}`
)

export const formatConnectionTestStatus = (result: AiConnectionTestResult) => (
  result.ok
    ? `连接测试通过：${formatProviderDisplayName(result.provider)} · ${result.baseUrl} · ${result.model} · ${result.elapsedMs}ms`
    : `连接测试失败：${formatProviderDisplayName(result.provider)} · ${result.baseUrl} · ${result.model} · ${result.message || result.code || 'unknown'}`
)

export const validateImageProviderConfig = (config: ImageGenerationConfigViewState): string => {
  const baseUrl = String(config.baseUrl || '').trim()
  const model = String(config.model || '').trim()
  if (!baseUrl) return '图片 Base URL 不能为空'
  try {
    const parsed = new URL(baseUrl)
    if (!['http:', 'https:'].includes(parsed.protocol)) return '图片 Base URL 只支持 http 或 https'
    if (parsed.username || parsed.password) return '图片 Base URL 不能包含用户名或密码，请把凭证放在图片 API Key 中'
    if (parsed.search || parsed.hash) return '图片 Base URL 不能包含 query 或 hash，请仅保留 API 根路径'
  } catch (_) {
    return '图片 Base URL 不是有效 URL'
  }
  if (!model) return '图片 Model 不能为空'
  if (!Number.isFinite(Number(config.timeoutMs)) || Number(config.timeoutMs) < 1000) return '图片 Timeout 至少为 1000ms'
  if (!Number.isFinite(Number(config.maxConcurrentJobs)) || Number(config.maxConcurrentJobs) < 1) return '图片最大并发至少为 1'
  return ''
}

export const getImageGenerationConfigChanges = (
  draft: ImageGenerationConfigViewState,
  active: ImageGenerationConfigViewState
) => {
  const changes: string[] = []
  if (draft.provider !== active.provider) changes.push('Provider')
  if (normalizeProviderBaseUrl(draft.baseUrl) !== normalizeProviderBaseUrl(active.baseUrl)) changes.push('图片 Base URL')
  if (draft.model.trim() !== active.model.trim()) changes.push('图片 Model')
  if (String(draft.organization || '').trim() !== String(active.organization || '').trim()) changes.push('Organization')
  if (String(draft.project || '').trim() !== String(active.project || '').trim()) changes.push('Project')
  if (Number(draft.timeoutMs || 0) !== Number(active.timeoutMs || 0)) changes.push('图片 Timeout')
  if (Number(draft.maxConcurrentJobs || 0) !== Number(active.maxConcurrentJobs || 0)) changes.push('图片最大并发')
  return changes
}

export const hasImageGenerationConfigChanges = (
  draft: ImageGenerationConfigViewState,
  active: ImageGenerationConfigViewState
) => (
  getImageGenerationConfigChanges(draft, active).length > 0
)

export const buildImageGenerationConfigSavePayload = (
  config: ImageGenerationConfigViewState,
  activeConfig: ImageGenerationConfigViewState
): Partial<ImageGenerationConfigViewState> => {
  const payload: Partial<ImageGenerationConfigViewState> = {}

  if (String(config.provider || '') !== String(activeConfig.provider || '')) {
    payload.provider = String(config.provider || '')
  }
  if (normalizeProviderBaseUrl(config.baseUrl || '') !== normalizeProviderBaseUrl(activeConfig.baseUrl || '')) {
    payload.baseUrl = normalizeProviderBaseUrl(config.baseUrl || '')
  }
  if (String(config.model || '').trim() !== String(activeConfig.model || '').trim()) {
    payload.model = String(config.model || '').trim()
  }
  if (String(config.organization || '').trim() !== String(activeConfig.organization || '').trim()) {
    payload.organization = String(config.organization || '').trim()
  }
  if (String(config.project || '').trim() !== String(activeConfig.project || '').trim()) {
    payload.project = String(config.project || '').trim()
  }
  if (Number(config.timeoutMs || 0) !== Number(activeConfig.timeoutMs || 0)) {
    payload.timeoutMs = Number(config.timeoutMs || 0)
  }
  if (Number(config.maxConcurrentJobs || 0) !== Number(activeConfig.maxConcurrentJobs || 0)) {
    payload.maxConcurrentJobs = Number(config.maxConcurrentJobs || 0)
  }

  return payload
}
