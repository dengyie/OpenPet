import type { ReactNode } from 'react'
import type {
  AiBehaviorConfig,
  AiBehaviorResult,
  AiConfigViewState,
  AiConnectionTestResult,
  AiTalkTraceDiagnosticsFilters,
  ImageGenerationHealthCheckResult,
  AiMemoryItemViewState,
  AiMemoryProfileViewState,
  AiPersonaDraftViewState,
  AiPersonaProfileViewState,
  AiTalkTraceSummaryViewState,
  ChatMessage,
  ImageGenerationConfigViewState,
  ProviderModelDiscoveryResult,
  PetChatStateViewState
} from '../../../shared/openpet-contracts'
import { Toggle } from '../components/Toggle'
import { defaultImageGenerationConfig } from '../lib/defaults'

type ImageProviderPreset = {
  id: string
  title: string
  description: string
  baseUrl: string
  model?: string
  timeoutMs: number
  maxConcurrentJobs: number
}

type ChatProviderPreset = {
  id: string
  title: string
  description: string
  baseUrl: string
  model?: string
}

type ProviderFamily = 'openai' | 'openrouter' | 'together' | 'lm-studio' | 'vllm' | 'local-gateway' | 'generic-openai-compatible'

const imageProviderPresets: readonly ImageProviderPreset[] = [
  {
    id: 'openai',
    title: 'OpenAI 官方',
    description: '官方图片 endpoint 模板；保存后请用健康检查确认当前账号和模型权限。',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-image-2',
    timeoutMs: 120000,
    maxConcurrentJobs: 1
  },
  {
    id: 'together',
    title: 'Together',
    description: '常见云端图片 endpoint 模板；未包含当前 OpenPet smoke 证据，请按 Together 已开通模型调整并健康检查。',
    baseUrl: 'https://api.together.xyz/v1',
    timeoutMs: 120000,
    maxConcurrentJobs: 1
  },
  {
    id: 'openrouter',
    title: 'OpenRouter',
    description: '常见云端图片 endpoint 模板；未包含当前 OpenPet smoke 证据，请按 OpenRouter 实际可用模型调整并健康检查。',
    baseUrl: 'https://openrouter.ai/api/v1',
    timeoutMs: 120000,
    maxConcurrentJobs: 1
  },
  {
    id: 'local-openai-compatible',
    title: '本地/代理 OpenAI-compatible',
    description: '本机、反代或局域网 endpoint 模板；保存后请用健康检查确认实际 /models 和图片接口。',
    baseUrl: 'http://127.0.0.1:8317/v1',
    model: 'gpt-image-2',
    timeoutMs: 120000,
    maxConcurrentJobs: 1
  },
  {
    id: 'openpet-8317-gateway',
    title: 'OpenPet 8317 网关',
    description: '当前开发网关已有归档 Creator Studio smoke：gpt-image-2 路径可跑通；仍不代表图片质量批准。',
    baseUrl: 'http://127.0.0.1:8317/v1',
    model: 'gpt-image-2',
    timeoutMs: 120000,
    maxConcurrentJobs: 1
  }
] as const

const chatProviderPresets: readonly ChatProviderPreset[] = [
  {
    id: 'openai',
    title: 'OpenAI 官方',
    description: '官方聊天 endpoint 模板；保存后请测试当前账号、模型和网关可达性。',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini'
  },
  {
    id: 'lm-studio',
    title: 'LM Studio',
    description: '本地 endpoint 模板；未包含当前 OpenPet smoke 证据，请按已加载模型调整并测试。',
    baseUrl: 'http://127.0.0.1:1234/v1'
  },
  {
    id: 'vllm',
    title: 'vLLM',
    description: '自托管 endpoint 模板；未包含当前 OpenPet smoke 证据，请按部署模型调整并测试。',
    baseUrl: 'http://127.0.0.1:8000/v1'
  },
  {
    id: 'openrouter',
    title: 'OpenRouter',
    description: '常见云端聚合 endpoint 模板；未包含当前 OpenPet smoke 证据，请按路由模型调整并测试。',
    baseUrl: 'https://openrouter.ai/api/v1'
  },
  {
    id: 'together',
    title: 'Together',
    description: '常见云端推理 endpoint 模板；未包含当前 OpenPet smoke 证据，请按 Together 模型列表调整并测试。',
    baseUrl: 'https://api.together.xyz/v1'
  },
  {
    id: 'local-openai-compatible',
    title: '本地/代理 OpenAI-compatible',
    description: '本机、反代或局域网 endpoint 模板；保存后请测试实际 /models 和聊天接口。',
    baseUrl: 'http://127.0.0.1:8317/v1',
    model: 'gpt-4o-mini'
  },
  {
    id: 'openpet-8317-gateway',
    title: 'OpenPet 8317 网关',
    description: '当前开发网关已有归档 AI smoke：/models 发现 gpt-5.5，聊天可达；只填草稿不覆盖密钥。',
    baseUrl: 'http://127.0.0.1:8317/v1',
    model: 'gpt-5.5'
  }
] as const

const detectProviderFamily = (baseUrl: string): ProviderFamily => {
  const normalized = String(baseUrl || '').trim().toLowerCase()
  if (normalized.includes('api.openai.com')) return 'openai'
  if (normalized.includes('openrouter.ai')) return 'openrouter'
  if (normalized.includes('api.together.xyz')) return 'together'
  if (normalized.includes('127.0.0.1:1234') || normalized.includes('localhost:1234')) return 'lm-studio'
  if (normalized.includes('127.0.0.1:8000') || normalized.includes('localhost:8000')) return 'vllm'
  if (normalized.includes('127.0.0.1:8317') || normalized.includes('localhost:8317')) return 'local-gateway'
  return 'generic-openai-compatible'
}

const describeImageModelCompatibility = (baseUrl: string, model: string) => {
  const normalizedModel = String(model || '').trim()
  const providerFamily = detectProviderFamily(baseUrl)
  if (!normalizedModel) {
    return {
      title: '图片模型兼容提示',
      summary: '填写图片 Model 后，这里会显示透明背景请求的兼容提示。'
    }
  }
  if (normalizedModel === 'gpt-image-2') {
    const familyPrefix = providerFamily === 'openai'
      ? 'OpenAI 官方'
      : providerFamily === 'local-gateway'
        ? '当前本地/代理网关'
        : '当前 Provider'
    return {
      title: `${normalizedModel} 透明背景模式`,
      summary: `${familyPrefix} 使用 ${normalizedModel} 时，Creator Studio 不会强制发送 background 参数；透明背景能力由当前 provider 的原生行为决定。`
    }
  }
  if (providerFamily === 'openrouter') {
    return {
      title: `${normalizedModel} OpenRouter 图片兼容模式`,
      summary: 'OpenPet 会按 OpenAI-compatible 图片请求发送 background 和 b64_json；请确认当前 OpenRouter 路由已映射到支持透明背景和该参数形状的图片模型。'
    }
  }
  if (providerFamily === 'together') {
    return {
      title: `${normalizedModel} Together 图片兼容模式`,
      summary: 'OpenPet 会按 OpenAI-compatible 图片请求发送 background 和 b64_json；请确认 Together 侧当前模型支持透明背景参数和返回格式。'
    }
  }
  if (providerFamily === 'local-gateway' || providerFamily === 'lm-studio' || providerFamily === 'vllm') {
    return {
      title: `${normalizedModel} 本地网关图片兼容模式`,
      summary: 'OpenPet 会按 OpenAI-compatible 图片请求发送 background=transparent 或 white，并附带 b64_json 输出；请确认当前本地网关完整支持 images/generations 与透明背景参数。'
    }
  }
  return {
    title: `${normalizedModel} OpenAI-compatible 透明背景模式`,
    summary: 'Creator Studio 会按 OpenAI-compatible 方式发送 background=transparent 或 white，并附带 b64_json 输出；请确认当前模型支持 transparent 背景参数。'
  }
}

