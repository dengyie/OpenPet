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
  ChatMessage,
  ImageGenerationConfigViewState,
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

const imageProviderPresets: readonly ImageProviderPreset[] = [
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
    id: 'together',
    title: 'Together',
    description: '云端 OpenAI-compatible 图片网关；默认保留当前模型名，请按 Together 已开通模型调整。',
    baseUrl: 'https://api.together.xyz/v1',
    timeoutMs: 120000,
    maxConcurrentJobs: 1
  },
  {
    id: 'openrouter',
    title: 'OpenRouter',
    description: '云端 OpenAI-compatible 图片网关；默认保留当前模型名，请按 OpenRouter 实际可用模型调整。',
    baseUrl: 'https://openrouter.ai/api/v1',
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
    id: 'openpet-8317-gateway',
    title: 'OpenPet 8317 网关',
    description: '使用当前开发网关，图片默认 gpt-image-2；只填充 Provider 草稿，不覆盖密钥。',
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
    description: '使用官方 OpenAI 聊天接口；API Key 保存在主进程。',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini'
  },
  {
    id: 'lm-studio',
    title: 'LM Studio',
    description: '本地 LM Studio OpenAI-compatible server；默认保留当前模型名，请按已加载模型调整。',
    baseUrl: 'http://127.0.0.1:1234/v1'
  },
  {
    id: 'vllm',
    title: 'vLLM',
    description: '自托管 vLLM OpenAI-compatible server；默认保留当前模型名，请按部署模型调整。',
    baseUrl: 'http://127.0.0.1:8000/v1'
  },
  {
    id: 'openrouter',
    title: 'OpenRouter',
    description: '云端 OpenAI-compatible 聚合网关；默认保留当前模型名，请按路由模型调整。',
    baseUrl: 'https://openrouter.ai/api/v1'
  },
  {
    id: 'together',
    title: 'Together',
    description: '云端 OpenAI-compatible 推理网关；默认保留当前模型名，请按 Together 模型列表调整。',
    baseUrl: 'https://api.together.xyz/v1'
  },
  {
    id: 'local-openai-compatible',
    title: '本地/代理 OpenAI-compatible',
    description: '适合本机网关、反代或局域网模型服务；本地和云端共用同一套 Provider 配置。',
    baseUrl: 'http://127.0.0.1:8317/v1',
    model: 'gpt-4o-mini'
  },
  {
    id: 'openpet-8317-gateway',
    title: 'OpenPet 8317 网关',
    description: '使用当前开发网关，聊天默认 gpt-5.5；只填充 Provider 草稿，不覆盖密钥。',
    baseUrl: 'http://127.0.0.1:8317/v1',
    model: 'gpt-5.5'
  }
] as const

const describeImageModelCompatibility = (model: string) => {
  const normalizedModel = String(model || '').trim()
  if (!normalizedModel) {
    return {
      title: '图片模型兼容提示',
      summary: '填写图片 Model 后，这里会显示透明背景请求的兼容提示。'
    }
  }
  if (normalizedModel === 'gpt-image-2') {
    return {
      title: `${normalizedModel} 透明背景模式`,
      summary: 'Creator Studio 请求透明输出时，不会强制发送 background 参数；由 provider 原生行为决定透明背景能力。'
    }
  }
  return {
    title: `${normalizedModel} OpenAI-compatible 透明背景模式`,
    summary: 'Creator Studio 会按 OpenAI-compatible 方式发送 background=transparent 或 white，并附带 b64_json 输出；请确认当前模型支持 transparent 背景参数。'
  }
}

const describeChatModelCompatibility = (model: string) => {
  const normalizedModel = String(model || '').trim()
  if (!normalizedModel) {
    return {
      title: '聊天模型兼容提示',
      summary: '填写聊天 Model 后，这里会显示当前 OpenAI-compatible 聊天接口的兼容提示。'
    }
  }
  if (normalizedModel === 'gpt-4o-mini') {
    return {
      title: `${normalizedModel} OpenAI 官方兼容模式`,
      summary: '默认按 OpenAI chat/completions 兼容请求发送，适合作为基础联通性测试模型。'
    }
  }
  return {
    title: `${normalizedModel} OpenAI-compatible 聊天模式`,
    summary: 'OpenPet 会按 OpenAI-compatible chat/completions 方式发送 system/user 消息、可选 tools 和 JSON body；请确认当前网关对该模型的字段兼容性。'
  }
}

