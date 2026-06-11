import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const tabs = [
  { id: 'pet', label: 'Pet' },
  { id: 'actions', label: 'Actions' },
  { id: 'ai', label: 'AI' },
  { id: 'plugins', label: 'Plugins' },
  { id: 'service', label: 'Service' },
  { id: 'about', label: 'About' }
]

const speedOptions = [
  { label: '慢', value: 1 },
  { label: '中', value: 2 },
  { label: '快', value: 3 }
]

const walkDurationOptions = [
  { label: '10秒', value: 10000 },
  { label: '15秒', value: 15000 },
  { label: '30秒', value: 30000 },
  { label: '60秒', value: 60000 }
]

const bubbleDurationOptions = [
  { label: '短', value: 800 },
  { label: '中', value: 1300 },
  { label: '长', value: 2000 }
]

const defaultSettings = {
  scale: 1,
  walkSpeed: 2,
  walkDuration: 15000,
  bubbleDuration: 1300,
  autoStart: false
}

const defaultAiConfig = {
  enabled: false,
  provider: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKeyRef: 'ai.default',
  systemPrompt: 'You are a friendly desktop pet companion.',
  hasApiKey: false
}

const defaultServiceStatus = {
  config: {
    enabled: false,
    host: '127.0.0.1',
    port: 0
  },
  runtime: {
    enabled: false,
    host: '127.0.0.1',
    port: 0
  }
}

const defaultActionsConfig = {
  defaultAction: '',
  clickAction: '',
  actions: []
}

const api = window.controlCenterAPI || {
  getSettings: async () => defaultSettings,
  saveSettings: async (settings) => settings,
  previewScale: () => {},
  getActions: async () => defaultActionsConfig,
  importActionFrames: async () => ({ canceled: true }),
  saveActionsConfig: async (config) => ({ animations: config }),
  deleteAction: async () => ({ animations: defaultActionsConfig }),
  getAiConfig: async () => defaultAiConfig,
  saveAiConfig: async (config) => ({ ...defaultAiConfig, ...config }),
  saveAiApiKey: async () => ({ apiKeyRef: 'ai.default', hasApiKey: true }),
  testAiConnection: async () => ({ ok: true, reply: 'ok' }),
  chat: async ({ message }) => ({ reply: `Echo: ${message}` }),
  getPlugins: async () => [],
  setPluginEnabled: async (pluginId, enabled) => ({ id: pluginId, enabled }),
  runPluginCommand: async () => ({ ok: true }),
  getServiceStatus: async () => defaultServiceStatus,
  saveServiceConfig: async (config) => ({ config, runtime: { ...config, enabled: config.enabled } }),
  close: () => {}
}

const cloneSettings = (settings) => ({ ...defaultSettings, ...settings })
const cloneAiConfig = (config) => ({ ...defaultAiConfig, ...config })
const cloneServiceStatus = (status) => ({
  config: { ...defaultServiceStatus.config, ...(status?.config || {}) },
  runtime: { ...defaultServiceStatus.runtime, ...(status?.runtime || {}) }
})
const cloneActionsConfig = (config) => ({
  ...defaultActionsConfig,
  ...config,
  actions: Array.isArray(config?.actions) ? config.actions : []
})

function SegmentedControl({ label, value, options, onChange }) {
  return (
    <div className="field-row">
      <div className="field-label">{label}</div>
      <div className="segmented" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={value === option.value ? 'active' : ''}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      className={checked ? 'toggle on' : 'toggle'}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  )
}

function PetSettings({ settings, originalSettings, onChange, onSave, onReset, saving }) {
  const scalePercent = Math.round(settings.scale * 100)

  return (
    <section className="pane">
      <header className="pane-header">
        <div>
          <h1>Pet</h1>
          <p>当前宠物行为配置</p>
        </div>
        <div className="header-actions">
          <button type="button" className="ghost" onClick={onReset} disabled={saving}>
            还原
          </button>
          <button type="button" className="primary" onClick={onSave} disabled={saving}>
            {saving ? '保存中' : '保存'}
          </button>
        </div>
      </header>

      <div className="section">
        <div className="field-row">
          <div>
            <div className="field-label">宠物大小</div>
            <div className="field-note">{scalePercent}%</div>
          </div>
          <input
            className="range"
            type="range"
            min="50"
            max="150"
            step="5"
            value={scalePercent}
            onChange={(event) => onChange({ scale: Number(event.target.value) / 100 }, true)}
          />
        </div>

        <SegmentedControl
          label="散步速度"
          value={settings.walkSpeed}
          options={speedOptions}
          onChange={(walkSpeed) => onChange({ walkSpeed })}
        />
        <SegmentedControl
          label="散步时长"
          value={settings.walkDuration}
          options={walkDurationOptions}
          onChange={(walkDuration) => onChange({ walkDuration })}
        />
        <SegmentedControl
          label="气泡显示时长"
          value={settings.bubbleDuration}
          options={bubbleDurationOptions}
          onChange={(bubbleDuration) => onChange({ bubbleDuration })}
        />

        <div className="field-row">
          <div className="field-label">开机自启</div>
          <Toggle checked={settings.autoStart} onChange={(autoStart) => onChange({ autoStart })} />
        </div>
      </div>

      <div className="status-line">
        原始大小 {Math.round(originalSettings.scale * 100)}%
      </div>
    </section>
  )
}