const describeChatModelCompatibility = (baseUrl: string, model: string) => {
  const normalizedModel = String(model || '').trim()
  const providerFamily = detectProviderFamily(baseUrl)
  if (!normalizedModel) {
    return {
      title: '聊天模型兼容提示',
      summary: '填写聊天 Model 后，这里会显示当前 OpenAI-compatible 聊天接口的兼容提示。'
    }
  }
  if (normalizedModel === 'gpt-4o-mini') {
    const familyPrefix = providerFamily === 'openai' ? 'OpenAI 官方' : '当前 Provider'
    return {
      title: `${normalizedModel} OpenAI 官方兼容模式`,
      summary: `${familyPrefix} 下默认按 OpenAI chat/completions 兼容请求发送，适合作为基础联通性测试模型。`
    }
  }
  if (providerFamily === 'openrouter') {
    return {
      title: `${normalizedModel} OpenRouter 聊天兼容模式`,
      summary: 'OpenPet 会按 OpenAI-compatible chat/completions 请求发送消息；请确认当前 OpenRouter 路由已映射到该聊天模型，并检查额外 provider 选项是否仍需在网关侧配置。'
    }
  }
  if (providerFamily === 'together') {
    return {
      title: `${normalizedModel} Together 聊天兼容模式`,
      summary: 'OpenPet 会按 OpenAI-compatible chat/completions 请求发送消息；请确认 Together 当前模型支持标准消息字段和返回结构。'
    }
  }
  if (providerFamily === 'lm-studio') {
    return {
      title: `${normalizedModel} LM Studio 聊天兼容模式`,
      summary: 'OpenPet 会按本地 OpenAI-compatible chat/completions 请求发送消息；请先在 LM Studio 打开本地服务并确认当前模型已加载。'
    }
  }
  if (providerFamily === 'vllm') {
    return {
      title: `${normalizedModel} vLLM 聊天兼容模式`,
      summary: 'OpenPet 会按 OpenAI-compatible chat/completions 请求发送消息；请确认当前 vLLM 服务已暴露对应模型并兼容标准消息字段。'
    }
  }
  if (providerFamily === 'local-gateway') {
    return {
      title: `${normalizedModel} 本地网关聊天兼容模式`,
      summary: 'OpenPet 会按 OpenAI-compatible chat/completions 请求发送消息；请确认当前本地或代理网关已把该模型名正确路由到后端提供者。'
    }
  }
  return {
    title: `${normalizedModel} OpenAI-compatible 聊天模式`,
    summary: 'OpenPet 会按 OpenAI-compatible chat/completions 方式发送 system/user 消息、可选 tools 和 JSON body；请确认当前网关对该模型的字段兼容性。'
  }
}

const renderImageModelDiscovery = (
  result: ImageGenerationHealthCheckResult | null,
  currentModel: string,
  hasUnsavedDraft: boolean
) => {
  const normalizedCurrentModel = String(currentModel || '').trim()
  if (!result) {
    return (
      <div className="provider-feedback" data-testid="image-model-discovery">
        <strong>模型列表探测</strong>
        <span>运行“检查图片健康”后，这里会显示 /models 探测结果。</span>
      </div>
    )
  }

  const discoveredModels = Array.isArray(result.availableModels) ? result.availableModels : []
  if (result.modelsProbe === 'ok') {
    const currentModelIncluded = normalizedCurrentModel ? discoveredModels.includes(normalizedCurrentModel) : false
    return (
      <div className={`provider-feedback ${result.ok ? 'ok' : ''}`} data-testid="image-model-discovery">
        <strong>模型列表探测成功</strong>
        {hasUnsavedDraft ? <span>当前有未保存的图片草稿；下面的模型列表结果仍对应已保存配置，保存后请重新检查图片健康。</span> : null}
        <span>共发现 {discoveredModels.length} 个模型。</span>
        <span>{hasUnsavedDraft ? '当前草稿模型是否在列表中仍未重新验证' : (currentModelIncluded ? '已包含当前模型' : '当前保存的图片 Model 未出现在探测列表中')}</span>
        {discoveredModels.length ? (
          <div className="model-chip-list">
            {discoveredModels.map((modelName) => (
              <code key={modelName} className="model-chip">{modelName}</code>
            ))}
          </div>
        ) : (
          <span>Provider 可达，但没有返回模型列表内容。</span>
        )}
      </div>
    )
  }

  if (result.modelsProbe === 'unavailable') {
    return (
      <div className="provider-feedback" data-testid="image-model-discovery">
        <strong>模型列表探测不可用</strong>
        {hasUnsavedDraft ? <span>当前有未保存的图片草稿；下面的探测状态仍对应已保存配置，保存后请重新检查图片健康。</span> : null}
        <span>当前 Provider 可达，但没有开放 /models；请手动确认模型名称。</span>
      </div>
    )
  }

  return (
    <div className={`provider-feedback ${result.ok ? 'ok' : 'error'}`} data-testid="image-model-discovery">
      <strong>模型列表探测未返回结果</strong>
      {hasUnsavedDraft ? <span>当前有未保存的图片草稿；下面的探测状态仍对应已保存配置。</span> : null}
      <span>{result.message || '本次健康检查没有拿到模型列表。'}</span>
    </div>
  )
}

const renderImageUsageSummary = (result: ImageGenerationHealthCheckResult | null, hasUnsavedDraft: boolean) => {
  const estimatedCost = result?.usage?.estimatedCostUsd
  const hasUsage = result != null && result.usage != null && typeof estimatedCost === 'number'

  if (!hasUsage) {
    return (
      <div className="provider-feedback" data-testid="image-usage-summary">
        <strong>使用量摘要</strong>
        <span>运行“检查图片健康”后，这里会显示本次健康检查返回的 usage 摘要（如有）。</span>
      </div>
    )
  }

  const formattedCost = Number.isFinite(estimatedCost) ? estimatedCost.toFixed(2) : '0.00'

  return (
    <div className={`provider-feedback ${result?.ok ? 'ok' : ''}`} data-testid="image-usage-summary">
      <strong>使用量摘要</strong>
      {hasUnsavedDraft ? <span>当前有未保存的图片草稿；下面的 usage 结果仍对应已保存配置，保存后请重新检查图片健康。</span> : null}
      <span>{`当前健康检查返回的 usage.estimatedCostUsd：USD ${formattedCost}`}</span>
      <span>这只是健康检查返回值，不代表完整生成流程的真实计费结算。</span>
    </div>
  )
}

