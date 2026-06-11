import React from 'react'
import { Toggle } from '../components/Toggle.jsx'

export function AiPane({
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
