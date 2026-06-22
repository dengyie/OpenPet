import { useEffect, useState } from 'react'
import { controlCenterAPI as api } from '../api/control-center-api'
import {
  cloneAiBehavior,
  cloneAiConfig,
  cloneAiPersonaProfile,
  cloneChatMessages,
  cloneImageGenerationConfig,
  defaultAiConfig,
  defaultAiPersonaProfile,
  defaultImageGenerationConfig
} from '../lib/defaults'
import { downloadTextFile } from '../lib/download'
import { messageFromError } from '../lib/errors'
import type {
  AiBehaviorConfig,
  AiBehaviorResult,
  AiBehaviorRule,
  AiConfigViewState,
  AiConnectionTestResult,
  AiPersonaDraftViewState,
  AiPersonaOverride,
  AiPersonaProfileViewState,
  ChatMessage,
  ImageGenerationConfigViewState
} from '../../../shared/openpet-contracts'
import type { AiPaneProps } from '../panes/AiPane'

const parseBehaviorRules = (rulesText: string): AiBehaviorRule[] => {
  const parsed: unknown = JSON.parse(rulesText || '[]')
  if (!Array.isArray(parsed)) throw new Error('Behavior rules must be a JSON array')
  return parsed as AiBehaviorRule[]
}

const normalizeProviderBaseUrl = (value: string) => value.trim().replace(/\/+$/, '')