const renderChatModelDiscovery = (
  result: AiConnectionTestResult | null,
  currentModel: string,
  hasUnsavedDraft: boolean
) => {
  const normalizedCurrentModel = String(currentModel || '').trim()
  if (!result) {
    return (
      <div className="provider-feedback" data-testid="chat-model-discovery">
        <strong>模型列表探测</strong>
        <span>运行“测试已保存配置”后，这里会显示聊天 Provider 的 /models 探测结果。</span>
      </div>
    )
  }

  const discoveredModels = Array.isArray(result.availableModels) ? result.availableModels : []
  if (result.modelsProbe === 'ok') {
    const currentModelIncluded = normalizedCurrentModel ? discoveredModels.includes(normalizedCurrentModel) : false
    return (
      <div className={`provider-feedback ${result.ok ? 'ok' : ''}`} data-testid="chat-model-discovery">
        <strong>模型列表探测成功</strong>
        {hasUnsavedDraft ? <span>当前有未保存的聊天草稿；下面的模型列表结果仍对应已保存配置，保存后请重新测试已保存配置。</span> : null}
        <span>共发现 {discoveredModels.length} 个模型。</span>
        <span>{hasUnsavedDraft ? '当前草稿模型是否在列表中仍未重新验证' : (currentModelIncluded ? '已包含当前模型' : '当前保存的聊天 Model 未出现在探测列表中')}</span>
        {discoveredModels.length ? (
          <div className="model-chip-list">
            {discoveredModels.map((modelName) => (
              <code key={modelName} className="model-chip">{modelName}</code>
            ))}
          </div>
        ) : (
          <span>Provider 可达，但没有返回模型列表内容。</span>
        )}
      </div>
    )
  }

  if (result.modelsProbe === 'unavailable') {
    return (
      <div className="provider-feedback" data-testid="chat-model-discovery">
        <strong>模型列表探测不可用</strong>
        {hasUnsavedDraft ? <span>当前有未保存的聊天草稿；下面的探测状态仍对应已保存配置，保存后请重新测试已保存配置。</span> : null}
        <span>当前 Provider 可达，但没有开放 /models；请手动确认模型名称。</span>
      </div>
    )
  }

  return (
    <div className={`provider-feedback ${result.ok ? 'ok' : 'error'}`} data-testid="chat-model-discovery">
      <strong>模型列表探测未返回结果</strong>
      {hasUnsavedDraft ? <span>当前有未保存的聊天草稿；下面的探测状态仍对应已保存配置。</span> : null}
      <span>{result.message || '本次连接测试没有拿到模型列表。'}</span>
    </div>
  )
}

const CollapsibleAiSection = ({
  title,
  note,
  defaultOpen = false,
  children
}: {
  title: string
  note: string
  defaultOpen?: boolean
  children: ReactNode
}) => (
  <details className="ai-section" open={defaultOpen}>
    <summary className="ai-section-summary">
      <div>
        <h2>{title}</h2>
        <p>{note}</p>
      </div>
      <span className="ai-section-caret" aria-hidden="true">⌄</span>
    </summary>
    <div className="ai-section-body">
      {children}
    </div>
  </details>
)

const formatMemoryScore = (value: number) => `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`

