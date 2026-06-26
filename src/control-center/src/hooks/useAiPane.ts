import { useEffect, useState } from 'react'
import { controlCenterAPI as api } from '../api/control-center-api'
import {
  cloneAiBehavior,
  cloneAiConfig,
  cloneAiMemoryProfile,
  cloneAiPersonaProfile,
  cloneChatMessages,
  cloneImageGenerationConfig,
  clonePetChatState,
  defaultAiConfig,
  defaultAiMemoryProfile,
  defaultAiPersonaProfile,
  defaultImageGenerationConfig,
  defaultPetChatState
} from '../lib/defaults'
import { downloadTextFile } from '../lib/download'
import { messageFromError } from '../lib/errors'
import {
  formatActiveProviderSummary,
  getProviderConfigChanges,
  hasProviderConfigChanges,
  normalizeProviderBaseUrl,
  validateProviderConfig
} from '../lib/ai-provider-config'
import type {
  AiBehaviorConfig,
  AiBehaviorResult,
  AiBehaviorRule,
  AiConfigViewState,
  AiConnectionTestResult,
  AiTalkTraceDiagnosticsFilters,
  AiMemoryProfileViewState,
  AiPersonaDraftViewState,
  AiPersonaOverride,
  AiPersonaProfileViewState,
  ChatMessage,
  ImageGenerationHealthCheckResult,
  ImageGenerationConfigViewState,
  PetChatStateViewState
} from '../../../shared/openpet-contracts'
import type { AiPaneProps } from '../panes/AiPane'

const parseBehaviorRules = (rulesText: string): AiBehaviorRule[] => {
  const parsed: unknown = JSON.parse(rulesText || '[]')
  if (!Array.isArray(parsed)) throw new Error('Behavior rules must be a JSON array')
  return parsed as AiBehaviorRule[]
}

const personaFields = ['name', 'identity', 'tone', 'speakingStyle', 'relationshipToUser', 'actionStyle'] as const
const personaListFields = ['coreTraits', 'boundaries'] as const

const personaToDraft = (override: AiPersonaOverride) => ({
  name: override.name || '',
  identity: override.identity || '',
  tone: override.tone || '',
  speakingStyle: override.speakingStyle || '',
  relationshipToUser: override.relationshipToUser || '',
  actionStyle: override.actionStyle || '',
  coreTraitsText: Array.isArray(override.coreTraits) ? override.coreTraits.join('\n') : '',
  boundariesText: Array.isArray(override.boundaries) ? override.boundaries.join('\n') : ''
})

const normalizePersonaListText = (value: string) => (
  value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
)

const pickImageGenerationComparableFields = (config: ImageGenerationConfigViewState) => JSON.stringify({
  provider: String(config.provider || '').trim(),
  baseUrl: String(config.baseUrl || '').trim(),
  model: String(config.model || '').trim(),
  timeoutMs: Number(config.timeoutMs || 0),
  maxConcurrentJobs: Number(config.maxConcurrentJobs || 0),
  hasApiKey: Boolean(config.hasApiKey)
})