function AiSettings({
  config,
  onChange,
  onSave,
  onSaveApiKey,
  onTest,
  onSendChat,
  saving,
  status,
  apiKeyDraft,
  setApiKeyDraft,
  chatDraft,
  setChatDraft,
  chatMessages,
  chatting
}) {
  return (
    <section className="pane">
      <header className="pane-header">
        <div>
          <h1>AI</h1>
          <p>聊天 Provider 与模型配置</p>
        </div>
        <div className="header-actions">
          <button type="button" className="ghost" onClick={onTest} disabled={saving}>
            测试
          </button>
          <button type="button" className="primary" onClick={onSave} disabled={saving}>
            {saving ? '保存中' : '保存'}
          </button>
        </div>
      </header>

      <div className="section">
        <div className="field-row">
          <div className="field-label">启用聊天</div>
          <Toggle checked={config.enabled} onChange={(enabled) => onChange({ enabled })} />
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
            <button type="button" className="ghost" onClick={onSaveApiKey} disabled={!apiKeyDraft || saving}>
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
      </div>

      {status ? <div className="status-line">{status}</div> : null}

      <div className="chat-panel">
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
          <input
            className="text-input"
            value={chatDraft}
            placeholder="说点什么"
            onChange={(event) => setChatDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSendChat()
            }}
          />
          <button type="button" className="primary" onClick={onSendChat} disabled={!chatDraft.trim() || chatting}>
            {chatting ? '发送中' : '发送'}
          </button>
        </div>
      </div>
    </section>
  )
}

