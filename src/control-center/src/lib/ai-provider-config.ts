import type {
  AiConfigViewState,
  AiConnectionTestResult,
  ImageGenerationConfigViewState
} from '../../../shared/openpet-contracts'

export const chatProviderPresets = [
  {
    id: 'openai',
    title: 'OpenAI 官方',
    description: '使用官方 OpenAI 聊天接口；API Key 保存在主进程。',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini'
  },
  {
    id: 'local-openai-compatible',
    title: '本地/代理 OpenAI-compatible',
    description: '适合本机 Ollama、局域网网关或反代聊天服务。',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'qwen2.5:7b-instruct'
  }
] as const

export const imageProviderPresets = [
  {
    id: 'openai',
    title: 'OpenAI 官方',
    description: '使用官方 OpenAI 图片接口；API Key 保存在主进程。',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-image-2',
    timeoutMs: 120000,
    maxConcurrentJobs: 1
  },
  {
    id: 'local-openai-compatible',
    title: '本地/代理 OpenAI-compatible',
    description: '适合本机网关、反代或局域网模型服务；本地和云端共用同一套 Provider 配置。',
    baseUrl: 'http://127.0.0.1:8317/v1',
    model: 'gpt-image-2',
    timeoutMs: 120000,
    maxConcurrentJobs: 1
  },
  {
    id: 'generic-gateway-template',
    title: '通用网关模板',
    description: '适合 OneAPI / NewAPI / 其他 OpenAI-compatible 图片网关；保存前按实际网关修改 URL 和 Model。',
    baseUrl: 'https://gateway.example.com/v1',
    model: 'dall-e-3',
    timeoutMs: 120000,
    maxConcurrentJobs: 1
  }
] as const

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

export const formatActiveProviderSummary = (config: AiConfigViewState) => (
  `${formatProviderDisplayName(config.provider)} · ${normalizeProviderBaseUrl(config.baseUrl)} · ${config.model.trim() || '未设置 Model'} · ${config.hasApiKey ? 'API key saved' : 'API key missing'}`
)

export const formatConnectionTestStatus = (result: AiConnectionTestResult) => (
  result.ok
    ? `连接测试通过：${formatProviderDisplayName(result.provider)} · ${result.baseUrl} · ${result.model} · ${result.elapsedMs}ms`
    : `连接测试失败：${formatProviderDisplayName(result.provider)} · ${result.baseUrl} · ${result.model} · ${result.message || result.code || 'unknown'}`
)

export const getDiscoveredModelOptions = ({
  model,
  availableModels
}: {
  model?: string
  availableModels?: string[]
}) => {
  const normalizedCurrent = String(model || '').trim()
  const unique = [...new Set((Array.isArray(availableModels) ? availableModels : [])
    .map((entry) => String(entry || '').trim())
    .filter(Boolean))]
  const values = normalizedCurrent && !unique.includes(normalizedCurrent)
    ? [normalizedCurrent, ...unique]
    : unique
  return values.map((value) => ({ value, label: value }))
}

export const getImageProviderCompatibilityHint = (config: ImageGenerationConfigViewState) => {
  const model = String(config.model || '').trim() || '未设置模型'
  const normalizedModel = model.toLowerCase()
  if (normalizedModel === 'gpt-image-2') {
    return `当前模型 ${model} 走 host 默认图片协议；transparent 背景参数由 host/provider 默认协商，不额外显式下发。`
  }
  if (normalizedModel.includes('dall-e')) {
    return `当前模型 ${model} 通常不暴露 transparent 背景参数；如果网关仍返回不透明结果，需改用支持 alpha 的模型或走宿主侧后处理裁切。`
  }
  if (normalizedModel.includes('flux') || normalizedModel.includes('sdxl') || normalizedModel.includes('stable-diffusion')) {
    return `当前模型 ${model} 走 OpenAI-compatible 图片请求；host 会显式请求 transparent 背景，但很多 FLUX/SDXL 网关仍需要自定义 alpha 或 cutout 流水线。`
  }
  return `当前模型 ${model} 走 OpenAI-compatible 图片请求；host 会显式请求 transparent 背景，但最终兼容性取决于当前网关和模型实现。`
}