const renderImageModelDiscovery = (result: ImageGenerationHealthCheckResult | null, currentModel: string) => {
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
        <span>共发现 {discoveredModels.length} 个模型。</span>
        <span>{currentModelIncluded ? '已包含当前模型' : '当前模型未出现在探测列表中'}</span>
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
        <span>当前 Provider 可达，但没有开放 /models；请手动确认模型名称。</span>
      </div>
    )
  }

  return (
    <div className={`provider-feedback ${result.ok ? 'ok' : 'error'}`} data-testid="image-model-discovery">
      <strong>模型列表探测未返回结果</strong>
      <span>{result.message || '本次健康检查没有拿到模型列表。'}</span>
    </div>
  )
}

const renderChatModelDiscovery = (result: AiConnectionTestResult | null, currentModel: string) => {
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
        <span>共发现 {discoveredModels.length} 个模型。</span>
        <span>{currentModelIncluded ? '已包含当前模型' : '当前模型未出现在探测列表中'}</span>
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
        <span>当前 Provider 可达，但没有开放 /models；请手动确认模型名称。</span>
      </div>
    )
  }

  return (
    <div className={`provider-feedback ${result.ok ? 'ok' : 'error'}`} data-testid="chat-model-discovery">
      <strong>模型列表探测未返回结果</strong>
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
  imageProviderValidationError: string
  imageHealthResult: ImageGenerationHealthCheckResult | null
  onChange: (partial: Partial<AiConfigViewState>) => void
  onChangeImageGeneration: (partial: Partial<ImageGenerationConfigViewState>) => void
  onSave: () => void | Promise<void>
  onSaveApiKey: () => void | Promise<void>
  onTest: () => void | Promise<void>
  onSaveImageGeneration: () => void | Promise<void>
  onSavePersonaOverride: () => void | Promise<void>
  onResetPersonaOverride: () => void | Promise<void>
  onGeneratePersonaDraft: () => void | Promise<void>
  onApplyGeneratedPersonaDraft: () => void | Promise<void>
  onDismissGeneratedPersonaDraft: () => void | Promise<void>
  onSaveImageGenerationApiKey: () => void | Promise<void>
  onClearImageGenerationApiKey: () => void | Promise<void>
  onCheckImageGenerationHealth: () => void | Promise<void>
  onSendChat: () => void | Promise<void>
  saving: boolean
  status: string
  connectionStatus: string
  imageHealthStatus: string
  hasUnsavedConfigChanges: boolean
  hasUnsavedApiKeyDraft: boolean
  hasUnsavedImageGenerationChanges: boolean
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
  imageProviderValidationError,
  imageHealthResult,
  onChange,
  onChangeImageGeneration,
  onSave,
  onSaveApiKey,
  onTest,
  onSaveImageGeneration,
  onSavePersonaOverride,
  onResetPersonaOverride,
  onGeneratePersonaDraft,
  onApplyGeneratedPersonaDraft,
  onDismissGeneratedPersonaDraft,
  onSaveImageGenerationApiKey,
  onClearImageGenerationApiKey,
  onCheckImageGenerationHealth,
  onSendChat,
  saving,
  status,
  connectionStatus,
  imageHealthStatus,
  hasUnsavedConfigChanges,
  hasUnsavedApiKeyDraft,
  hasUnsavedImageGenerationChanges,
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
  onReplayBehaviorDecision,
  traceDiagnosticsFilters,
  onChangeTraceDiagnosticsFilters,
  onExportBehaviorDiagnostics,
  onExportAiTalkTraceDiagnostics,
  onClearBehaviorDecisions,
  onRefreshMemoryProfile,
  onDeleteMemory,
  onClearPetPackMemories,
  onOpenDesktopChat
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
  const imageTargetSummary = `${activeImageGenerationConfig.provider} · ${activeImageGenerationConfig.baseUrl} · ${activeImageGenerationConfig.model} · ${activeImageGenerationConfig.hasApiKey ? 'API key saved' : 'API key missing'}`
  const imageModelCompatibility = describeImageModelCompatibility(imageGenerationConfig.model)
  const chatModelCompatibility = describeChatModelCompatibility(config.model)
  const applyChatProviderPreset = (preset: typeof chatProviderPresets[number]) => onChange({
    provider: 'openai-compatible',
    baseUrl: preset.baseUrl,
    ...(preset.model ? { model: preset.model } : {})
  })
  const applyImageProviderPreset = (preset: typeof imageProviderPresets[number]) => onChangeImageGeneration({
    provider: 'openai-compatible',
    baseUrl: preset.baseUrl,
    ...(preset.model ? { model: preset.model } : {}),
    timeoutMs: preset.timeoutMs,
    maxConcurrentJobs: preset.maxConcurrentJobs
  })

  return (
    <section className="pane">
      <header className="pane-header">
        <div>
          <h1>AI</h1>
          <p>聊天 Provider 与模型配置</p>
        </div>
      </header>

      <CollapsibleAiSection title="聊天 Provider" note="OpenAI-compatible 聊天模型配置" defaultOpen>
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
              className="text-input"
              value={config.baseUrl}
              onChange={(event) => onChange({ baseUrl: event.target.value })}
            />
          </label>

          <label className="field-row">
            <span className="field-label">Model</span>
            <input
              className="text-input"
              value={config.model}
              onChange={(event) => onChange({ model: event.target.value })}
            />
          </label>

          <div className="field-row tall">
            <div>
              <div className="field-label">聊天 Provider 预设</div>
              <div className="field-note">预设只填充 Base URL / 可安全默认的 Model；不会读取或覆盖 API Key。</div>
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

        {renderChatModelDiscovery(connectionTestResult, config.model)}

        <div className="provider-feedback" data-testid="chat-model-compatibility">
          <strong>{chatModelCompatibility.title}</strong>
          <span>{chatModelCompatibility.summary}</span>
        </div>

        <div className="section-actions provider-actions-bottom">
          <button type="button" className="ghost" onClick={onTest} disabled={saving}>
            测试已保存配置
          </button>
          <button type="button" className="primary" onClick={onSave} disabled={saveDisabled}>
            {saving ? '保存中' : '保存聊天 Provider'}
          </button>
        </div>
      </CollapsibleAiSection>

      <CollapsibleAiSection title="图片 Provider" note="Creator Studio 生成图片使用的 OpenAI-compatible Provider" defaultOpen>
        <div className="section-actions">
          <button type="button" className="ghost" onClick={onCheckImageGenerationHealth} disabled={saving}>
            检查图片健康
          </button>
          <button type="button" className="primary" onClick={onSaveImageGeneration} disabled={imageSaveDisabled}>
            保存图片 Provider
          </button>
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
            <span>{hasUnsavedImageGenerationChanges ? '图片配置草稿未保存；健康检查使用当前已保存配置。' : '当前没有未保存的图片配置修改'}</span>
          </div>

          <div className="readonly-row">
            <strong>生成边界</strong>
            <span>Creator Studio 只提交提示词和输出目录；Provider 调用、API Key、图片写入都由 OpenPet host 执行。</span>
          </div>

          <div className="field-row tall">
            <div>
              <div className="field-label">图片 Provider 预设</div>
              <div className="field-note">预设只填充 Base URL / 可安全默认的 Model / 超时；不会读取或覆盖 API Key。</div>
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

          {renderImageModelDiscovery(imageHealthResult, imageGenerationConfig.model)}

          <div className="provider-feedback" data-testid="image-model-compatibility">
            <strong>{imageModelCompatibility.title}</strong>
            <span>{imageModelCompatibility.summary}</span>
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

      <CollapsibleAiSection title="聊天" note="用当前已保存 Provider 和宠物对话">
        <div className="chat-panel">
          <div className="chat-meta-bar">
            <div>
              <strong>{petChatState.petPack.displayName || '当前宠物'}</strong>
              <span>
                {petChatState.ai.ready
                  ? `${petChatState.ai.provider} · ${petChatState.ai.model}`
                  : (petChatState.ai.reason || '请先配置 AI Provider')}
              </span>
            </div>
            <button type="button" className="ghost" onClick={onOpenDesktopChat}>
              打开桌面聊天框
            </button>
          </div>
          {petChatState.bubble.text ? (
            <div className="chat-bubble-preview" data-testid="ai-chat-bubble-preview">
              <strong>宠物当前气泡</strong>
              <span>{petChatState.bubble.text}</span>
            </div>
          ) : null}
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