function ActionsPane({
  actionsConfig,
  importDraft,
  setImportDraft,
  status,
  working,
  onChangeConfig,
  onSaveConfig,
  onImport,
  onDelete
}) {
  return (
    <section className="pane">
      <header className="pane-header">
        <div>
          <h1>Actions</h1>
          <p>动作帧导入与运行时动作</p>
        </div>
        <div className="header-actions">
          <button type="button" className="ghost" onClick={onSaveConfig} disabled={working || actionsConfig.actions.length === 0}>
            保存配置
          </button>
          <button type="button" className="primary" onClick={onImport} disabled={working || !importDraft.actionId.trim()}>
            {working ? '处理中' : '选择文件夹导入'}
          </button>
        </div>
      </header>

      <div className="section">
        <label className="field-row">
          <span className="field-label">Action ID</span>
          <input
            className="text-input"
            value={importDraft.actionId}
            placeholder="wave"
            onChange={(event) => setImportDraft({ ...importDraft, actionId: event.target.value })}
          />
        </label>

        <label className="field-row">
          <span className="field-label">显示名称</span>
          <input
            className="text-input"
            value={importDraft.label}
            placeholder="挥手"
            onChange={(event) => setImportDraft({ ...importDraft, label: event.target.value })}
          />
        </label>

        <div className="readonly-row">
          <span>默认动作</span>
          <select
            className="text-input"
            value={actionsConfig.defaultAction}
            onChange={(event) => onChangeConfig({ defaultAction: event.target.value })}
          >
            {actionsConfig.actions.map((action) => (
              <option value={action.id} key={action.id}>{action.label}</option>
            ))}
          </select>
        </div>

        <div className="readonly-row">
          <span>点击动作</span>
          <select
            className="text-input"
            value={actionsConfig.clickAction}
            onChange={(event) => onChangeConfig({ clickAction: event.target.value })}
          >
            {actionsConfig.actions.map((action) => (
              <option value={action.id} key={action.id}>{action.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="action-list">
        {actionsConfig.actions.length === 0 ? (
          <div className="empty-chat">暂无动作</div>
        ) : actionsConfig.actions.map((action) => (
          <div className="action-row" key={action.id}>
            <div>
              <strong>{action.label}</strong>
              <span>{action.id}</span>
            </div>
            <div className="action-meta">
              <span>{action.frameCount} 帧</span>
              <span>{action.frameWidth}x{action.frameHeight}</span>
              <span>{action.loop ? '循环' : '单次'}</span>
              <button
                type="button"
                className="danger-text"
                disabled={working || actionsConfig.actions.length <= 1}
                onClick={() => onDelete(action.id)}
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>

      {status ? <div className="status-line">{status}</div> : null}
    </section>
  )
}

function PluginsPane({ plugins, status, runningCommand, onToggle, onRun }) {
  return (
    <section className="pane">
      <header className="pane-header">
        <div>
          <h1>Plugins</h1>
          <p>插件权限与官方命令</p>
        </div>
      </header>

      <div className="plugin-list">
        {plugins.length === 0 ? (
          <div className="empty-chat">暂无插件</div>
        ) : plugins.map((plugin) => (
          <div className="plugin-row" key={plugin.id}>
            <div className="plugin-main">
              <div className="plugin-title">
                <strong>{plugin.name}</strong>
                <span>{plugin.source}</span>
              </div>
              <div className="plugin-meta">
                <span>{plugin.id}</span>
                <span>{plugin.version}</span>
                <span>{plugin.runnable ? '可运行' : '仅展示'}</span>
              </div>
              <div className="permission-line">
                {(plugin.permissions || []).length === 0 ? '无权限' : plugin.permissions.join(' · ')}
              </div>
              {plugin.commands?.length ? (
                <div className="plugin-commands">
                  {plugin.commands.map((command) => {
                    const commandKey = `${plugin.id}:${command.id}`
                    return (
                      <button
                        type="button"
                        className="ghost"
                        key={command.id}
                        disabled={!plugin.enabled || !plugin.runnable || runningCommand === commandKey}
                        onClick={() => onRun(plugin.id, command.id)}
                      >
                        {runningCommand === commandKey ? '运行中' : command.title}
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
            <Toggle checked={plugin.enabled} onChange={(enabled) => onToggle(plugin.id, enabled)} />
          </div>
        ))}
      </div>

      {status ? <div className="status-line">{status}</div> : null}
    </section>
  )
}

function ServicePane({ serviceStatus, status, saving, onChange, onSave }) {
  const config = serviceStatus.config
  const runtime = serviceStatus.runtime
  const endpoint = runtime.enabled && runtime.port
    ? `http://${runtime.host}:${runtime.port}/api/status`
    : '未启动'

  return (
    <section className="pane">
      <header className="pane-header">
        <div>
          <h1>Service</h1>
          <p>本机 HTTP API</p>
        </div>
        <div className="header-actions">
          <button type="button" className="primary" onClick={onSave} disabled={saving}>
            {saving ? '保存中' : '保存'}
          </button>
        </div>
      </header>

      <div className="section">
        <div className="field-row">
          <div>
            <div className="field-label">HTTP API</div>
            <div className="field-note">{runtime.enabled ? '运行中' : '未启动'}</div>
          </div>
          <Toggle checked={config.enabled} onChange={(enabled) => onChange({ enabled })} />
        </div>

        <div className="field-row">
          <div>
            <div className="field-label">监听地址</div>
            <div className="field-note">固定为本机回环地址</div>
          </div>
          <input className="text-input" value="127.0.0.1" disabled />
        </div>

        <label className="field-row">
          <span className="field-label">端口</span>
          <input
            className="text-input"
            type="number"
            min="0"
            max="65535"
            value={config.port}
            onChange={(event) => onChange({ port: Number(event.target.value) })}
          />
        </label>

        <div className="readonly-row">
          <span>当前端点</span>
          <strong className="endpoint-text">{endpoint}</strong>
        </div>

        <div className="readonly-row">
          <span>MCP</span>
          <strong>后续阶段</strong>
        </div>
      </div>

      {status ? <div className="status-line">{status}</div> : null}
    </section>
  )
}

function PlaceholderPane({ title, rows }) {
  return (
    <section className="pane">
      <header className="pane-header">
        <div>
          <h1>{title}</h1>
          <p>待接入</p>
        </div>
      </header>
      <div className="section compact">
        {rows.map((row) => (
          <div className="readonly-row" key={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}

function App() {
  const [activeTab, setActiveTab] = useState('pet')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState(defaultSettings)
  const [originalSettings, setOriginalSettings] = useState(defaultSettings)
  const [actionsConfig, setActionsConfig] = useState(defaultActionsConfig)
  const [importDraft, setImportDraft] = useState({ actionId: '', label: '' })
  const [actionStatus, setActionStatus] = useState('')
  const [actionWorking, setActionWorking] = useState(false)
  const [aiConfig, setAiConfig] = useState(defaultAiConfig)
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [aiStatus, setAiStatus] = useState('')
  const [chatDraft, setChatDraft] = useState('')
  const [chatMessages, setChatMessages] = useState([])
  const [chatting, setChatting] = useState(false)
  const [plugins, setPlugins] = useState([])
  const [pluginStatus, setPluginStatus] = useState('')
  const [runningCommand, setRunningCommand] = useState('')
  const [serviceStatus, setServiceStatus] = useState(defaultServiceStatus)
  const [serviceMessage, setServiceMessage] = useState('')
  const originalRef = useRef(defaultSettings)

  useEffect(() => {
    let mounted = true
    Promise.all([
      api.getSettings(),
      api.getActions(),
      api.getAiConfig(),
      api.getPlugins(),
      api.getServiceStatus()
    ]).then(([loadedSettings, loadedActions, loadedAiConfig, loadedPlugins, loadedServiceStatus]) => {
      if (!mounted) return
      const nextSettings = cloneSettings(loadedSettings)
      originalRef.current = nextSettings
      setSettings(nextSettings)
      setOriginalSettings(nextSettings)
      setActionsConfig(cloneActionsConfig(loadedActions))
      setAiConfig(cloneAiConfig(loadedAiConfig))
      setPlugins(loadedPlugins)
      setServiceStatus(cloneServiceStatus(loadedServiceStatus))
      setLoading(false)
    })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    const restorePreview = () => api.previewScale(originalRef.current.scale)
    window.addEventListener('beforeunload', restorePreview)
    return () => window.removeEventListener('beforeunload', restorePreview)
  }, [])

  const page = useMemo(() => {
    if (activeTab === 'pet') {
      return (
        <PetSettings
          settings={settings}
          originalSettings={originalSettings}
          saving={saving}
          onChange={(partial, previewScale) => {
            const nextSettings = { ...settings, ...partial }
            setSettings(nextSettings)
            if (previewScale) api.previewScale(nextSettings.scale)
          }}
          onSave={async () => {
            setSaving(true)
            const savedSettings = cloneSettings(await api.saveSettings(settings))
            originalRef.current = savedSettings
            setOriginalSettings(savedSettings)
            setSettings(savedSettings)
            setSaving(false)
          }}
          onReset={() => {
            const restoredSettings = cloneSettings(originalRef.current)
            setSettings(restoredSettings)
            api.previewScale(restoredSettings.scale)
          }}
        />
      )
    }
    if (activeTab === 'actions') {
      return (
        <ActionsPane
          actionsConfig={actionsConfig}
          importDraft={importDraft}
          setImportDraft={setImportDraft}
          status={actionStatus}
          working={actionWorking}
          onChangeConfig={(partial) => setActionsConfig({ ...actionsConfig, ...partial })}
          onSaveConfig={async () => {
            setActionWorking(true)
            setActionStatus('')
            try {
              const response = await api.saveActionsConfig({
                defaultAction: actionsConfig.defaultAction,
                clickAction: actionsConfig.clickAction
              })
              setActionsConfig(cloneActionsConfig(response.animations))
              setActionStatus('动作配置已保存')
            } catch (error) {
              setActionStatus(error.message || '保存失败')
            } finally {
              setActionWorking(false)
            }
          }}
          onImport={async () => {
            setActionWorking(true)
            setActionStatus('')
            try {
              const response = await api.importActionFrames(importDraft)
              if (response.canceled) {
                setActionStatus('已取消导入')
              } else {
                setActionsConfig(cloneActionsConfig(response.animations))
                setActionStatus(`已导入 ${response.result.importedAction?.label || importDraft.actionId}`)
              }
            } catch (error) {
              setActionStatus(error.message || '导入失败')
            } finally {
              setActionWorking(false)
            }
          }}
          onDelete={async (actionId) => {
            if (!window.confirm(`删除动作 ${actionId}？`)) return
            setActionWorking(true)
            setActionStatus('')
            try {
              const response = await api.deleteAction(actionId)
              setActionsConfig(cloneActionsConfig(response.animations))
              setActionStatus(`已删除 ${actionId}`)
            } catch (error) {
              setActionStatus(error.message || '删除失败')
            } finally {
              setActionWorking(false)
            }
          }}
        />
      )
    }
    if (activeTab === 'ai') {
      return (
        <AiSettings
          config={aiConfig}
          saving={saving}
          status={aiStatus}
          apiKeyDraft={apiKeyDraft}
          setApiKeyDraft={setApiKeyDraft}
          chatDraft={chatDraft}
          setChatDraft={setChatDraft}
          chatMessages={chatMessages}
          chatting={chatting}
          onChange={(partial) => setAiConfig({ ...aiConfig, ...partial })}
          onSave={async () => {
            setSaving(true)
            setAiStatus('')
            try {
              const savedConfig = cloneAiConfig(await api.saveAiConfig(aiConfig))
              setAiConfig(savedConfig)
              setAiStatus('AI 配置已保存')
            } catch (error) {
              setAiStatus(error.message || '保存失败')
            } finally {
              setSaving(false)
            }
          }}
          onSaveApiKey={async () => {
            setSaving(true)
            setAiStatus('')
            try {
              const result = await api.saveAiApiKey(apiKeyDraft)
              setAiConfig({ ...aiConfig, hasApiKey: result.hasApiKey })
              setApiKeyDraft('')
              setAiStatus('API Key 已保存')
            } catch (error) {
              setAiStatus(error.message || '保存失败')
            } finally {
              setSaving(false)
            }
          }}
          onTest={async () => {
            setSaving(true)
            setAiStatus('测试中')
            try {
              const result = await api.testAiConnection()
              setAiStatus(result.ok ? `连接正常：${result.reply}` : '连接失败')
            } catch (error) {
              setAiStatus(error.message || '连接失败')
            } finally {
              setSaving(false)
            }
          }}
          onSendChat={async () => {
            const message = chatDraft.trim()
            if (!message || chatting) return
            const nextMessages = [...chatMessages, { role: 'user', content: message }]
            setChatMessages(nextMessages)
            setChatDraft('')
            setChatting(true)
            setAiStatus('')
            try {
              const result = await api.chat({ conversationId: 'control-center', message })
              setChatMessages([...nextMessages, { role: 'assistant', content: result.reply }])
            } catch (error) {
              setAiStatus(error.message || '发送失败')
            } finally {
              setChatting(false)
            }
          }}
        />
      )
    }
    if (activeTab === 'plugins') {
      return (
        <PluginsPane
          plugins={plugins}
          status={pluginStatus}
          runningCommand={runningCommand}
          onToggle={async (pluginId, enabled) => {
            setPluginStatus('')
            try {
              const updatedPlugin = await api.setPluginEnabled(pluginId, enabled)
              setPlugins(plugins.map((plugin) => (
                plugin.id === pluginId ? { ...plugin, ...updatedPlugin } : plugin
              )))
              setPluginStatus(enabled ? '插件已启用' : '插件已停用')
            } catch (error) {
              setPluginStatus(error.message || '插件状态更新失败')
            }
          }}
          onRun={async (pluginId, commandId) => {
            const commandKey = `${pluginId}:${commandId}`
            setRunningCommand(commandKey)
            setPluginStatus('')
            try {
              await api.runPluginCommand(pluginId, commandId)
              setPluginStatus('命令已运行')
            } catch (error) {
              setPluginStatus(error.message || '命令运行失败')
            } finally {
              setRunningCommand('')
            }
          }}
        />
      )
    }
    if (activeTab === 'service') {
      return (
        <ServicePane
          serviceStatus={serviceStatus}
          status={serviceMessage}
          saving={saving}
          onChange={(partial) => {
            setServiceStatus({
              ...serviceStatus,
              config: { ...serviceStatus.config, ...partial }
            })
          }}
          onSave={async () => {
            setSaving(true)
            setServiceMessage('')
            try {
              const nextStatus = cloneServiceStatus(await api.saveServiceConfig(serviceStatus.config))
              setServiceStatus(nextStatus)
              setServiceMessage(nextStatus.runtime.enabled ? '本地服务已启动' : '本地服务已停止')
            } catch (error) {
              setServiceMessage(error.message || '服务配置保存失败')
            } finally {
              setSaving(false)
            }
          }}
        />
      )
    }
    return <PlaceholderPane title="About" rows={[
      { label: 'Electron', value: '42.4.0' },
      { label: 'Control Center', value: 'Phase 5' },
      { label: 'Runtime contract', value: 'Phase 2' }
    ]} />
  }, [activeTab, actionStatus, actionWorking, actionsConfig, aiConfig, aiStatus, apiKeyDraft, chatDraft, chatMessages, chatting, importDraft, originalSettings, pluginStatus, plugins, runningCommand, saving, serviceMessage, serviceStatus, settings])

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>ibot</strong>
          <span>Control Center</span>
        </div>
        <nav className="nav" aria-label="Control Center">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? 'active' : ''}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>
      <div className="content">
        {loading ? <div className="loading">加载中</div> : page}
      </div>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
