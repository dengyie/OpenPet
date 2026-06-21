import type {
  AiBehaviorConfig,
  AiBehaviorResult,
  AiConfigViewState,
  ChatMessage,
  ImageGenerationConfigViewState
} from '../../../shared/openpet-contracts'
import { Toggle } from '../components/Toggle'
import { defaultImageGenerationConfig } from '../lib/defaults'

export interface AiPaneProps {
  config: AiConfigViewState
  imageGenerationConfig: ImageGenerationConfigViewState
  onChange: (partial: Partial<AiConfigViewState>) => void
  onChangeImageGeneration: (partial: Partial<ImageGenerationConfigViewState>) => void
  onSave: () => void | Promise<void>
  onSaveApiKey: () => void | Promise<void>
  onTest: () => void | Promise<void>
  onSaveImageGeneration: () => void | Promise<void>
  onSaveImageGenerationApiKey: () => void | Promise<void>
  onClearImageGenerationApiKey: () => void | Promise<void>
  onCheckImageGenerationHealth: () => void | Promise<void>
  onSendChat: () => void | Promise<void>
  saving: boolean
  status: string
  apiKeyDraft: string
  setApiKeyDraft: (value: string) => void
  imageApiKeyDraft: string
  setImageApiKeyDraft: (value: string) => void
  chatDraft: string
  setChatDraft: (value: string) => void
  chatMessages: ChatMessage[]
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
  onExportBehaviorDiagnostics: () => void | Promise<void>
  onClearBehaviorDecisions: () => void | Promise<void>
}

export function AiPane({
  config,
  imageGenerationConfig = defaultImageGenerationConfig,
  onChange,
  onChangeImageGeneration,
  onSave,
  onSaveApiKey,
  onTest,
  onSaveImageGeneration,
  onSaveImageGenerationApiKey,
  onClearImageGenerationApiKey,
  onCheckImageGenerationHealth,
  onSendChat,
  saving,
  status,
  apiKeyDraft,
  setApiKeyDraft,
  imageApiKeyDraft,
  setImageApiKeyDraft,
  chatDraft,
  setChatDraft,
  chatMessages,
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
  onExportBehaviorDiagnostics,
  onClearBehaviorDecisions
}: AiPaneProps) {
  const decisions = Array.isArray(behavior.decisions) ? behavior.decisions : []

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

      <div className="section">
        <div className="field-row">
          <div>
            <div className="field-label">Image Generation</div>
            <div className="field-note">Creator Studio 主机模型设置</div>
          </div>
          <div className="inline-action">
            <button type="button" className="ghost" onClick={onCheckImageGenerationHealth} disabled={saving}>
              检查图片健康
            </button>
            <button type="button" className="primary" onClick={onSaveImageGeneration} disabled={saving}>
              保存图片配置
            </button>
          </div>
        </div>

        <label className="field-row">
          <span className="field-label">图片默认后端</span>
          <select
            aria-label="图片默认后端"
            className="text-input"
            value={imageGenerationConfig.defaultBackend}
            onChange={(event) => onChangeImageGeneration({ defaultBackend: event.target.value as ImageGenerationConfigViewState['defaultBackend'] })}
          >
            <option value="fixture">fixture</option>
            <option value="cloud">cloud</option>
            <option value="local">local</option>
          </select>
        </label>

        <label className="field-row">
          <span className="field-label">图片 Base URL</span>
          <input
            aria-label="图片 Base URL"
            className="text-input"
            value={imageGenerationConfig.cloud.baseUrl}
            onChange={(event) => onChangeImageGeneration({
              cloud: { ...imageGenerationConfig.cloud, baseUrl: event.target.value }
            })}
          />
        </label>

        <label className="field-row">
          <span className="field-label">图片 Model</span>
          <input
            aria-label="图片 Model"
            className="text-input"
            value={imageGenerationConfig.cloud.model}
            onChange={(event) => onChangeImageGeneration({
              cloud: { ...imageGenerationConfig.cloud, model: event.target.value }
            })}
          />
        </label>

        <div className="field-row">
          <div>
            <div className="field-label">图片 API Key</div>
            <div className="field-note">
              {imageGenerationConfig.cloud.hasApiKey ? '已保存' : '未保存'}
              {imageGenerationConfig.cloud.apiKeyPreview ? ` · ${imageGenerationConfig.cloud.apiKeyPreview}` : ''}
            </div>
          </div>
          <div className="inline-action">
            <input
              className="text-input"
              type="password"
              value={imageApiKeyDraft}
              placeholder={imageGenerationConfig.cloud.hasApiKey ? '输入新密钥覆盖' : '输入图片 API Key'}
              onChange={(event) => setImageApiKeyDraft(event.target.value)}
            />
            <button type="button" className="ghost" onClick={onSaveImageGenerationApiKey} disabled={!imageApiKeyDraft || saving}>
              保存图片密钥
            </button>
            <button type="button" className="danger-text" onClick={onClearImageGenerationApiKey} disabled={saving || !imageGenerationConfig.cloud.hasApiKey}>
              清除图片密钥
            </button>
          </div>
        </div>

        <label className="field-row">
          <span className="field-label">本地 Endpoint</span>
          <input
            aria-label="本地 Endpoint"
            className="text-input"
            value={imageGenerationConfig.local.endpoint}
            onChange={(event) => onChangeImageGeneration({
              local: { ...imageGenerationConfig.local, endpoint: event.target.value }
            })}
          />
        </label>

        <label className="field-row">
          <span className="field-label">本地 Health URL</span>
          <input
            aria-label="本地 Health URL"
            className="text-input"
            value={imageGenerationConfig.local.healthUrl}
            onChange={(event) => onChangeImageGeneration({
              local: { ...imageGenerationConfig.local, healthUrl: event.target.value }
            })}
          />
        </label>

        <label className="field-row">
          <span className="field-label">本地模型</span>
          <input
            aria-label="本地模型"
            className="text-input"
            value={imageGenerationConfig.local.model}
            onChange={(event) => onChangeImageGeneration({
              local: { ...imageGenerationConfig.local, model: event.target.value }
            })}
          />
        </label>
      </div>

      {status ? <div className="status-line">{status}</div> : null}

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
                    {decision.cooldown ? <span>cooldown</span> : null}
                    {decision.fallback ? <span>fallback</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

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
