import { useEffect, useState } from 'react'
import { controlCenterAPI as api } from '../api/control-center-api.js'
import { cloneAiConfig, cloneChatMessages, defaultAiConfig } from '../lib/defaults.js'

export function useAiPane() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState(defaultAiConfig)
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [status, setStatus] = useState('')
  const [chatDraft, setChatDraft] = useState('')
  const [chatMessages, setChatMessages] = useState([])
  const [chatting, setChatting] = useState(false)

  useEffect(() => {
    let mounted = true
    Promise.all([
      api.getAiConfig(),
      api.getAiConversation('control-center')
    ]).then(([loadedConfig, loadedChatMessages]) => {
      if (!mounted) return
      setConfig(cloneAiConfig(loadedConfig))
      setChatMessages(cloneChatMessages(loadedChatMessages))
      setLoading(false)
    })
    return () => { mounted = false }
  }, [])

  const onSave = async () => {
    setSaving(true)
    setStatus('')
    try {
      const savedConfig = cloneAiConfig(await api.saveAiConfig(config))
      setConfig(savedConfig)
      setStatus('AI 配置已保存')
    } catch (error) {
      setStatus(error.message || '保存失败')
    } finally {
      setSaving(false)
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
      onChange: (partial) => setConfig({ ...config, ...partial }),
      onSave,
      onSaveApiKey,
      onTest,
      onSendChat
    }
  }
}
