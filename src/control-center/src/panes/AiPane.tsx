import type { ReactNode } from 'react'
import type {
  AiBehaviorConfig,
  AiBehaviorResult,
  AiConfigViewState,
  AiConnectionTestResult,
  AiPersonaDraftViewState,
  AiPersonaProfileViewState,
  ChatMessage,
  ImageGenerationConfigViewState
} from '../../../shared/openpet-contracts'
import { Toggle } from '../components/Toggle'
import { defaultImageGenerationConfig } from '../lib/defaults'

const imageProviderPresets = [
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
  }
] as const

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

export interface AiPaneProps {
  config: AiConfigViewState
  activeConfig: AiConfigViewState
  imageGenerationConfig: ImageGenerationConfigViewState
  activeImageGenerationConfig: ImageGenerationConfigViewState
  personaProfile: AiPersonaProfileViewState
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
  providerConfigValidationError: string
  imageProviderValidationError: string
  onChange: (partial: Partial<AiConfigViewState>) => void
  onChangeImageGeneration: (partial: Partial<ImageGenerationConfigViewState>) => void
  onSave: () => void | Promise<void>
  onSaveAndTest: () => void | Promise<void>
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
  activeConfig,
  imageGenerationConfig = defaultImageGenerationConfig,
  activeImageGenerationConfig = defaultImageGenerationConfig,
  personaProfile,
  personaDraft,
  providerConfigDirty,
  providerConfigValidationError,
  imageProviderValidationError,
  onChange,
  onChangeImageGeneration,
  onSave,
  onSaveAndTest,
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
  const saveDisabled = saving || Boolean(providerConfigValidationError)
  const imageSaveDisabled = saving || Boolean(imageProviderValidationError)
  const apiKeyDraftReady = Boolean(apiKeyDraft.trim())
  const activeSummary = `${activeConfig.provider} · ${activeConfig.baseUrl} · ${activeConfig.model} · ${activeConfig.hasApiKey ? 'API key saved' : 'API key missing'}`
  const draftSummary = [
    hasUnsavedConfigChanges ? '配置草稿未保存' : '',
    hasUnsavedApiKeyDraft ? '密钥草稿未保存' : ''
  ].filter(Boolean).join(' · ')
  const imageTargetSummary = `${activeImageGenerationConfig.provider} · ${activeImageGenerationConfig.baseUrl} · ${activeImageGenerationConfig.model} · ${activeImageGenerationConfig.hasApiKey ? 'API key saved' : 'API key missing'}`
  const applyImageProviderPreset = (preset: typeof imageProviderPresets[number]) => onChangeImageGeneration({
    provider: 'openai-compatible',
    baseUrl: preset.baseUrl,
    model: preset.model,
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
        <div className="section-actions">
          <button type="button" className="ghost" onClick={onTest} disabled={saving}>
            测试已保存配置
          </button>
          <button type="button" className="ghost" onClick={onSaveAndTest} disabled={saveDisabled}>
            保存并测试聊天 Provider
          </button>
          <button type="button" className="primary" onClick={onSave} disabled={saveDisabled}>
            {saving ? '保存中' : '保存聊天 Provider'}
          </button>
        </div>

        <div className="section">
          <div className="readonly-row">
            <strong>当前生效配置</strong>
            <span className="endpoint-text">{activeSummary}</span>
          </div>

          <div className="readonly-row">
            <strong>草稿状态</strong>
            <span>{draftSummary || '当前没有未保存修改'}</span>
          </div>

          {providerConfigDirty ? (
            <div className="provider-warning">
              你有未保存的 Provider 草稿。点击“测试已保存配置”不会使用这些草稿；点击“保存并测试聊天 Provider”会先保存再测试。
            </div>
          ) : null}
          {providerConfigValidationError ? (
            <div className="provider-warning error">{providerConfigValidationError}</div>
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
              <div className="field-note">预设只填充 Base URL / Model / 超时；不会读取或覆盖 API Key。</div>
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

      {status ? <div className="status-line">{status}</div> : null}

      {connectionStatus ? <div className="status-line">{connectionStatus}</div> : null}

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
      </CollapsibleAiSection>
    </section>
  )
}