const MemoryList = ({
  title,
  memories,
  emptyText,
  saving,
  onDeleteMemory
}: {
  title: string
  memories: AiMemoryItemViewState[]
  emptyText: string
  saving: boolean
  onDeleteMemory: (memoryId: string) => void | Promise<void>
}) => (
  <div className="memory-column">
    <div className="memory-column-header">
      <strong>{title}</strong>
      <span>{memories.length} 条</span>
    </div>
    <div className="memory-list">
      {memories.length === 0 ? (
        <div className="empty-chat">{emptyText}</div>
      ) : memories.map((memory) => (
        <article className="memory-row" key={memory.id} data-testid={`ai-memory-${memory.id}`}>
          <div className="memory-row-main">
            <p>{memory.text}</p>
            <div className="memory-meta">
              <span>importance {formatMemoryScore(memory.importance)}</span>
              <span>confidence {formatMemoryScore(memory.confidence)}</span>
              {memory.updatedAt ? <span>{memory.updatedAt}</span> : null}
            </div>
            {memory.tags.length ? (
              <div className="memory-tags">
                {memory.tags.map((tag) => <span key={tag}>{tag}</span>)}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="danger-text"
            aria-label={`删除记忆 ${memory.id}`}
            onClick={() => onDeleteMemory(memory.id)}
            disabled={saving}
          >
            删除
          </button>
        </article>
      ))}
    </div>
  </div>
)

export interface AiPaneProps {
  config: AiConfigViewState
  activeConfig: AiConfigViewState
  imageGenerationConfig: ImageGenerationConfigViewState
  activeImageGenerationConfig: ImageGenerationConfigViewState
  personaProfile: AiPersonaProfileViewState
  memoryProfile: AiMemoryProfileViewState
  personaDraft: {
    name: string
    identity: string
    tone: string
    speakingStyle: string
    relationshipToUser: string
    actionStyle: string
    coreTraitsText: string
    boundariesText: string
  }
  providerConfigDirty: boolean
  providerConfigChanges: string[]
  activeProviderSummary: string
  providerConfigValidationError: string
  connectionTestResult: AiConnectionTestResult | null
  chatModelDiscovery: ProviderModelDiscoveryResult | null
  chatModelDiscoveryStatus: string
  imageProviderValidationError: string
  imageHealthResult: ImageGenerationHealthCheckResult | null
  imageModelDiscovery: ProviderModelDiscoveryResult | null
  imageModelDiscoveryStatus: string
  imageTransparencyCompatibilityHint: string
  onChange: (partial: Partial<AiConfigViewState>) => void
  onChangeImageGeneration: (partial: Partial<ImageGenerationConfigViewState>) => void
  onSave: () => void | Promise<void>
  onSaveApiKey: () => void | Promise<void>
  onTest: () => void | Promise<void>
  onDiscoverAiModels: () => void | Promise<void>
  onSaveImageGeneration: () => void | Promise<void>
  onSavePersonaOverride: () => void | Promise<void>
  onResetPersonaOverride: () => void | Promise<void>
  onGeneratePersonaDraft: () => void | Promise<void>
  onApplyGeneratedPersonaDraft: () => void | Promise<void>
  onDismissGeneratedPersonaDraft: () => void | Promise<void>
  onSaveImageGenerationApiKey: () => void | Promise<void>
  onClearImageGenerationApiKey: () => void | Promise<void>
  onCheckImageGenerationHealth: () => void | Promise<void>
  onDiscoverImageGenerationModels: () => void | Promise<void>
  onSendChat: () => void | Promise<void>
  saving: boolean
  status: string
  connectionStatus: string
  imageStatus: string
  imageHealthStatus: string
  chatStatus: string
  hasUnsavedConfigChanges: boolean
  hasUnsavedApiKeyDraft: boolean
  hasUnsavedImageGenerationChanges: boolean
  hasUnsavedImageApiKeyDraft: boolean
  apiKeyDraft: string
  setApiKeyDraft: (value: string) => void
  imageApiKeyDraft: string
  setImageApiKeyDraft: (value: string) => void
  onChangePersonaDraft: (partial: Partial<AiPaneProps['personaDraft']>) => void
  personaGenerationInstruction: string
  setPersonaGenerationInstruction: (value: string) => void
  generatedPersonaDraft: AiPersonaDraftViewState | null
  chatDraft: string
  setChatDraft: (value: string) => void
  chatMessages: ChatMessage[]
  petChatState: PetChatStateViewState
  traceSummary: AiTalkTraceSummaryViewState | null
  chatting: boolean
  behavior: AiBehaviorConfig
  behaviorRulesText: string
  setBehaviorRulesText: (value: string) => void
  onChangeBehavior: (partial: Partial<AiBehaviorConfig>) => void
  onSaveBehavior: () => void | Promise<void>
  dryRunText: string
  setDryRunText: (value: string) => void
  dryRunResult: AiBehaviorResult | null
  onDryRunBehavior: () => void | Promise<void>
  replayDraft: string
  setReplayDraft: (value: string) => void
  replayResult: AiBehaviorResult | null
  behaviorStatus: string
  onReplayBehaviorDecision: () => void | Promise<void>
  traceDiagnosticsFilters: AiTalkTraceDiagnosticsFilters
  onChangeTraceDiagnosticsFilters: (partial: AiTalkTraceDiagnosticsFilters) => void
  onExportBehaviorDiagnostics: () => void | Promise<void>
  onExportAiTalkTraceDiagnostics: () => void | Promise<void>
  onClearBehaviorDecisions: () => void | Promise<void>
  onRefreshMemoryProfile: () => void | Promise<void>
  onDeleteMemory: (memoryId: string) => void | Promise<void>
  onClearPetPackMemories: () => void | Promise<void>
  onOpenDesktopChat: () => void | Promise<void>
  onOpenBubbleChat: () => void | Promise<void>
}

export function AiPane({
  config,
  activeConfig,
  imageGenerationConfig = defaultImageGenerationConfig,
  activeImageGenerationConfig = defaultImageGenerationConfig,
  personaProfile,
  memoryProfile,
  personaDraft,
  providerConfigDirty,
  providerConfigChanges,
  activeProviderSummary,
  providerConfigValidationError,
  connectionTestResult,
  chatModelDiscovery,
  chatModelDiscoveryStatus,
  imageProviderValidationError,
  imageHealthResult,
  imageModelDiscovery,
  imageModelDiscoveryStatus,
  imageTransparencyCompatibilityHint,
  onChange,
  onChangeImageGeneration,
  onSave,
  onSaveApiKey,
  onTest,
  onDiscoverAiModels,
  onSaveImageGeneration,
  onSavePersonaOverride,
  onResetPersonaOverride,
  onGeneratePersonaDraft,
  onApplyGeneratedPersonaDraft,
  onDismissGeneratedPersonaDraft,
  onSaveImageGenerationApiKey,
  onClearImageGenerationApiKey,
  onCheckImageGenerationHealth,
  onDiscoverImageGenerationModels,
  onSendChat,
  saving,
  status,
  connectionStatus,
  imageStatus,
  imageHealthStatus,
  chatStatus,
  hasUnsavedConfigChanges,
  hasUnsavedApiKeyDraft,
  hasUnsavedImageGenerationChanges,
  hasUnsavedImageApiKeyDraft,
  apiKeyDraft,
  setApiKeyDraft,
  imageApiKeyDraft,
  setImageApiKeyDraft,
  onChangePersonaDraft,
  personaGenerationInstruction,
  setPersonaGenerationInstruction,
  generatedPersonaDraft,
  chatDraft,
  setChatDraft,
  chatMessages,
  petChatState,
  traceSummary,
  chatting,
  behavior,
  behaviorRulesText,
  setBehaviorRulesText,
  onChangeBehavior,
  onSaveBehavior,
  dryRunText,
  setDryRunText,
  dryRunResult,
  onDryRunBehavior,
  replayDraft,
  setReplayDraft,
  replayResult,
  behaviorStatus,
  onReplayBehaviorDecision,
  traceDiagnosticsFilters,
  onChangeTraceDiagnosticsFilters,
  onExportBehaviorDiagnostics,
  onExportAiTalkTraceDiagnostics,
  onClearBehaviorDecisions,
  onRefreshMemoryProfile,
  onDeleteMemory,
  onClearPetPackMemories,
  onOpenDesktopChat,
  onOpenBubbleChat
}: AiPaneProps) {
  const decisions = Array.isArray(behavior.decisions) ? behavior.decisions : []
  const latestMemoryJob = memoryProfile.recentJobs[0]
  const saveDisabled = saving || Boolean(providerConfigValidationError)
  const imageSaveDisabled = saving || Boolean(imageProviderValidationError)
  const apiKeyDraftReady = Boolean(apiKeyDraft.trim())
  const draftSummary = [
    hasUnsavedConfigChanges ? '配置草稿未保存' : '',
    hasUnsavedApiKeyDraft ? '密钥草稿未保存' : ''
  ].filter(Boolean).join(' · ')
  const imageDraftSummary = [
    hasUnsavedImageGenerationChanges ? '图片配置草稿未保存' : '',
    hasUnsavedImageApiKeyDraft ? '图片密钥草稿未保存' : ''
  ].filter(Boolean).join(' · ')
  const imageTargetSummary = `${activeImageGenerationConfig.provider} · ${activeImageGenerationConfig.baseUrl} · ${activeImageGenerationConfig.model} · ${activeImageGenerationConfig.hasApiKey ? 'API key saved' : 'API key missing'}`
  const imageModelCompatibility = describeImageModelCompatibility(imageGenerationConfig.baseUrl, imageGenerationConfig.model)
  const chatModelCompatibility = describeChatModelCompatibility(config.baseUrl, config.model)
  const hasUnsavedChatProbeInputs = hasUnsavedConfigChanges || hasUnsavedApiKeyDraft
  const hasUnsavedImageProbeInputs = hasUnsavedImageGenerationChanges || hasUnsavedImageApiKeyDraft
  const applyChatProviderPreset = (preset: typeof chatProviderPresets[number]) => onChange({
    provider: 'openai-compatible',
    baseUrl: preset.baseUrl,
    ...(preset.model ? { model: preset.model } : {})
  })
  const traceScopeLabel = (scopes: string[]) => scopes.length ? scopes.join(' / ') : 'none'
  const applyImageProviderPreset = (preset: typeof imageProviderPresets[number]) => onChangeImageGeneration({
    provider: 'openai-compatible',
    baseUrl: preset.baseUrl,
    ...(preset.model ? { model: preset.model } : {}),
    timeoutMs: preset.timeoutMs,
    maxConcurrentJobs: preset.maxConcurrentJobs
  })

  return (
    <section className="pane ai-pane">
      <header className="pane-header">
        <div>
          <h1>AI</h1>
          <p>聊天 Provider 与模型配置</p>
        </div>
      </header>

      <CollapsibleAiSection title="模型 Provider" note="统一管理聊天与图片生成模型；本地、代理、云端都使用 Base URL + API Key + Model" defaultOpen>
        <div className="provider-hub" data-testid="ai-provider-hub">
          <div className="provider-hub-intro">
            <div>
              <strong>Provider 总览</strong>
              <span>OpenPet 把模型能力拆成两张卡：聊天模型负责宠物对话，图片模型负责 Creator Studio 生成。两者都必须显式配置 Base URL、API Key 和 Model，不再区分本地/cloud 模式。</span>
            </div>
            <div className="provider-hub-badges" aria-label="Provider capability summary">
              <span>{activeConfig.hasApiKey ? '聊天密钥已保存' : '聊天密钥未保存'}</span>
              <span>{activeImageGenerationConfig.hasApiKey ? '图片密钥已保存' : '图片密钥未保存'}</span>
            </div>
          </div>

          <div className="provider-capability-grid">
            <article className="provider-capability-card" data-testid="chat-provider-card">
              <div className="provider-card-header">
                <div>
                  <h3>聊天模型</h3>
                  <p>用于宠物气泡聊天、扩展聊天面板、人格生成、记忆抽取和行为编排。</p>
                </div>
                <div className="provider-card-actions">
                  <button type="button" className="ghost" onClick={onDiscoverAiModels} disabled={saving}>
                    刷新聊天模型
                  </button>
                  <button type="button" className="ghost" onClick={onTest} disabled={saving}>
                    测试已保存配置
                  </button>
                  <button type="button" className="primary" onClick={onSave} disabled={saveDisabled}>
                    {saving ? '保存中' : '保存聊天 Provider'}
                  </button>
                </div>
              </div>
              <div className="section provider-summary" data-testid="ai-provider-summary">
                <div className="provider-feedback" data-testid="chat-provider-boundary">
                  <strong>聊天 Provider 边界</strong>
                  <span>本地网关、代理服务和云端接口共用同一套 OpenAI-compatible 聊天 Provider 契约；切换环境只需要改 Base URL 和 Model。</span>
                  <span>“保存聊天 Provider”只写入当前配置；“测试已保存配置”只测试已保存的生效配置，不会偷用草稿。</span>
                  <span>API Key 只保存在 OpenPet host；renderer、dashboard 和普通插件都不能直接读取。</span>
                </div>

                <div className="readonly-row">
                  <strong>当前生效配置</strong>
                  <span className="endpoint-text" data-testid="ai-provider-active-summary">{activeProviderSummary}</span>
                </div>

                <div className="readonly-row">
                  <strong>草稿状态</strong>
                  <span>{draftSummary || '当前没有未保存修改'}</span>
                </div>

                {providerConfigDirty ? (
                  <div className="provider-warning" data-testid="ai-provider-dirty-warning">
                    <strong>未保存修改：</strong> {providerConfigChanges.join(' / ') || 'Provider 草稿'}
                    <br />
                    你有未保存的 Provider 草稿。点击“保存聊天 Provider”只保存配置；点击“测试已保存配置”只测试当前已保存配置，不会偷用草稿。
                  </div>
                ) : null}
                {providerConfigValidationError ? (
                  <div className="provider-warning error" data-testid="ai-provider-validation-error">{providerConfigValidationError}</div>
                ) : null}

                <div className="field-row">
                  <div className="field-label">启用聊天</div>
                  <Toggle ariaLabel="Enable AI chat" checked={config.enabled} onChange={(enabled) => onChange({ enabled })} />
                </div>

                <label className="field-row">
                  <span className="field-label">Provider</span>
                  <select
                    className="text-input"
                    value={config.provider}
                    onChange={(event) => onChange({ provider: event.target.value })}
                  >
                    <option value="openai-compatible">OpenAI compatible</option>
                  </select>
                </label>

                <label className="field-row">
                  <span className="field-label">Base URL</span>
                  <input
                    aria-label="聊天 Base URL"
                    className="text-input"
                    value={config.baseUrl}
                    onChange={(event) => onChange({ baseUrl: event.target.value })}
                  />
                </label>

                <label className="field-row">
                  <span className="field-label">Model</span>
                  <input
                    aria-label="聊天 Model"
                    className="text-input"
                    value={config.model}
                    onChange={(event) => onChange({ model: event.target.value })}
                  />
                </label>

                <div className="field-row tall">
                  <div>
                    <div className="field-label">聊天 Provider 预设</div>
                    <div className="field-note">预设只填充 Base URL / 可安全默认的 Model；不会读取或覆盖 API Key。除 OpenPet 8317 外，预设只是 endpoint 模板，需要保存后测试确认。</div>
                  </div>
                  <div className="provider-preset-grid">
                    {chatProviderPresets.map((preset) => (
                      <button
                        type="button"
                        key={preset.id}
                        className="provider-preset-card"
                        onClick={() => applyChatProviderPreset(preset)}
                        disabled={saving}
                      >
                        <strong>{preset.title}</strong>
                        <span>{preset.description}</span>
                        <code>{preset.baseUrl}</code>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field-row">
                  <div>
                    <div className="field-label">API Key</div>
                    <div className="field-note">{config.hasApiKey ? '已保存' : '未保存'}</div>
                  </div>
                  <div className="inline-action">
                    <input
                      aria-label="聊天 API Key"
                      className="text-input"
                      type="password"
                      value={apiKeyDraft}
                      placeholder={config.hasApiKey ? '输入新密钥覆盖' : '输入 API Key'}
                      onChange={(event) => setApiKeyDraft(event.target.value)}
                    />
                    <button type="button" className="ghost" onClick={onSaveApiKey} disabled={!apiKeyDraftReady || saving}>
                      保存密钥
                    </button>
                  </div>
                </div>

                <label className="field-row tall">
                  <span className="field-label">System Prompt</span>
                  <textarea
                    className="text-input textarea"
                    value={config.systemPrompt}
                    onChange={(event) => onChange({ systemPrompt: event.target.value })}
                  />
                </label>

                <div className="field-row">
                  <div>
                    <div className="field-label">长期记忆</div>
                    <div className="field-note">主回复不阻塞，后台自动抽取用户与宠物关系记忆</div>
                  </div>
                  <Toggle
                    ariaLabel="Enable AI memory"
                    checked={config.memory.enabled}
                    onChange={(enabled) => onChange({ memory: { ...config.memory, enabled } })}
                  />
                </div>
              </div>

              {(chatModelDiscoveryStatus || chatModelDiscovery) ? (
                <div className="readonly-row" data-testid="ai-chat-model-discovery">
                  <strong>聊天模型探测</strong>
                  <span>
                    {[chatModelDiscoveryStatus, chatModelDiscovery?.models?.length ? `models: ${chatModelDiscovery.models.join(', ')}` : '']
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
              ) : null}

              {(connectionStatus || connectionTestResult) ? (
                <div
                  className={`provider-feedback ${connectionTestResult ? (connectionTestResult.ok ? 'ok' : 'error') : ''}`}
                  data-testid="ai-provider-feedback"
                  aria-live="polite"
                >
                  <strong>聊天 Provider 状态</strong>
                  {connectionStatus ? <span>{connectionStatus}</span> : null}
                  {connectionTestResult ? (
                    <div className="connection-result" data-testid="ai-connection-result">
                      <strong>{connectionTestResult.ok ? '连接测试通过' : '连接测试失败'}</strong>
                      <span>Provider: {connectionTestResult.provider}</span>
                      <span>Base URL: {connectionTestResult.baseUrl}</span>
                      <span>Model: {connectionTestResult.model}</span>
                      <span>API Key: {connectionTestResult.hasApiKey ? '已保存' : '未保存'}</span>
                      <span>耗时: {connectionTestResult.elapsedMs}ms</span>
                      {connectionTestResult.ok ? <span>回复: {connectionTestResult.reply || 'ok'}</span> : null}
                      {!connectionTestResult.ok ? <span>错误: {connectionTestResult.code || 'unknown'} · {connectionTestResult.message || '连接失败'}</span> : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {renderChatModelDiscovery(connectionTestResult, config.model, hasUnsavedChatProbeInputs)}

              <div className="provider-feedback" data-testid="chat-model-compatibility">
                <strong>{chatModelCompatibility.title}</strong>
                <span>{chatModelCompatibility.summary}</span>
              </div>

            </article>

            <article className="provider-capability-card" data-testid="image-provider-card">
              <div className="provider-card-header">
                <div>
                  <h3>图片模型</h3>
                  <p>用于 Creator Studio 生成宠物立绘、动作帧和导入前图片资产。</p>
                </div>
                <div className="provider-card-actions">
                  <button type="button" className="ghost" onClick={onDiscoverImageGenerationModels} disabled={saving}>
                    刷新图片模型
                  </button>
                  <button type="button" className="ghost" onClick={onCheckImageGenerationHealth} disabled={saving}>
                    检查图片健康
                  </button>
                  <button type="button" className="primary" onClick={onSaveImageGeneration} disabled={imageSaveDisabled}>
                    保存图片 Provider
                  </button>
                </div>
              </div>

              <div className="section">
                <div className="provider-feedback" data-testid="image-provider-boundary">
                  <strong>图片 Provider 边界</strong>
                  <span>本地网关、代理服务和云端接口共用同一套 OpenAI-compatible 图片 Provider 契约；切换环境只需要改 Base URL、Model 和超时配置。</span>
                  <span>“保存图片 Provider”只更新 host 配置；“检查图片健康”只检查当前已保存的图片 Provider，不会偷用草稿。</span>
                  <span>Creator Studio 只提交提示词和输出目录；Provider 调用、API Key、图片写入都由 OpenPet host 执行。</span>
                </div>

                <div className="readonly-row">
                  <strong>图片当前 Provider</strong>
                  <span className="endpoint-text">{imageTargetSummary}</span>
                </div>

                <div className="readonly-row">
                  <strong>图片草稿状态</strong>
                  <span>{imageDraftSummary ? `${imageDraftSummary}；健康检查使用当前已保存配置。` : '当前没有未保存的图片配置修改'}</span>
                </div>

                <div className="readonly-row">
                  <strong>生成边界</strong>
                  <span>Creator Studio 只提交提示词和输出目录；Provider 调用、API Key、图片写入都由 OpenPet host 执行。</span>
                </div>

                <div className="field-row tall">
                  <div>
                    <div className="field-label">图片 Provider 预设</div>
                    <div className="field-note">预设只填充 Base URL / 可安全默认的 Model / 超时；不会读取或覆盖 API Key。除 OpenPet 8317 外，预设只是 endpoint 模板，需要保存后健康检查确认。</div>
                  </div>
                  <div className="provider-preset-grid">
                    {imageProviderPresets.map((preset) => (
                      <button
                        type="button"
                        key={preset.id}
                        className="provider-preset-card"
                        onClick={() => applyImageProviderPreset(preset)}
                        disabled={saving}
                      >
                        <strong>{preset.title}</strong>
                        <span>{preset.description}</span>
                        <code>{preset.baseUrl}</code>
                      </button>
                    ))}
                  </div>
                </div>

                {imageProviderValidationError ? (
                  <div className="provider-warning error">{imageProviderValidationError}</div>
                ) : null}

                {imageHealthStatus ? (
                  <div className="readonly-row">
                    <strong>图片健康状态</strong>
                    <span>{imageHealthStatus}</span>
                  </div>
                ) : null}

                {imageStatus ? (
                  <div className="provider-feedback" data-testid="ai-image-status" aria-live="polite">
                    <strong>图片 Provider 状态</strong>
                    <span>{imageStatus}</span>
                  </div>
                ) : null}

                {renderImageModelDiscovery(imageHealthResult, imageGenerationConfig.model, hasUnsavedImageProbeInputs)}

                {renderImageUsageSummary(imageHealthResult, hasUnsavedImageProbeInputs)}

                <div className="provider-feedback" data-testid="image-model-compatibility">
                  <strong>{imageModelCompatibility.title}</strong>
                  <span>{imageModelCompatibility.summary}</span>
                </div>

                {(imageModelDiscoveryStatus || imageModelDiscovery) ? (
                  <div className="readonly-row" data-testid="ai-image-model-discovery">
                    <strong>图片模型探测</strong>
                    <span>
                      {[imageModelDiscoveryStatus, imageModelDiscovery?.models?.length ? `models: ${imageModelDiscovery.models.join(', ')}` : '']
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                ) : null}

                <div className="readonly-row" data-testid="ai-image-compatibility-hint">
                  <strong>透明背景兼容性</strong>
                  <span>{imageTransparencyCompatibilityHint}</span>
                </div>

                <label className="field-row">
                  <span className="field-label">图片 Base URL</span>
                  <input
                    aria-label="图片 Base URL"
                    className="text-input"
                    value={imageGenerationConfig.baseUrl}
                    onChange={(event) => onChangeImageGeneration({ baseUrl: event.target.value })}
                  />
                </label>

                <label className="field-row">
                  <span className="field-label">图片 Model</span>
                  <input
                    aria-label="图片 Model"
                    className="text-input"
                    value={imageGenerationConfig.model}
                    onChange={(event) => onChangeImageGeneration({ model: event.target.value })}
                  />
                </label>

                <label className="field-row">
                  <div>
                    <div className="field-label">图片 Timeout</div>
                    <div className="field-note">Provider 生成请求的最长等待时间，单位毫秒。</div>
                  </div>
                  <input
                    aria-label="图片 Timeout MS"
                    className="text-input"
                    type="number"
                    min={1000}
                    step={1000}
                    value={imageGenerationConfig.timeoutMs}
                    onChange={(event) => onChangeImageGeneration({ timeoutMs: Number(event.target.value) })}
                  />
                </label>

                <label className="field-row">
                  <div>
                    <div className="field-label">图片最大并发</div>
                    <div className="field-note">当前建议保持 1，避免桌宠生成任务互相抢占。</div>
                  </div>
                  <input
                    aria-label="图片最大并发"
                    className="text-input"
                    type="number"
                    min={1}
                    step={1}
                    value={imageGenerationConfig.maxConcurrentJobs}
                    onChange={(event) => onChangeImageGeneration({ maxConcurrentJobs: Number(event.target.value) })}
                  />
                </label>

                <div className="field-row">
                  <div>
                    <div className="field-label">图片 API Key</div>
                    <div className="field-note">
                      {imageGenerationConfig.hasApiKey ? '已保存' : '未保存'}
                      {imageGenerationConfig.apiKeyPreview ? ` · ${imageGenerationConfig.apiKeyPreview}` : ''}
                    </div>
                  </div>
                  <div className="inline-action">
                    <input
                      aria-label="图片 API Key"
                      className="text-input"
                      type="password"
                      value={imageApiKeyDraft}
                      placeholder={imageGenerationConfig.hasApiKey ? '输入新密钥覆盖' : '输入图片 API Key'}
                      onChange={(event) => setImageApiKeyDraft(event.target.value)}
                    />
                    <button type="button" className="ghost" onClick={onSaveImageGenerationApiKey} disabled={!imageApiKeyDraft.trim() || saving}>
                      保存图片密钥
                    </button>
                    <button type="button" className="danger-text" onClick={onClearImageGenerationApiKey} disabled={saving || !imageGenerationConfig.hasApiKey}>
                      清除图片密钥
                    </button>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </CollapsibleAiSection>

      <CollapsibleAiSection title="长期记忆" note="查看和管理自动抽取的用户与宠物关系记忆">
        <div className="section memory-section" data-testid="ai-memory-profile">
          <div className="field-row">
            <div>
              <div className="field-label">当前宠物包</div>
              <div className="field-note">{memoryProfile.petPackDisplayName} · {memoryProfile.petPackId}</div>
            </div>
            <div className="inline-action">
              <button type="button" className="ghost" onClick={onRefreshMemoryProfile} disabled={saving}>
                刷新记忆
              </button>
              <button type="button" className="ghost" onClick={onExportAiTalkTraceDiagnostics}>
                导出 AI Talk Trace
              </button>
              <button type="button" className="danger-text" onClick={onClearPetPackMemories} disabled={saving || memoryProfile.petPackMemories.length === 0}>
                清空当前宠物记忆
              </button>
            </div>
          </div>

          <div className="field-row">
            <div>
              <div className="field-label">Trace 导出范围</div>
              <div className="field-note">导出 redacted 诊断时，可缩小到当前宠物包或当前主会话。</div>
            </div>
            <select
              className="text-input"
              value={traceDiagnosticsFilters.conversationId
                ? 'conversation'
                : (traceDiagnosticsFilters.petPackId ? 'petPack' : 'all')}
              onChange={(event) => {
                const nextMode = event.target.value
                if (nextMode === 'conversation') {
                  onChangeTraceDiagnosticsFilters({
                    petPackId: petChatState.petPack.id || memoryProfile.petPackId,
                    conversationId: petChatState.conversationId || `control-center:${memoryProfile.petPackId}:main`
                  })
                  return
                }
                if (nextMode === 'petPack') {
                  onChangeTraceDiagnosticsFilters({
                    petPackId: petChatState.petPack.id || memoryProfile.petPackId,
                    conversationId: ''
                  })
                  return
                }
                onChangeTraceDiagnosticsFilters({ petPackId: '', conversationId: '' })
              }}
              data-testid="ai-trace-filter-select"
            >
              <option value="all">全部 AI Talk 数据</option>
              <option value="petPack">仅当前宠物包</option>
              <option value="conversation">仅当前主会话</option>
            </select>
          </div>

          <div className="readonly-row">
            <strong>当前 Trace 过滤</strong>
            <span>
              {traceDiagnosticsFilters.conversationId
                ? `会话 ${traceDiagnosticsFilters.conversationId}`
                : traceDiagnosticsFilters.petPackId
                  ? `宠物包 ${traceDiagnosticsFilters.petPackId}`
                  : '不过滤，导出全部'}
            </span>
          </div>

          <div className="memory-grid">
            <MemoryList
              title="全局用户记忆"
              memories={memoryProfile.globalMemories}
              emptyText="暂无全局用户记忆"
              saving={saving}
              onDeleteMemory={onDeleteMemory}
            />
            <MemoryList
              title="当前宠物关系记忆"
              memories={memoryProfile.petPackMemories}
              emptyText="暂无当前宠物关系记忆"
              saving={saving}
              onDeleteMemory={onDeleteMemory}
            />
          </div>

          <div className="readonly-row">
            <strong>最近记忆任务</strong>
            {latestMemoryJob ? (
              <span>
                {latestMemoryJob.status} · applied {latestMemoryJob.appliedCount} · filtered {latestMemoryJob.filteredCount}
                {latestMemoryJob.errorCode ? ` · ${latestMemoryJob.errorCode}` : ''}
              </span>
            ) : <span>暂无后台抽取任务</span>}
          </div>
        </div>
      </CollapsibleAiSection>

      <CollapsibleAiSection title="Pet Persona Override" note="按当前宠物包覆盖 AI 人格">
        <div className="section">
          <div className="field-row">
            <div>
              <div className="field-label">Pet Persona Override</div>
              <div className="field-note">当前激活宠物包：{personaProfile.petPackDisplayName} · {personaProfile.petPackId}</div>
            </div>
            <div className="inline-action">
              <button type="button" className="ghost" onClick={onResetPersonaOverride} disabled={saving}>
                清空 override
              </button>
              <button type="button" className="primary" onClick={onSavePersonaOverride} disabled={saving}>
                保存人格 override
              </button>
            </div>
          </div>

          <label className="field-row">
            <span className="field-label">Name</span>
            <input
              className="text-input"
              value={personaDraft.name}
              placeholder={personaProfile.packPersona.name}
              onChange={(event) => onChangePersonaDraft({ name: event.target.value })}
            />
          </label>

          <label className="field-row">
            <span className="field-label">Identity</span>
            <input
              className="text-input"
              value={personaDraft.identity}
              placeholder={personaProfile.packPersona.identity}
              onChange={(event) => onChangePersonaDraft({ identity: event.target.value })}
            />
          </label>

          <label className="field-row">
            <span className="field-label">Tone</span>
            <input
              className="text-input"
              value={personaDraft.tone}
              placeholder={personaProfile.packPersona.tone}
              onChange={(event) => onChangePersonaDraft({ tone: event.target.value })}
            />
          </label>

          <label className="field-row">
            <span className="field-label">Speaking Style</span>
            <input
              className="text-input"
              value={personaDraft.speakingStyle}
              placeholder={personaProfile.packPersona.speakingStyle}
              onChange={(event) => onChangePersonaDraft({ speakingStyle: event.target.value })}
            />
          </label>

          <label className="field-row">
            <span className="field-label">Relationship</span>
            <input
              className="text-input"
              value={personaDraft.relationshipToUser}
              placeholder={personaProfile.packPersona.relationshipToUser}
              onChange={(event) => onChangePersonaDraft({ relationshipToUser: event.target.value })}
            />
          </label>

          <label className="field-row">
            <span className="field-label">Action Style</span>
            <input
              className="text-input"
              value={personaDraft.actionStyle}
              placeholder={personaProfile.packPersona.actionStyle}
              onChange={(event) => onChangePersonaDraft({ actionStyle: event.target.value })}
            />
          </label>

          <label className="field-row tall">
            <span className="field-label">Core Traits</span>
            <textarea
              className="text-input textarea"
              value={personaDraft.coreTraitsText}
              placeholder={personaProfile.packPersona.coreTraits.join('\n')}
              onChange={(event) => onChangePersonaDraft({ coreTraitsText: event.target.value })}
            />
          </label>

          <label className="field-row tall">
            <span className="field-label">Boundaries</span>
            <textarea
              className="text-input textarea"
              value={personaDraft.boundariesText}
              placeholder={personaProfile.packPersona.boundaries.join('\n')}
              onChange={(event) => onChangePersonaDraft({ boundariesText: event.target.value })}
            />
          </label>

          <div className="readonly-row">
            <strong>Compiled Persona Prompt</strong>
            <pre className="json-preview">{personaProfile.compiledPersonaPrompt || '暂无编译结果'}</pre>
          </div>

          <div className="readonly-row">
            <strong>Compiled System Prompt</strong>
            <pre className="json-preview">{personaProfile.compiledSystemPrompt || '暂无编译结果'}</pre>
          </div>

          <label className="field-row tall">
            <span className="field-label">生成说明</span>
            <textarea
              className="text-input textarea"
              value={personaGenerationInstruction}
              placeholder="例如：更活泼一点，但保持简短、可靠、适合工作陪伴"
              onChange={(event) => setPersonaGenerationInstruction(event.target.value)}
            />
          </label>

          <div className="field-row">
            <div>
              <div className="field-label">人格生成草稿</div>
              <div className="field-note">生成后先预览，确认后才写入本地 override</div>
            </div>
            <button type="button" className="ghost" onClick={onGeneratePersonaDraft} disabled={saving}>
              生成人格草稿
            </button>
          </div>

          {generatedPersonaDraft ? (
            <div className="readonly-row">
              <strong>Generated Persona Draft</strong>
              <pre className="json-preview">{generatedPersonaDraft.compiledPersonaPrompt}</pre>
              <div className="inline-action">
                <button type="button" className="primary" onClick={onApplyGeneratedPersonaDraft} disabled={saving}>
                  应用草稿
                </button>
                <button type="button" className="ghost" onClick={onDismissGeneratedPersonaDraft} disabled={saving}>
                  放弃草稿
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </CollapsibleAiSection>

      {status ? <div className="status-line" data-testid="ai-status-line">{status}</div> : null}

      <CollapsibleAiSection title="Behavior" note="AI 回复到宠物动作的编排与诊断">
        <div className="section">
          {behaviorStatus ? (
            <div className="provider-feedback" data-testid="ai-behavior-status" aria-live="polite">
              <strong>Behavior 状态</strong>
              <span>{behaviorStatus}</span>
            </div>
          ) : null}
          <div className="field-row">
            <div>
              <div className="field-label">Behavior</div>
              <div className="field-note">AI 行为编排</div>
            </div>
            <Toggle ariaLabel="Enable AI behavior" checked={behavior.enabled} onChange={(enabled) => onChangeBehavior({ enabled })} />
          </div>

          <div className="field-row">
            <div>
              <div className="field-label">Provider tools</div>
              <div className="field-note">openpet_behavior tool_call</div>
            </div>
            <Toggle ariaLabel="Enable provider tools" checked={behavior.useTools} onChange={(useTools) => onChangeBehavior({ useTools })} />
          </div>

          <label className="field-row">
            <span className="field-label">Cooldown</span>
            <input
              className="text-input"
              type="number"
              min="0"
              value={behavior.cooldownMs}
              onChange={(event) => onChangeBehavior({ cooldownMs: Number(event.target.value) })}
            />
          </label>

          <label className="field-row tall">
            <span className="field-label">Rules JSON</span>
            <textarea
              className="text-input textarea behavior-rules"
              value={behaviorRulesText}
              onChange={(event) => setBehaviorRulesText(event.target.value)}
            />
          </label>

          <div className="field-row tall">
            <div className="field-label">Dry run</div>
            <div className="behavior-dry-run">
              <div className="inline-action">
                <input
                  className="text-input"
                  value={dryRunText}
                  placeholder="输入一段 AI 回复"
                  onChange={(event) => setDryRunText(event.target.value)}
                />
                <button type="button" className="ghost" onClick={onDryRunBehavior} disabled={!dryRunText.trim()}>
                  测试
                </button>
                <button type="button" className="primary" onClick={onSaveBehavior} disabled={saving}>
                  保存 Behavior
                </button>
              </div>
              {dryRunResult ? (
                <div className="behavior-result">
                  <strong>{dryRunResult.matched ? 'Matched' : 'No match'}</strong>
                  <span>{dryRunResult.reason}</span>
                  {dryRunResult.actionId ? <span>{dryRunResult.actionId}</span> : null}
                  {dryRunResult.ruleId ? <span>{dryRunResult.ruleId}</span> : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="field-row tall">
            <div>
              <div className="field-label">Decisions</div>
              <div className="field-note">{decisions.length} 条</div>
            </div>
            <div className="behavior-diagnostics">
              <div className="inline-action">
                <input
                  className="text-input"
                  value={replayDraft}
                  placeholder="Decision ID"
                  onChange={(event) => setReplayDraft(event.target.value)}
                />
                <button type="button" className="ghost" onClick={onReplayBehaviorDecision} disabled={!replayDraft.trim()}>
                  Replay
                </button>
                <button type="button" className="ghost" onClick={onExportBehaviorDiagnostics} disabled={decisions.length === 0}>
                  导出
                </button>
                <button type="button" className="danger-text" onClick={onClearBehaviorDecisions} disabled={decisions.length === 0}>
                  清空
                </button>
              </div>

              {replayResult ? (
                <div className="behavior-result">
                  <strong>{replayResult.matched ? 'Replay matched' : 'Replay no match'}</strong>
                  <span>{replayResult.reason}</span>
                  {replayResult.actionId ? <span>{replayResult.actionId}</span> : null}
                </div>
              ) : null}

              <div className="behavior-decision-list">
                {decisions.length === 0 ? (
                  <div className="empty-chat">暂无决策记录</div>
                ) : decisions.slice(0, 8).map((decision) => (
                  <div className="behavior-decision-row" key={decision.id}>
                    <div>
                      <strong>#{decision.id} {decision.matched ? 'matched' : 'blocked'}</strong>
                      <span>{decision.reason || decision.blockedReason || 'no reason'}</span>
                      {decision.inputSummary ? <span>{decision.inputSummary}</span> : null}
                    </div>
                    <div className="behavior-decision-meta">
                      {decision.ruleId ? <span>{decision.ruleId}</span> : null}
                      {decision.actionId ? <span>{decision.actionId}</span> : null}
                      {decision.displayMode ? <span>display: {decision.displayMode}</span> : null}
                      {decision.providerReason ? <span>provider: {decision.providerReason}</span> : null}
                      {decision.cooldown ? <span>cooldown</span> : null}
                      {decision.fallback ? <span>fallback</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </CollapsibleAiSection>

      <CollapsibleAiSection title="聊天" note="默认在这里和宠物对话；需要长历史时可打开扩展聊天面板">
        <div className="chat-panel">
          {chatStatus ? (
            <div className="provider-feedback" data-testid="ai-chat-status" aria-live="polite">
              <strong>聊天状态</strong>
              <span>{chatStatus}</span>
            </div>
          ) : null}
          <div className="chat-meta-bar">
            <div>
              <strong>{petChatState.petPack.displayName || '当前宠物'}</strong>
              <span>
                {petChatState.ai.ready
                  ? `${petChatState.ai.provider} · ${petChatState.ai.model}`
                  : (petChatState.ai.reason || '请先配置 AI Provider')}
              </span>
            </div>
            <div className="inline-action">
              <button type="button" className="ghost" onClick={onOpenBubbleChat}>
                打开默认气泡聊天
              </button>
              <button type="button" className="ghost" onClick={onOpenDesktopChat}>
                打开扩展聊天面板
              </button>
            </div>
          </div>
          {petChatState.bubble.text ? (
            <div className="chat-bubble-preview" data-testid="ai-chat-bubble-preview">
              <strong>宠物当前气泡</strong>
              <span>{petChatState.bubble.text}</span>
            </div>
          ) : null}
          <div className="section" data-testid="ai-trace-summary">
            <div className="readonly-row">
              <strong>当前 Trace</strong>
              {traceSummary ? (
                <span>
                  {traceSummary.conversation.petPackDisplayName || traceSummary.conversation.petPackId || 'Unknown pet'}
                  {' · '}
                  {traceSummary.conversation.conversationId || 'no-conversation'}
                </span>
              ) : <span>暂无 AI Talk trace</span>}
            </div>
            <div className="readonly-row">
              <strong>Provider</strong>
              <span>
                {traceSummary
                  ? `${traceSummary.provider.provider || 'unknown'} · ${traceSummary.provider.baseUrl || 'n/a'} · ${traceSummary.provider.model || 'n/a'}`
                  : 'n/a'}
              </span>
            </div>
            <div className="readonly-row">
              <strong>请求摘要</strong>
              <span>
                {traceSummary
                  ? `消息数 ${traceSummary.request.messagesCount} · history ${traceSummary.request.historyCount} · tools ${traceSummary.request.toolsCount} · recent pet activity ${traceSummary.request.recentPetActivityCount}`
                  : '暂无请求摘要'}
              </span>
            </div>
            <div className="readonly-row">
              <strong>记忆摘要</strong>
              <span>
                {traceSummary
                  ? `injected ${traceSummary.memory.injectedCount} (${traceScopeLabel(traceSummary.memory.injectedScopes)}) · used ${traceSummary.memory.usedCount} (${traceScopeLabel(traceSummary.memory.usedScopes)})`
                  : '暂无记忆注入'}
              </span>
            </div>
            <div className="readonly-row">
              <strong>行为摘要</strong>
              <span>
                {traceSummary
                  ? `intent ${traceSummary.behavior.providerIntent?.intent || 'none'} · final ${traceSummary.behavior.finalDecision?.actionId || 'none'} · display ${traceSummary.result.displayMode || 'auto'}`
                  : '暂无行为结果'}
              </span>
            </div>
            <div className="readonly-row">
              <strong>结果摘要</strong>
              <span>
                {traceSummary
                  ? `reply chars ${traceSummary.result.replyChars} · persisted ${traceSummary.result.persistedMessageCount} · bubble segments ${traceSummary.result.bubbleSegmentCount}`
                  : '暂无结果摘要'}
              </span>
            </div>
          </div>
          <div className="readonly-row" data-testid="ai-bubble-chat-state">
            <strong>默认气泡聊天</strong>
            <span>{petChatState.bubbleChat.visible ? '当前已显示' : '当前未显示'}</span>
          </div>
          <div className="chat-transcript" aria-live="polite">
            {chatMessages.length === 0 ? (
              <div className="empty-chat">暂无对话</div>
            ) : chatMessages.map((message, index) => (
              <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
                <strong>{message.role === 'user' ? 'You' : 'Pet'}</strong>
                <span>{message.content}</span>
              </div>
            ))}
          </div>
          <div className="chat-input-row">
            <textarea
              className="text-input textarea chat-composer"
              value={chatDraft}
              placeholder="说点什么"
              onChange={(event) => setChatDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  onSendChat()
                }
              }}
              disabled={!petChatState.ai.ready || chatting}
            />
            <button type="button" className="primary" onClick={onSendChat} disabled={!chatDraft.trim() || chatting || !petChatState.ai.ready}>
              {chatting ? '发送中' : '发送'}
            </button>
          </div>
        </div>
      </CollapsibleAiSection>
    </section>
  )
}