const validateImageProviderConfig = (config: ImageGenerationConfigViewState): string => {
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

const buildAiConfigSavePayload = (config: AiConfigViewState, activeConfig: AiConfigViewState) => {
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

const buildPersonaOverrideFromDraft = (draft: ReturnType<typeof personaToDraft>): AiPersonaOverride => {
  const override: AiPersonaOverride = {}
  for (const field of personaFields) {
    const value = draft[field].trim()
    if (value) override[field] = value
  }
  const coreTraits = normalizePersonaListText(draft.coreTraitsText)
  const boundaries = normalizePersonaListText(draft.boundariesText)
  if (coreTraits.length) override.coreTraits = coreTraits
  if (boundaries.length) override.boundaries = boundaries
  return override
}

const formatConnectionStatus = ({
  result,
  hasUnsavedConfigChanges,
  hasUnsavedApiKeyDraft
}: {
  result: AiConnectionTestResult
  hasUnsavedConfigChanges: boolean
  hasUnsavedApiKeyDraft: boolean
}) => {
  const context = `${result.provider} · ${result.baseUrl} · ${result.model} · ${result.elapsedMs}ms`
  const notice = (hasUnsavedConfigChanges || hasUnsavedApiKeyDraft)
    ? '当前存在未保存修改；本次测试使用已保存配置。'
    : ''
  const localizedMessage = String(result.message || '')
    .replace(/^AI API key is not configured$/, '聊天 API Key 未配置')
    .replace(/^AI provider rejected the API key$/, '聊天 Provider 拒绝了当前 API Key')
    .replace(/^AI provider endpoint or model was not found$/, '聊天 Provider 的接口或模型不存在')
    .replace(/^AI provider rate limit exceeded$/, '聊天 Provider 已触发限流')
    .replace(/^AI provider is temporarily unavailable$/, '聊天 Provider 暂时不可用')
    .replace(/^AI provider returned an error response$/, '聊天 Provider 返回了错误响应')
    .replace(/^AI provider connection test succeeded$/, '聊天 Provider 连接测试通过')
  if (result.ok && result.modelsProbe === 'ok' && result.currentModelDiscovered === false) {
    const mismatch = `聊天 Provider 可达，但当前保存的聊天 Model 未出现在 /models 返回列表中；请手动确认模型名称或网关映射。`
    return notice ? `${notice} ${mismatch}` : mismatch
  }
  if (result.ok && result.modelsProbe === 'unavailable') {
    const unavailable = '聊天 Provider 可达，但模型列表探测不可用；请手动确认模型名称。'
    return notice ? `${notice} ${unavailable}` : unavailable
  }
  const details = result.ok
    ? `连接正常：${context}${result.reply ? ` · ${result.reply}` : ''}`
    : `连接失败：${localizedMessage || result.code || 'Unknown error'} · ${context}`
  return notice ? `${notice} ${details}` : details
}

const validateAiConfigDraft = (config: AiConfigViewState) => {
  const model = String(config.model || '').trim()
  const baseUrl = String(config.baseUrl || '').trim()
  if (!model) throw new Error('Model 不能为空')
  if (!baseUrl) throw new Error('Base URL 不能为空')
  let parsed
  try {
    parsed = new URL(baseUrl)
  } catch (_) {
    throw new Error('Base URL 必须是有效的 HTTP 或 HTTPS 地址')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Base URL 必须使用 HTTP 或 HTTPS')
  }
}

const formatImageGenerationHealthStatus = (result: ImageGenerationHealthCheckResult) => {
  const label = '图片 Provider'
  const message = String(result.message || result.code || '')
    .replace(/^Cloud image generation API key is missing$/, 'Image generation API key is missing')
    .replace(/^Image generation API key is missing$/, '图片 API Key 未配置')
    .replace(/^Cloud provider is reachable, but the optional \/models probe is unavailable$/, 'provider 可达，但模型列表探测不可用')
    .replace(/^Image Provider is reachable, but the optional \/models probe is unavailable$/, 'provider 可达，但模型列表探测不可用')
  if (result.ok && result.modelsProbe === 'ok' && result.currentModelDiscovered === false) {
    return `${label} 可达，但当前保存的图片 Model 未出现在 /models 返回列表中；请手动确认模型名称或网关映射。`
  }
  if (result.ok) {
    if (result.code === 'provider_reachable_models_unavailable') {
      return `${label} 可达，但模型列表探测不可用；可继续尝试生成。`
    }
    return `${label} 健康检查通过：${message}`
  }
  return `${label} 健康检查失败：${message}`
}

export function useAiPane(activeTab = 'ai') {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<AiConfigViewState>(defaultAiConfig)
  const [activeConfig, setActiveConfig] = useState<AiConfigViewState>(defaultAiConfig)
  const [personaProfile, setPersonaProfile] = useState<AiPersonaProfileViewState>(defaultAiPersonaProfile)
  const [memoryProfile, setMemoryProfile] = useState<AiMemoryProfileViewState>(defaultAiMemoryProfile)
  const [personaDraft, setPersonaDraft] = useState(() => personaToDraft(defaultAiPersonaProfile.overridePersona))
  const [personaGenerationInstruction, setPersonaGenerationInstruction] = useState('')
  const [generatedPersonaDraft, setGeneratedPersonaDraft] = useState<AiPersonaDraftViewState | null>(null)
  const [imageGenerationConfig, setImageGenerationConfig] = useState<ImageGenerationConfigViewState>(defaultImageGenerationConfig)
  const [activeImageGenerationConfig, setActiveImageGenerationConfig] = useState<ImageGenerationConfigViewState>(defaultImageGenerationConfig)
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [imageApiKeyDraft, setImageApiKeyDraft] = useState('')
  const [status, setStatus] = useState('')
  const [connectionStatus, setConnectionStatus] = useState('')
  const [connectionTestResult, setConnectionTestResult] = useState<AiConnectionTestResult | null>(null)
  const [imageHealthStatus, setImageHealthStatus] = useState('')
  const [imageHealthResult, setImageHealthResult] = useState<ImageGenerationHealthCheckResult | null>(null)
  const [chatDraft, setChatDraft] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [petChatState, setPetChatState] = useState<PetChatStateViewState>(defaultPetChatState)
  const [traceDiagnosticsFilters, setTraceDiagnosticsFilters] = useState<AiTalkTraceDiagnosticsFilters>({})
  const [chatting, setChatting] = useState(false)
  const [behavior, setBehavior] = useState<AiBehaviorConfig>(defaultAiConfig.behavior)
  const [behaviorRulesText, setBehaviorRulesText] = useState('[]')
  const [dryRunText, setDryRunText] = useState('')
  const [dryRunResult, setDryRunResult] = useState<AiBehaviorResult | null>(null)
  const [replayDraft, setReplayDraft] = useState('')
  const [replayResult, setReplayResult] = useState<AiBehaviorResult | null>(null)

  const loadPersonaProfile = async () => {
    const profile = cloneAiPersonaProfile(await api.getAiPersonaProfile())
    setPersonaProfile(profile)
    setPersonaDraft(personaToDraft(profile.overridePersona))
    setGeneratedPersonaDraft((current) => (current?.petPackId === profile.petPackId ? current : null))
    return profile
  }

  const loadMemoryProfile = async () => {
    const profile = cloneAiMemoryProfile(await api.getAiMemoryProfile())
    setMemoryProfile(profile)
    return profile
  }

  const applyPetChatState = (state: PetChatStateViewState) => {
    const nextState = clonePetChatState(state)
    setPetChatState(nextState)
    setChatMessages(nextState.messages)
    return nextState
  }

  const loadPetChatState = async () => applyPetChatState(await api.getPetChatState())

  const loadBehavior = async () => {
    const nextBehavior = cloneAiBehavior(await api.getAiBehavior())
    setBehavior(nextBehavior)
    setBehaviorRulesText(JSON.stringify(nextBehavior.rules || [], null, 2))
    setConfig((current) => ({ ...current, behavior: nextBehavior }))
    return nextBehavior
  }

  const refreshActivePetPackAiContext = async (reason = 'refresh') => {
    const [profile, memory, state, nextBehavior] = await Promise.all([
      api.getAiPersonaProfile(),
      api.getAiMemoryProfile(),
      api.getPetChatState(),
      api.getAiBehavior()
    ])
    const nextPersonaProfile = cloneAiPersonaProfile(profile)
    setPersonaProfile(nextPersonaProfile)
    setPersonaDraft(personaToDraft(nextPersonaProfile.overridePersona))
    setGeneratedPersonaDraft((current) => (current?.petPackId === nextPersonaProfile.petPackId ? current : null))
    setMemoryProfile(cloneAiMemoryProfile(memory))
    applyPetChatState(state)
    const behaviorConfig = cloneAiBehavior(nextBehavior)
    setBehavior(behaviorConfig)
    setBehaviorRulesText(JSON.stringify(behaviorConfig.rules || [], null, 2))
    setConfig((current) => ({ ...current, behavior: behaviorConfig }))
    if (reason === 'active-pet-pack-changed') {
      setStatus(`已切换到 ${nextPersonaProfile.petPackDisplayName || nextPersonaProfile.petPackId} 的 AI 上下文`)
    }
  }

  useEffect(() => {
    let mounted = true
    Promise.all([
      api.getAiConfig(),
      api.getAiPersonaProfile(),
      api.getAiMemoryProfile(),
      api.getImageGenerationConfig(),
      api.getPetChatState(),
      api.getAiBehavior()
    ]).then(([loadedConfig, loadedPersonaProfile, loadedMemoryProfile, loadedImageGenerationConfig, loadedPetChatState, loadedBehavior]) => {
      if (!mounted) return
      const nextConfig = cloneAiConfig(loadedConfig)
      setConfig(nextConfig)
      setActiveConfig(nextConfig)
      const nextPersonaProfile = cloneAiPersonaProfile(loadedPersonaProfile)
      setPersonaProfile(nextPersonaProfile)
      setPersonaDraft(personaToDraft(nextPersonaProfile.overridePersona))
      setMemoryProfile(cloneAiMemoryProfile(loadedMemoryProfile))
      const nextImageGenerationConfig = cloneImageGenerationConfig(loadedImageGenerationConfig)
      setImageGenerationConfig(nextImageGenerationConfig)
      setActiveImageGenerationConfig(nextImageGenerationConfig)
      applyPetChatState(loadedPetChatState)
      const nextBehavior = cloneAiBehavior(loadedBehavior || loadedConfig?.behavior)
      setBehavior(nextBehavior)
      setBehaviorRulesText(JSON.stringify(nextBehavior.rules || [], null, 2))
      setLoading(false)
    }).catch((error) => {
      if (!mounted) return
      setStatus(messageFromError(error, 'AI 配置加载失败'))
      setLoading(false)
    })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (activeTab !== 'ai') return
    void refreshActivePetPackAiContext('tab-active').catch(() => {})
  }, [activeTab])

  useEffect(() => {
    if (typeof api.onActivePetPackChanged !== 'function') return undefined
    return api.onActivePetPackChanged((event) => {
      if (event?.petChatState) applyPetChatState(event.petChatState)
      void refreshActivePetPackAiContext('active-pet-pack-changed').catch((error) => {
        setStatus(messageFromError(error, '刷新当前宠物 AI 上下文失败'))
      })
    })
  }, [])

  const saveProviderConfigDraft = async () => {
    const validationError = validateProviderConfig(config)
    if (validationError) throw new Error(validationError)
    const changedFields = getProviderConfigChanges(config, activeConfig)
    const savedConfig = cloneAiConfig(await api.saveAiConfig(buildAiConfigSavePayload(config, activeConfig)))
    setConfig(savedConfig)
    setActiveConfig(savedConfig)
    return { savedConfig, changedFields }
  }

  const saveApiKeyDraft = async () => {
    const key = apiKeyDraft.trim()
    if (!key) {
      if (apiKeyDraft) throw new Error('API Key 不能为空')
      return null
    }
    const result = await api.saveAiApiKey(key)
    setConfig((current) => ({ ...current, apiKeyRef: result.apiKeyRef, hasApiKey: result.hasApiKey }))
    setActiveConfig((current) => ({ ...current, apiKeyRef: result.apiKeyRef, hasApiKey: result.hasApiKey }))
    setApiKeyDraft('')
    return result
  }

  const hasUnsavedConfigChanges = hasProviderConfigChanges(config, activeConfig)
  const hasUnsavedApiKeyDraft = Boolean(apiKeyDraft.trim())
  const hasUnsavedImageGenerationChanges = pickImageGenerationComparableFields(imageGenerationConfig) !== pickImageGenerationComparableFields(activeImageGenerationConfig)

  const onSave = async () => {
    setSaving(true)
    setStatus('')
    setConnectionStatus('保存聊天 Provider 中')
    try {
      const { changedFields } = await saveProviderConfigDraft()
      await loadPetChatState()
      setConnectionTestResult(null)
      setConnectionStatus(changedFields.length ? `AI 配置已保存：${changedFields.join(' / ')}` : 'AI 配置已保存')
    } catch (error) {
      setConnectionStatus(messageFromError(error, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  const onSaveImageGeneration = async () => {
    setSaving(true)
    setStatus('')
    setImageHealthStatus('')
    setImageHealthResult(null)
    try {
      const validationError = validateImageProviderConfig(imageGenerationConfig)
      if (validationError) throw new Error(validationError)
      const savedConfig = cloneImageGenerationConfig(await api.saveImageGenerationConfig(imageGenerationConfig))
      setImageGenerationConfig(savedConfig)
      setActiveImageGenerationConfig(savedConfig)
      setStatus('图片 Provider 配置已保存')
    } catch (error) {
      setStatus(messageFromError(error, '图片 Provider 配置保存失败'))
    } finally {
      setSaving(false)
    }
  }

  const onSaveBehavior = async () => {
    setSaving(true)
    setStatus('')
    try {
      const parsedRules = parseBehaviorRules(behaviorRulesText)
      const savedBehavior = cloneAiBehavior(await api.saveAiBehavior({ ...behavior, rules: parsedRules }))
      setBehavior(savedBehavior)
      setBehaviorRulesText(JSON.stringify(savedBehavior.rules || [], null, 2))
      setConfig({ ...config, behavior: savedBehavior })
      setStatus('Behavior 配置已保存')
    } catch (error) {
      setStatus(messageFromError(error, 'Behavior 配置保存失败'))
    } finally {
      setSaving(false)
    }
  }

  const onDryRunBehavior = async () => {
    const reply = dryRunText.trim()
    if (!reply) return
    setStatus('')
    try {
      const parsedRules = parseBehaviorRules(behaviorRulesText)
      const result = await api.dryRunAiBehavior({ reply, behavior: { ...behavior, rules: parsedRules } })
      setDryRunResult(result)
      setStatus(result.matched ? `Dry run 命中：${result.reason}` : `Dry run 未命中：${result.reason}`)
    } catch (error) {
      setDryRunResult(null)
      setStatus(messageFromError(error, 'Dry run 失败'))
    }
  }

  const onReplayBehaviorDecision = async () => {
    const decisionId = Number(replayDraft.trim())
    if (!Number.isFinite(decisionId) || decisionId <= 0) {
      setStatus('请输入有效的决策 ID')
      return
    }
    setStatus('')
    try {
      const result = await api.replayAiBehaviorDecision(decisionId)
      setReplayResult(result)
      setStatus(result.matched ? `Replay 命中：${result.reason}` : `Replay 未命中：${result.reason}`)
    } catch (error) {
      setReplayResult(null)
      setStatus(messageFromError(error, 'Replay 失败'))
    }
  }

  const onExportBehaviorDiagnostics = async () => {
    setStatus('')
    try {
      const content = await api.exportAiBehaviorDiagnostics()
      downloadTextFile('openpet-ai-behavior-diagnostics.json', content, 'application/json;charset=utf-8')
      setStatus('Behavior 诊断已导出')
    } catch (error) {
      setStatus(messageFromError(error, 'Behavior 诊断导出失败'))
    }
  }

  const onClearBehaviorDecisions = async () => {
    if (!window.confirm('清空 AI 行为决策记录？')) return
    setStatus('')
    try {
      await api.clearAiBehaviorDecisions()
      await loadBehavior()
      setReplayResult(null)
      setDryRunResult(null)
      setStatus('Behavior 决策已清空')
    } catch (error) {
      setStatus(messageFromError(error, '清空失败'))
    }
  }

  const onSaveApiKey = async () => {
    setSaving(true)
    setStatus('')
    setConnectionStatus('保存 API Key 中')
    try {
      const result = await saveApiKeyDraft()
      if (!result) {
        setConnectionStatus('API Key 未修改')
      } else {
        await loadPetChatState()
        setConnectionStatus(result.updatedAt ? `API Key 已保存 · ${new Date(result.updatedAt).toLocaleString()}` : 'API Key 已保存')
      }
    } catch (error) {
      setConnectionStatus(messageFromError(error, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  const onSaveImageGenerationApiKey = async () => {
    setSaving(true)
    setStatus('')
    setImageHealthStatus('')
    setImageHealthResult(null)
    try {
      const key = imageApiKeyDraft.trim()
      if (!key) throw new Error('图片 API Key 不能为空')
      const result = await api.saveImageGenerationApiKey(key)
      const applyKeyResult = (current: ImageGenerationConfigViewState) => cloneImageGenerationConfig({
        ...current,
        hasApiKey: result.hasApiKey,
        apiKeyPreview: result.apiKeyPreview
      })
      setImageGenerationConfig(applyKeyResult)
      setActiveImageGenerationConfig(applyKeyResult)
      setImageApiKeyDraft('')
      setStatus('图片 API Key 已保存')
    } catch (error) {
      setStatus(messageFromError(error, '图片 API Key 保存失败'))
    } finally {
      setSaving(false)
    }
  }

  const onClearImageGenerationApiKey = async () => {
    setSaving(true)
    setStatus('')
    setImageHealthStatus('')
    setImageHealthResult(null)
    try {
      const result = await api.clearImageGenerationApiKey()
      const applyKeyResult = (current: ImageGenerationConfigViewState) => cloneImageGenerationConfig({
        ...current,
        hasApiKey: result.hasApiKey,
        apiKeyPreview: result.apiKeyPreview
      })
      setImageGenerationConfig(applyKeyResult)
      setActiveImageGenerationConfig(applyKeyResult)
      setImageApiKeyDraft('')
      setStatus('图片 API Key 已清除')
    } catch (error) {
      setStatus(messageFromError(error, '图片 API Key 清除失败'))
    } finally {
      setSaving(false)
    }
  }

  const onCheckImageGenerationHealth = async () => {
    if (hasUnsavedImageGenerationChanges) {
      setImageHealthStatus('当前图片 Provider 配置有未保存修改；请先保存图片配置后再检查健康。')
      setImageHealthResult(null)
      return
    }
    setSaving(true)
    setImageHealthStatus('图片 Provider 健康检查中')
    setImageHealthResult(null)
    try {
      const result = await api.checkImageGenerationHealth({})
      setImageHealthResult(result)
      setImageHealthStatus(formatImageGenerationHealthStatus(result))
    } catch (error) {
      setImageHealthResult(null)
      setImageHealthStatus(messageFromError(error, '图片模型健康检查失败'))
    } finally {
      setSaving(false)
    }
  }

  const onTest = async () => {
    setSaving(true)
    setConnectionStatus('测试中')
    setConnectionTestResult(null)
    try {
      const result = await api.testAiConnection()
      setConnectionTestResult(result)
      setConnectionStatus(formatConnectionStatus({
        result,
        hasUnsavedConfigChanges,
        hasUnsavedApiKeyDraft
      }))
    } catch (error) {
      setConnectionTestResult(null)
      setConnectionStatus(messageFromError(error, '连接失败'))
    } finally {
      setSaving(false)
    }
  }

  const onChangePersonaDraft = (partial: Partial<typeof personaDraft>) => {
    setPersonaDraft((current) => ({ ...current, ...partial }))
  }

  const onResetPersonaOverride = async () => {
    setSaving(true)
    setStatus('')
    try {
      const profile = cloneAiPersonaProfile(await api.saveAiPersonaOverride({}))
      setPersonaProfile(profile)
      setPersonaDraft(personaToDraft(profile.overridePersona))
      setGeneratedPersonaDraft(null)
      setStatus('宠物人格 override 已清空')
    } catch (error) {
      setStatus(messageFromError(error, '宠物人格重置失败'))
    } finally {
      setSaving(false)
    }
  }

  const onSavePersonaOverride = async () => {
    setSaving(true)
    setStatus('')
    try {
      const profile = cloneAiPersonaProfile(await api.saveAiPersonaOverride(buildPersonaOverrideFromDraft(personaDraft)))
      setPersonaProfile(profile)
      setPersonaDraft(personaToDraft(profile.overridePersona))
      setGeneratedPersonaDraft(null)
      setStatus('宠物人格 override 已保存')
    } catch (error) {
      setStatus(messageFromError(error, '宠物人格保存失败'))
    } finally {
      setSaving(false)
    }
  }

  const onGeneratePersonaDraft = async () => {
    setSaving(true)
    setStatus('')
    try {
      const draft = await api.generateAiPersonaDraft({ instruction: personaGenerationInstruction })
      setGeneratedPersonaDraft(draft)
      setStatus('宠物人格草稿已生成，确认后才会写入本地 override')
    } catch (error) {
      setGeneratedPersonaDraft(null)
      setStatus(messageFromError(error, '宠物人格生成失败'))
    } finally {
      setSaving(false)
    }
  }

  const onApplyGeneratedPersonaDraft = async () => {
    if (!generatedPersonaDraft) return
    if (generatedPersonaDraft.petPackId !== personaProfile.petPackId) {
      setGeneratedPersonaDraft(null)
      setStatus('人格草稿已过期，请为当前宠物包重新生成')
      return
    }
    setSaving(true)
    setStatus('')
    try {
      const profile = cloneAiPersonaProfile(await api.saveAiPersonaOverride(generatedPersonaDraft.draftPersona))
      setPersonaProfile(profile)
      setPersonaDraft(personaToDraft(profile.overridePersona))
      setGeneratedPersonaDraft(null)
      setStatus('宠物人格草稿已应用')
    } catch (error) {
      setStatus(messageFromError(error, '应用人格草稿失败'))
    } finally {
      setSaving(false)
    }
  }

  const onRefreshMemoryProfile = async () => {
    setStatus('长期记忆刷新中')
    try {
      await loadMemoryProfile()
      setStatus('长期记忆已刷新')
    } catch (error) {
      setStatus(messageFromError(error, '长期记忆刷新失败'))
    }
  }

  const onDeleteMemory = async (memoryId: string) => {
    if (!memoryId) return
    setSaving(true)
    setStatus('删除长期记忆中')
    try {
      const profile = cloneAiMemoryProfile(await api.deleteAiMemory(memoryId))
      setMemoryProfile(profile)
      setStatus('长期记忆已删除')
    } catch (error) {
      setStatus(messageFromError(error, '长期记忆删除失败'))
    } finally {
      setSaving(false)
    }
  }

  const onClearPetPackMemories = async () => {
    if (!window.confirm(`清空 ${memoryProfile.petPackDisplayName} 的宠物关系记忆？全局用户记忆不会被清空。`)) return
    setSaving(true)
    setStatus('清空当前宠物关系记忆中')
    try {
      const profile = cloneAiMemoryProfile(await api.clearAiPetPackMemories())
      setMemoryProfile(profile)
      setStatus('当前宠物关系记忆已清空')
    } catch (error) {
      setStatus(messageFromError(error, '清空宠物关系记忆失败'))
    } finally {
      setSaving(false)
    }
  }

  const onSendChat = async () => {
    const message = chatDraft.trim()
    if (!message || chatting) return
    if (!petChatState.ai.ready) {
      setStatus(petChatState.ai.reason || '请先配置 AI Provider')
      return
    }
    const nextMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: message }]
    setChatMessages(nextMessages)
    setPetChatState((current) => clonePetChatState({ ...current, messages: nextMessages }))
    setChatDraft('')
    setChatting(true)
    setStatus('')
    try {
      const result = await api.sendPetChatMessage({ message, entrypoint: 'control-center' })
      const fallbackMessages: ChatMessage[] = Array.isArray(result.messages)
        ? cloneChatMessages(result.messages)
        : [...nextMessages, { role: 'assistant', content: result.reply }]
      const nextState = result.state
        ? clonePetChatState(result.state)
        : clonePetChatState({ ...petChatState, messages: fallbackMessages, bubble: result.bubble })
      setPetChatState(nextState)
      setChatMessages(nextState.messages.length
        ? nextState.messages
        : fallbackMessages)
      if (result.action?.actionId) {
        setStatus(result.action.error
          ? `动作触发失败：${result.action.error}`
          : `已触发动作：${result.action.label || result.action.actionId}`)
      }
      await loadBehavior()
      void loadMemoryProfile().catch(() => {})
    } catch (error) {
      setStatus(messageFromError(error, '发送失败'))
    } finally {
      setChatting(false)
    }
  }

  const onOpenDesktopChat = async () => {
    try {
      const nextState = clonePetChatState(await api.openPetChatWindow())
      setPetChatState(nextState)
      setStatus('已打开桌面聊天框')
    } catch (error) {
      setStatus(messageFromError(error, '打开桌面聊天框失败'))
    }
  }

  const onExportAiTalkTraceDiagnostics = async () => {
    setStatus('')
    try {
      const content = await api.exportAiTalkTraceDiagnostics({
        petPackId: String(traceDiagnosticsFilters.petPackId || '').trim(),
        conversationId: String(traceDiagnosticsFilters.conversationId || '').trim()
      })
      downloadTextFile('openpet-ai-talk-trace-diagnostics.json', content, 'application/json;charset=utf-8')
      setStatus('AI Talk Trace 已导出')
    } catch (error) {
      setStatus(messageFromError(error, 'AI Talk Trace 导出失败'))
    }
  }

  const paneProps = {
    config,
    activeConfig,
    imageGenerationConfig,
    activeImageGenerationConfig,
    personaProfile,
    memoryProfile,
    personaDraft,
    providerConfigDirty: hasProviderConfigChanges(config, activeConfig),
    providerConfigChanges: getProviderConfigChanges(config, activeConfig),
    activeProviderSummary: formatActiveProviderSummary(activeConfig),
    providerConfigValidationError: validateProviderConfig(config),
    connectionTestResult,
    imageProviderValidationError: validateImageProviderConfig(imageGenerationConfig),
    saving,
    status,
    connectionStatus,
    imageHealthStatus,
    imageHealthResult,
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
    dryRunText,
    dryRunResult,
    replayDraft,
    replayResult,
    traceDiagnosticsFilters,
    setDryRunText,
    setReplayDraft,
    setBehaviorRulesText,
    onChangeBehavior: (partial: Partial<AiBehaviorConfig>) => setBehavior({ ...behavior, ...partial }),
    onChange: (partial: Partial<AiConfigViewState>) => setConfig({ ...config, ...partial }),
    onChangeImageGeneration: (partial: Partial<ImageGenerationConfigViewState>) => setImageGenerationConfig((current) => cloneImageGenerationConfig({
      ...current,
      ...partial
    })),
    onSave,
    onSaveImageGeneration,
    onSavePersonaOverride,
    onResetPersonaOverride,
    onGeneratePersonaDraft,
    onApplyGeneratedPersonaDraft,
    onDismissGeneratedPersonaDraft: () => setGeneratedPersonaDraft(null),
    onSaveBehavior,
    onSaveApiKey,
    onSaveImageGenerationApiKey,
    onClearImageGenerationApiKey,
    onCheckImageGenerationHealth,
    onTest,
    onDryRunBehavior,
    onReplayBehaviorDecision,
    onChangeTraceDiagnosticsFilters: (partial: AiTalkTraceDiagnosticsFilters) => setTraceDiagnosticsFilters({
      petPackId: String(partial.petPackId || '').trim(),
      conversationId: String(partial.conversationId || '').trim()
    }),
    onExportBehaviorDiagnostics,
    onExportAiTalkTraceDiagnostics,
    onClearBehaviorDecisions,
    onRefreshMemoryProfile,
    onDeleteMemory,
    onClearPetPackMemories,
    onSendChat,
    onOpenDesktopChat
  } satisfies AiPaneProps

  return { loading, paneProps }
}
