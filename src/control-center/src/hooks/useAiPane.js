import { useEffect, useState } from 'react'
import { controlCenterAPI as api } from '../api/control-center-api.js'
import { cloneAiBehavior, cloneAiConfig, cloneChatMessages, defaultAiConfig } from '../lib/defaults'

export function useAiPane() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState(defaultAiConfig)
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [status, setStatus] = useState('')
  const [chatDraft, setChatDraft] = useState('')
  const [chatMessages, setChatMessages] = useState([])
  const [chatting, setChatting] = useState(false)
  const [behavior, setBehavior] = useState(defaultAiConfig.behavior)
  const [behaviorRulesText, setBehaviorRulesText] = useState('[]')
  const [dryRunText, setDryRunText] = useState('')
  const [dryRunResult, setDryRunResult] = useState(null)

  useEffect(() => {
    let mounted = true
    Promise.all([
      api.getAiConfig(),
      api.getAiConversation('control-center'),
      api.getAiBehavior()
    ]).then(([loadedConfig, loadedChatMessages, loadedBehavior]) => {
      if (!mounted) return
      setConfig(cloneAiConfig(loadedConfig))
      setChatMessages(cloneChatMessages(loadedChatMessages))
      const nextBehavior = cloneAiBehavior(loadedBehavior || loadedConfig?.behavior)
      setBehavior(nextBehavior)
      setBehaviorRulesText(JSON.stringify(nextBehavior.rules || [], null, 2))
      setLoading(false)
    })
    return () => { mounted = false }
  }, [])

  const onSave = async () => {
    setSaving(true)
    setStatus('')
    try {
      const { behavior: _behavior, ...configWithoutBehavior } = config
      const savedConfig = cloneAiConfig(await api.saveAiConfig(configWithoutBehavior))
      setConfig(savedConfig)
      setStatus('AI 配置已保存')
    } catch (error) {
      setStatus(error.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const onSaveBehavior = async () => {
    setSaving(true)
    setStatus('')
    try {
      const parsedRules = JSON.parse(behaviorRulesText || '[]')
      if (!Array.isArray(parsedRules)) throw new Error('Behavior rules must be a JSON array')
      const savedBehavior = cloneAiBehavior(await api.saveAiBehavior({ ...behavior, rules: parsedRules }))
      setBehavior(savedBehavior)
      setBehaviorRulesText(JSON.stringify(savedBehavior.rules || [], null, 2))
      setConfig({ ...config, behavior: savedBehavior })
      setStatus('Behavior 配置已保存')
    } catch (error) {
      setStatus(error.message || 'Behavior 配置保存失败')
    } finally {
      setSaving(false)
    }
  }

  const onDryRunBehavior = async () => {
    const reply = dryRunText.trim()
    if (!reply) return
    setStatus('')
    try {
      const parsedRules = JSON.parse(behaviorRulesText || '[]')
      if (!Array.isArray(parsedRules)) throw new Error('Behavior rules must be a JSON array')
      const result = await api.dryRunAiBehavior({ reply, behavior: { ...behavior, rules: parsedRules } })
      setDryRunResult(result)
      setStatus(result.matched ? `Dry run 命中：${result.reason}` : `Dry run 未命中：${result.reason}`)
    } catch (error) {
      setDryRunResult(null)
      setStatus(error.message || 'Dry run 失败')
    }
  }

  const onSaveApiKey = async () => {
    setSaving(true)
    setStatus('')
    try {
      const result = await api.saveAiApiKey(apiKeyDraft)
      setConfig({ ...config, hasApiKey: result.hasApiKey })
      setApiKeyDraft('')
      setStatus('API Key 已保存')
    } catch (error) {
      setStatus(error.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const onTest = async () => {
    setSaving(true)
    setStatus('测试中')
    try {
      const result = await api.testAiConnection()
      setStatus(result.ok ? `连接正常：${result.reply}` : '连接失败')
    } catch (error) {
      setStatus(error.message || '连接失败')
    } finally {
      setSaving(false)
    }
  }

  const onSendChat = async () => {
    const message = chatDraft.trim()
    if (!message || chatting) return
    const nextMessages = [...chatMessages, { role: 'user', content: message }]
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
    } catch (error) {
      setStatus(error.message || '发送失败')
    } finally {
      setChatting(false)
    }
  }

  return {
    loading,
    paneProps: {
      config,
      saving,
      status,
      apiKeyDraft,
      setApiKeyDraft,
      chatDraft,
      setChatDraft,
      chatMessages,
      chatting,
      behavior,
      behaviorRulesText,
      dryRunText,
      dryRunResult,
      setDryRunText,
      setBehaviorRulesText,
      onChangeBehavior: (partial) => setBehavior({ ...behavior, ...partial }),
      onChange: (partial) => setConfig({ ...config, ...partial }),
      onSave,
      onSaveBehavior,
      onSaveApiKey,
      onTest,
      onDryRunBehavior,
      onSendChat
    }
  }
}