const validateProviderConfig = (config: AiConfigViewState): string => {
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

const hasProviderConfigChanges = (draft: AiConfigViewState, active: AiConfigViewState) => (
  draft.enabled !== active.enabled ||
  draft.provider !== active.provider ||
  normalizeProviderBaseUrl(draft.baseUrl) !== normalizeProviderBaseUrl(active.baseUrl) ||
  draft.model.trim() !== active.model.trim() ||
  draft.systemPrompt !== active.systemPrompt ||
  Boolean(draft.memory?.enabled) !== Boolean(active.memory?.enabled)
)

const formatConnectionTestStatus = (result: AiConnectionTestResult) => (
  result.ok
    ? `连接测试通过：${result.model} · ${result.elapsedMs}ms`
    : `连接测试失败：${result.message || result.code || 'unknown'}`
)

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

export function useAiPane(activeTab = 'ai') {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<AiConfigViewState>(defaultAiConfig)
  const [activeConfig, setActiveConfig] = useState<AiConfigViewState>(defaultAiConfig)
  const [personaProfile, setPersonaProfile] = useState<AiPersonaProfileViewState>(defaultAiPersonaProfile)
  const [personaDraft, setPersonaDraft] = useState(() => personaToDraft(defaultAiPersonaProfile.overridePersona))
  const [personaGenerationInstruction, setPersonaGenerationInstruction] = useState('')
  const [generatedPersonaDraft, setGeneratedPersonaDraft] = useState<AiPersonaDraftViewState | null>(null)
  const [imageGenerationConfig, setImageGenerationConfig] = useState<ImageGenerationConfigViewState>(defaultImageGenerationConfig)
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [imageApiKeyDraft, setImageApiKeyDraft] = useState('')
  const [status, setStatus] = useState('')
  const [connectionTestResult, setConnectionTestResult] = useState<AiConnectionTestResult | null>(null)
  const [chatDraft, setChatDraft] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
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

  useEffect(() => {
    let mounted = true
    Promise.all([
      api.getAiConfig(),
      api.getAiPersonaProfile(),
      api.getImageGenerationConfig(),
      api.getAiConversation('control-center'),
      api.getAiBehavior()
    ]).then(([loadedConfig, loadedPersonaProfile, loadedImageGenerationConfig, loadedChatMessages, loadedBehavior]) => {
      if (!mounted) return
      const nextConfig = cloneAiConfig(loadedConfig)
      setConfig(nextConfig)
      setActiveConfig(nextConfig)
      const nextPersonaProfile = cloneAiPersonaProfile(loadedPersonaProfile)
      setPersonaProfile(nextPersonaProfile)
      setPersonaDraft(personaToDraft(nextPersonaProfile.overridePersona))
      setImageGenerationConfig(cloneImageGenerationConfig(loadedImageGenerationConfig))
      setChatMessages(cloneChatMessages(loadedChatMessages))
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
    void loadPersonaProfile().catch(() => {})
  }, [activeTab])

  const saveProviderConfigDraft = async () => {
    const validationError = validateProviderConfig(config)
    if (validationError) throw new Error(validationError)
    const configToSave = {
      enabled: config.enabled,
      provider: config.provider,
      baseUrl: normalizeProviderBaseUrl(config.baseUrl),
      model: config.model.trim(),
      apiKeyRef: config.apiKeyRef,
      systemPrompt: config.systemPrompt,
      memory: config.memory
    }
    const savedConfig = cloneAiConfig(await api.saveAiConfig(configToSave))
    setConfig(savedConfig)
    setActiveConfig(savedConfig)
    return savedConfig
  }

  const saveApiKeyDraft = async () => {
    const key = apiKeyDraft.trim()
    if (!key) {
      if (apiKeyDraft) throw new Error('API Key 不能为空')
      return null
    }
    const result = await api.saveAiApiKey(key)
    setConfig((current) => ({ ...current, hasApiKey: result.hasApiKey }))
    setActiveConfig((current) => ({ ...current, hasApiKey: result.hasApiKey }))
    setApiKeyDraft('')
    return result
  }

  const onSave = async () => {
    setSaving(true)
    setStatus('')
    try {
      await saveProviderConfigDraft()
      setConnectionTestResult(null)
      setStatus('AI 配置已保存')
    } catch (error) {
      setStatus(messageFromError(error, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  const onSaveImageGeneration = async () => {
    setSaving(true)
    setStatus('')
    try {
      const savedConfig = cloneImageGenerationConfig(await api.saveImageGenerationConfig(imageGenerationConfig))
      setImageGenerationConfig(savedConfig)
      setStatus('图片生成配置已保存')
    } catch (error) {
      setStatus(messageFromError(error, '图片生成配置保存失败'))
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
      const nextBehavior = cloneAiBehavior(await api.getAiBehavior())
      setBehavior(nextBehavior)
      setConfig({ ...config, behavior: nextBehavior })
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
    try {
      await saveApiKeyDraft()
      setStatus('API Key 已保存')
    } catch (error) {
      setStatus(messageFromError(error, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  const onSaveImageGenerationApiKey = async () => {
    setSaving(true)
    setStatus('')
    try {
      const result = await api.saveImageGenerationApiKey(imageApiKeyDraft)
      setImageGenerationConfig((current) => ({
        ...current,
        cloud: {
          ...current.cloud,
          hasApiKey: result.hasApiKey,
          apiKeyPreview: result.apiKeyPreview
        }
      }))
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
    try {
      const result = await api.clearImageGenerationApiKey()
      setImageGenerationConfig((current) => ({
        ...current,
        cloud: {
          ...current.cloud,
          hasApiKey: result.hasApiKey,
          apiKeyPreview: result.apiKeyPreview
        }
      }))
      setImageApiKeyDraft('')
      setStatus('图片 API Key 已清除')
    } catch (error) {
      setStatus(messageFromError(error, '图片 API Key 清除失败'))
    } finally {
      setSaving(false)
    }
  }

  const onCheckImageGenerationHealth = async () => {
    setSaving(true)
    setStatus('')
    try {
      const result = await api.checkImageGenerationHealth({ backend: imageGenerationConfig.defaultBackend })
      setStatus(result.ok ? '图片模型健康检查通过' : (result.message || '图片模型健康检查失败'))
    } catch (error) {
      setStatus(messageFromError(error, '图片模型健康检查失败'))
    } finally {
      setSaving(false)
    }
  }

  const onTest = async () => {
    setSaving(true)
    setStatus(hasProviderConfigChanges(config, activeConfig)
      ? '测试当前已保存配置；未保存草稿不会参与本次测试'
      : '测试中')
    setConnectionTestResult(null)
    try {
      const result = await api.testAiConnection()
      setConnectionTestResult(result)
      setStatus(formatConnectionTestStatus(result))
    } catch (error) {
      setStatus(messageFromError(error, '连接失败'))
    } finally {
      setSaving(false)
    }
  }

  const onSaveAndTest = async () => {
    setSaving(true)
    setStatus('保存并测试中')
    setConnectionTestResult(null)
    try {
      await saveProviderConfigDraft()
      await saveApiKeyDraft()
      const result = await api.testAiConnection()
      setConnectionTestResult(result)
      setStatus(formatConnectionTestStatus(result))
    } catch (error) {
      setStatus(messageFromError(error, '保存并测试失败'))
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

  const onSendChat = async () => {
    const message = chatDraft.trim()
    if (!message || chatting) return
    const nextMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: message }]
    setChatMessages(nextMessages)
    setChatDraft('')
    setChatting(true)
    setStatus('')
    try {
      const result = await api.chat({ conversationId: 'control-center', message })
      setChatMessages(Array.isArray(result.messages)
        ? cloneChatMessages(result.messages)
        : [...nextMessages, { role: 'assistant', content: result.reply }])
      if (result.action?.actionId) {
        setStatus(result.action.error
          ? `动作触发失败：${result.action.error}`
          : `已触发动作：${result.action.label || result.action.actionId}`)
      }
      const nextBehavior = cloneAiBehavior(await api.getAiBehavior())
      setBehavior(nextBehavior)
      setConfig((current) => ({ ...current, behavior: nextBehavior }))
    } catch (error) {
      setStatus(messageFromError(error, '发送失败'))
    } finally {
      setChatting(false)
    }
  }

  const paneProps = {
    config,
    activeConfig,
    imageGenerationConfig,
    personaProfile,
    personaDraft,
    providerConfigDirty: hasProviderConfigChanges(config, activeConfig),
    providerConfigValidationError: validateProviderConfig(config),
    connectionTestResult,
    saving,
    status,
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
    chatting,
    behavior,
    behaviorRulesText,
    dryRunText,
    dryRunResult,
    replayDraft,
    replayResult,
    setDryRunText,
    setReplayDraft,
    setBehaviorRulesText,
    onChangeBehavior: (partial: Partial<AiBehaviorConfig>) => setBehavior({ ...behavior, ...partial }),
    onChange: (partial: Partial<AiConfigViewState>) => setConfig({ ...config, ...partial }),
    onChangeImageGeneration: (partial: Partial<ImageGenerationConfigViewState>) => setImageGenerationConfig((current) => cloneImageGenerationConfig({
      ...current,
      ...partial,
      cloud: {
        ...current.cloud,
        ...(partial.cloud || {})
      },
      local: {
        ...current.local,
        ...(partial.local || {})
      }
    })),
    onSave,
    onSaveAndTest,
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
    onExportBehaviorDiagnostics,
    onClearBehaviorDecisions,
    onSendChat
  } satisfies AiPaneProps

  return { loading, paneProps }
}
