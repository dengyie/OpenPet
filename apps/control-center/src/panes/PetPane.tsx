import { useEffect, useState } from 'react'
import type { CompanionDiagnosticsViewState, ControlCenterSettings, CursorOption } from '@openpet/shared/src/openpet-contracts.ts'
import {
  CUSTOM_CURSOR_MAX_SIZE_PERCENT,
  CUSTOM_CURSOR_MIN_SIZE_PERCENT,
  CUSTOM_CURSOR_SIZE_STEP_PERCENT,
  SYSTEM_CURSOR_ID
} from '@openpet/shared/src/cursor-library.ts'
import { SegmentedControl } from '../components/SegmentedControl.tsx'
import { Toggle } from '../components/Toggle.tsx'
import { bubbleDurationOptions, homeRadiusOptions, menuPositionOptions, speedOptions, walkDurationOptions } from '../constants.ts'

export interface PetPaneProps {
  settings: ControlCenterSettings
  originalSettings: ControlCenterSettings
  status: string
  saving: boolean
  cursorOptions: CursorOption[]
  onChange: (partial: Partial<ControlCenterSettings>, previewScale?: boolean) => void
  onChangeCursorScope: (scope: ControlCenterSettings['customCursorScope']) => void | Promise<void>
  onSelectCursor: (cursorId: string) => void | Promise<void>
  onImportCursor: () => void | Promise<void>
  onResizeCursor: (cursorId: string, sizePercent: number) => void | Promise<void>
  onDeleteCursor: (cursorId: string) => void | Promise<void>
  onResetCursorSize: (cursorId: string) => void | Promise<void>
  onSave: () => void | Promise<void>
  onReset: () => void
  companionDiagnostics: CompanionDiagnosticsViewState | null
  onRefreshCompanionDiagnostics: () => void | Promise<void>
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5 10.5 8.2 13.7 15 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 4v12M4 10h12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M6 6l8 8M14 6l-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

const formatCursorSize = (cursor: Pick<CursorOption, 'width' | 'height'>) => {
  const width = Math.round(Number(cursor.width) || 0)
  const height = Math.round(Number(cursor.height) || 0)
  return width > 0 && height > 0 ? `${width}×${height}` : '尺寸未知'
}

const formatPendingCursorSize = (cursor: CursorOption, sizePercent: number) => {
  const currentSizePercent = Math.max(1, Math.round(Number(cursor.sizePercent) || 100))
  const width = Math.round((Number(cursor.width) || 0) * sizePercent / currentSizePercent)
  const height = Math.round((Number(cursor.height) || 0) * sizePercent / currentSizePercent)
  return width > 0 && height > 0 ? `${width}×${height}` : formatCursorSize(cursor)
}

const companionStatusLabels: Record<string, string> = {
  idle: '空闲',
  thinking: '思考中',
  working: '工作中',
  waiting: '等待确认',
  blocked: '已阻塞',
  completed: '已完成',
  failed: '失败',
  compacting: '整理上下文'
}

const companionPriorityLabels: Record<string, string> = {
  ambient: '环境',
  normal: '普通',
  summary: '摘要',
  important: '重要',
  urgent: '紧急'
}

const compactSessionKey = (sessionKey: string | undefined) => {
  const normalized = String(sessionKey || '')
  if (!normalized) return '未选择'
  if (normalized.length <= 8) return normalized
  return `${normalized.slice(0, 4)}…${normalized.slice(-4)}`
}

const formatLeaseRemaining = (expiresAt: number) => {
  const remaining = Math.max(0, Number(expiresAt || 0) - Date.now())
  return remaining > 0 ? `${Math.ceil(remaining / 1000)} 秒后释放` : '即将释放'
}

export function PetPane({
  settings,
  originalSettings,
  status,
  onChange,
  onChangeCursorScope,
  onSelectCursor,
  onImportCursor,
  onResizeCursor,
  onDeleteCursor,
  onSave,
  onReset,
  cursorOptions,
  onResetCursorSize,
  saving,
  companionDiagnostics,
  onRefreshCompanionDiagnostics
}: PetPaneProps) {
  const scalePercent = Math.round(settings.scale * 100)
  const visibleCursorOptions = cursorOptions.filter((option) => option.id !== SYSTEM_CURSOR_ID)
  const selectedScalableCursor = visibleCursorOptions.find((cursor) => cursor.id === settings.selectedCursorId) || null
  const selectedCursorSizePercent = Math.round(Number(selectedScalableCursor?.sizePercent) || 100)
  const [pendingCursorSizePercent, setPendingCursorSizePercent] = useState(selectedCursorSizePercent)
  const cursorScopeFeedback = status.includes('全电脑') || status.includes('整个电脑') || status.includes('指针作用范围') ? status : ''
  const systemCursorAvailable = settings.systemCursorStatus.supported
  const systemCursorSelectable = systemCursorAvailable && settings.customCursor.enabled

  useEffect(() => {
    setPendingCursorSizePercent(selectedCursorSizePercent)
  }, [selectedScalableCursor?.id, selectedCursorSizePercent])

  const updateHomeEnabled = (enabled: boolean) => onChange({
    grounded: enabled ? true : settings.grounded,
    home: { ...settings.home, enabled }
  })
  const updateHomeRadius = (radius: ControlCenterSettings['home']['radius']) => onChange({
    grounded: true,
    home: { ...settings.home, enabled: true, radius }
  })

  const commitCursorSizeChange = () => {
    if (!selectedScalableCursor) return
    if (pendingCursorSizePercent === selectedCursorSizePercent) return
    onResizeCursor(selectedScalableCursor.id, pendingCursorSizePercent)
  }

  return (
    <section className="pane pet-pane">
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
          <div>
            <div className="field-label">头顶轻聊天 Popup</div>
            <div className="field-note">宠物说话时在头顶显示可回复的小弹窗，不影响普通气泡和扩展聊天面板。</div>
          </div>
          <Toggle
            ariaLabel="Enable pet bubble chat popup"
            checked={settings.petBubbleChat.enabled}
            onChange={(enabled) => onChange({ petBubbleChat: { ...settings.petBubbleChat, enabled } })}
          />
        </div>
        <SegmentedControl
          label="一级菜单位置"
          value={settings.menuPosition}
          options={menuPositionOptions}
          onChange={(menuPosition) => onChange({ menuPosition: menuPosition as ControlCenterSettings['menuPosition'] })}
        />

        <div className="field-row">
          <div className="field-label">开机自启</div>
          <Toggle ariaLabel="Enable auto start" checked={settings.autoStart} onChange={(autoStart) => onChange({ autoStart })} />
        </div>

        <div className="cursor-settings-block">
          <div className="cursor-settings-shell">
            <div className="cursor-selection-header">
              <h2>指针选择</h2>
              <p>预览会模拟真实指针落点，方便你判断图片尺寸和视觉效果。</p>
            </div>

            <div className="cursor-options-rail">
              <div className="cursor-options-row" role="list" aria-label="可选指针">
                {visibleCursorOptions.map((option) => {
                  const selected = settings.selectedCursorId === option.id
                  const removable = option.canDelete === true
                  return (
                    <div
                      key={option.id}
                      className={`cursor-option-card-shell${removable ? ' removable' : ''}`}
                    >
                      {removable ? (
                        <button
                          type="button"
                          className="cursor-card-delete"
                          aria-label={`删除指针 ${option.name}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            void onDeleteCursor(option.id)
                          }}
                          disabled={saving}
                        >
                          <CloseIcon />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={`cursor-option-card${selected ? ' selected' : ''}`}
                        data-cursor-source={option.source}
                        onClick={() => onSelectCursor(option.id)}
                        disabled={saving}
                      >
                        <span className="cursor-card-preview">
                          <span className="cursor-card-surface" />
                          <img src={option.assetUrl} alt={`${option.name} 预览`} />
                        </span>
                        <span className="cursor-card-label">{option.name}</span>
                        {selected ? (
                          <span className="cursor-card-check" aria-hidden="true">
                            <CheckIcon />
                          </span>
                        ) : null}
                      </button>
                    </div>
                  )
                })}

                <div className="cursor-option-card-shell add-card-shell">
                  <button
                    type="button"
                    className="cursor-option-card add-card"
                    onClick={onImportCursor}
                    disabled={saving}
                  >
                    <span className="cursor-card-preview">
                      <span className="cursor-card-surface" />
                      <span className="cursor-card-add-icon" aria-hidden="true">
                        <PlusIcon />
                      </span>
                    </span>
                    <span className="cursor-card-label">添加自定义</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="cursor-size-panel">
              {selectedScalableCursor ? (
                <>
                  <div className="cursor-size-summary">
                    <div className="cursor-size-identity">
                      <h3>{selectedScalableCursor.name}</h3>
                      <span>{formatPendingCursorSize(selectedScalableCursor, pendingCursorSizePercent)}</span>
                    </div>
                    <div className="cursor-size-actions">
                      <div className="cursor-size-value">{pendingCursorSizePercent}%</div>
                      {selectedScalableCursor.canResetSize === true ? (
                        <button
                          type="button"
                          className="ghost accent cursor-size-reset"
                          onClick={() => onResetCursorSize(selectedScalableCursor.id)}
                          disabled={saving}
                        >
                          恢复默认大小
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="cursor-size-control">
                    <div className="cursor-size-slider-row cursor-size-range-labels">
                      <span>{CUSTOM_CURSOR_MIN_SIZE_PERCENT}%</span>
                      <input
                        className="range"
                        type="range"
                        min={String(CUSTOM_CURSOR_MIN_SIZE_PERCENT)}
                        max={String(CUSTOM_CURSOR_MAX_SIZE_PERCENT)}
                        step={String(CUSTOM_CURSOR_SIZE_STEP_PERCENT)}
                        value={pendingCursorSizePercent}
                        aria-label="当前指针大小"
                        onChange={(event) => setPendingCursorSizePercent(Number(event.target.value))}
                        onMouseUp={commitCursorSizeChange}
                        onTouchEnd={commitCursorSizeChange}
                        onBlur={commitCursorSizeChange}
                        onKeyUp={(event) => {
                          if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
                            commitCursorSizeChange()
                          }
                        }}
                        disabled={saving}
                      />
                      <span>{CUSTOM_CURSOR_MAX_SIZE_PERCENT}%</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="cursor-size-empty">
                  <h3>当前指针大小</h3>
                  <p>先在上方选择一个指针，再调节显示大小。</p>
                </div>
              )}
            </div>

            <div className="cursor-scope-row">
              <div>
                <div className="field-label">作用范围</div>
                <div className="field-note">
                  {systemCursorAvailable
                    ? '开启后会在 macOS 全电脑范围显示当前指针；关闭后只影响宠物交互区域。'
                    : '当前平台暂不支持全电脑指针，仍可使用仅 OpenPet 模式。'}
                </div>
              </div>
              <div className="cursor-scope-control">
                <button
                  type="button"
                  className="cursor-scope-pill"
                  aria-pressed={settings.customCursorScope === 'openpet'}
                  onClick={() => onChangeCursorScope('openpet')}
                  disabled={saving}
                >
                  仅 OpenPet
                </button>
                <Toggle
                  ariaLabel="Apply cursor to the whole computer"
                  checked={settings.customCursorScope === 'system'}
                  onChange={(checked) => onChangeCursorScope(checked ? 'system' : 'openpet')}
                  disabled={saving || !systemCursorSelectable}
                />
                <button
                  type="button"
                  className="cursor-scope-target"
                  onClick={() => onChangeCursorScope('system')}
                  disabled={saving || !systemCursorSelectable}
                >
                  应用到整个电脑
                </button>
              </div>
              {cursorScopeFeedback ? (
                <div className="cursor-scope-feedback" role="status">
                  {cursorScopeFeedback}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="field-row">
          <div>
            <div className="field-label">落地模式</div>
            <div className="field-note">宠物沿着当前屏幕底边活动</div>
          </div>
          <Toggle
            ariaLabel="Enable grounded mode"
            checked={settings.grounded}
            onChange={(grounded) => onChange({
              grounded,
              home: grounded ? settings.home : { ...settings.home, enabled: false }
            })}
          />
        </div>

        <div className="field-row">
          <div>
            <div className="field-label">Home 点</div>
            <div className="field-note">开启后会把当前位置当作家，拖动宠物会更新家的位置</div>
          </div>
          <Toggle
            ariaLabel="Enable home anchor"
            checked={settings.home.enabled}
            onChange={updateHomeEnabled}
          />
        </div>

        <SegmentedControl
          label="活动范围"
          value={settings.home.radius}
          options={homeRadiusOptions}
          onChange={(radius) => updateHomeRadius(String(radius) as ControlCenterSettings['home']['radius'])}
        />
      </div>

      <section className="section companion-settings" data-testid="companion-settings">
        <div className="card-header">
          <div className="card-header-copy">
            <h2 className="card-title">Companion</h2>
            <p className="card-description">控制 Agent Awareness 的注意力、提示频率、语音和空闲动作。</p>
          </div>
        </div>

        <div className="field-row">
          <div>
            <div className="field-label">启用 Companion</div>
            <div className="field-note">关闭后保留设置，但不让 Companion 产生新的展示效果。</div>
          </div>
          <Toggle
            ariaLabel="Enable companion output"
            checked={settings.companion.enabled}
            onChange={(enabled) => onChange({ companion: { ...settings.companion, enabled } })}
          />
        </div>

        <div className="field-row">
          <div>
            <div className="field-label">聚焦会话</div>
            <div className="field-note">填写 Agent Awareness 提供的 12 位匿名会话标识；留空由主机按优先级选择。</div>
          </div>
          <input
            className="text-input companion-session-input"
            aria-label="Companion focused session key"
            inputMode="text"
            maxLength={12}
            placeholder="留空使用自动选择"
            value={settings.companion.focusedSessionKey}
            onChange={(event) => onChange({
              companion: {
                ...settings.companion,
                focusedSessionKey: event.target.value.replace(/[^a-f0-9]/gi, '').slice(0, 12).toLowerCase()
              }
            })}
          />
        </div>

        <div className="companion-subsection">
          <h3>提示冷却</h3>
          <p className="field-note">完成、等待和失败提示的最短重复间隔，单位为毫秒。</p>
          {(['completed', 'waiting', 'failed'] as const).map((status) => (
            <div className="field-row compact-field-row" key={status}>
              <div className="field-label">{companionStatusLabels[status]}</div>
              <input
                className="text-input companion-number-input"
                aria-label={`${companionStatusLabels[status]}提示冷却`}
                type="number"
                min="0"
                max="86400000"
                step="1000"
                value={settings.companion.noticeCooldownMs[status]}
                onChange={(event) => onChange({
                  companion: {
                    ...settings.companion,
                    noticeCooldownMs: {
                      ...settings.companion.noticeCooldownMs,
                      [status]: Number(event.target.value)
                    }
                  }
                })}
              />
            </div>
          ))}
        </div>

        <div className="companion-subsection">
          <h3>安静时段</h3>
          <div className="field-row">
            <div>
              <div className="field-label">启用安静时段</div>
              <div className="field-note">只抑制本地语音租约，不删除事件、对话或诊断。</div>
            </div>
            <Toggle
              ariaLabel="Enable companion quiet hours"
              checked={settings.companion.quietHours.enabled}
              onChange={(enabled) => onChange({
                companion: { ...settings.companion, quietHours: { ...settings.companion.quietHours, enabled } }
              })}
            />
          </div>
          <div className="companion-time-grid">
            <label className="companion-time-field">
              <span>开始</span>
              <input
                className="text-input"
                aria-label="Companion quiet hours start"
                type="time"
                value={settings.companion.quietHours.start}
                disabled={!settings.companion.quietHours.enabled}
                onChange={(event) => onChange({
                  companion: { ...settings.companion, quietHours: { ...settings.companion.quietHours, start: event.target.value } }
                })}
              />
            </label>
            <label className="companion-time-field">
              <span>结束</span>
              <input
                className="text-input"
                aria-label="Companion quiet hours end"
                type="time"
                value={settings.companion.quietHours.end}
                disabled={!settings.companion.quietHours.enabled}
                onChange={(event) => onChange({
                  companion: { ...settings.companion, quietHours: { ...settings.companion.quietHours, end: event.target.value } }
                })}
              />
            </label>
          </div>
        </div>

        <div className="companion-subsection">
          <h3>本地语音</h3>
          <div className="field-row">
            <div>
              <div className="field-label">启用语音</div>
              <div className="field-note">语音默认关闭；播放前仍需获得主机音频租约。</div>
            </div>
            <Toggle
              ariaLabel="Enable companion voice"
              checked={settings.companion.voice.enabled}
              onChange={(enabled) => onChange({ companion: { ...settings.companion, voice: { ...settings.companion.voice, enabled } } })}
            />
          </div>
          <div className="field-row">
            <label className="field-label" htmlFor="companion-voice-language">语音语言</label>
            <select
              id="companion-voice-language"
              className="text-input"
              aria-label="Companion voice language"
              value={settings.companion.voice.language}
              onChange={(event) => onChange({
                companion: { ...settings.companion, voice: { ...settings.companion.voice, language: event.target.value as ControlCenterSettings['companion']['voice']['language'] } }
              })}
            >
              <option value="zh-CN">中文（中国）</option>
              <option value="en-US">English (US)</option>
            </select>
          </div>
          <div className="field-row">
            <div>
              <div className="field-label">语音音量</div>
              <div className="field-note">{Math.round(settings.companion.voice.volume * 100)}%</div>
            </div>
            <input
              className="range"
              aria-label="Companion voice volume"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.companion.voice.volume}
              onChange={(event) => onChange({
                companion: { ...settings.companion, voice: { ...settings.companion.voice, volume: Number(event.target.value) } }
              })}
            />
          </div>
        </div>

        <div className="companion-subsection">
          <h3>空闲动作</h3>
          <div className="field-row">
            <div>
              <div className="field-label">启用空闲动作</div>
              <div className="field-note">只影响无活动注意力时的环境动作。</div>
            </div>
            <Toggle
              ariaLabel="Enable companion idle motion"
              checked={settings.companion.idleMotion.enabled}
              onChange={(enabled) => onChange({ companion: { ...settings.companion, idleMotion: { ...settings.companion.idleMotion, enabled } } })}
            />
          </div>
          <div className="field-row">
            <div>
              <div className="field-label">动作强度</div>
              <div className="field-note">{Math.round(settings.companion.idleMotion.intensity * 100)}%</div>
            </div>
            <input
              className="range"
              aria-label="Companion idle motion intensity"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.companion.idleMotion.intensity}
              onChange={(event) => onChange({
                companion: { ...settings.companion, idleMotion: { ...settings.companion.idleMotion, intensity: Number(event.target.value) } }
              })}
            />
          </div>
        </div>
      </section>

      <section className="section companion-diagnostics" data-testid="companion-diagnostics" aria-label="Companion 运行时诊断">
        <div className="card-header">
          <div className="card-header-copy">
            <h2 className="card-title">运行时诊断</h2>
            <p className="card-description">只显示状态、计数和原因码，不保存消息正文或原始会话标识。</p>
          </div>
          <div className="card-header-actions">
            <button type="button" className="ghost" onClick={() => void onRefreshCompanionDiagnostics()}>刷新诊断</button>
          </div>
        </div>
        {companionDiagnostics ? (
          <>
            <div className="companion-diagnostics-grid">
              <div className="companion-diagnostic-item">
                <span>选中注意力</span>
                <strong>{companionDiagnostics.attention ? companionStatusLabels[companionDiagnostics.attention.status] || companionDiagnostics.attention.status : '无'}</strong>
                <small>{compactSessionKey(companionDiagnostics.attention?.sessionKey)}</small>
              </div>
              <div className="companion-diagnostic-item">
                <span>会话数量</span>
                <strong>{companionDiagnostics.attentionSessionCount}</strong>
                <small>当前内存槽位</small>
              </div>
              <div className="companion-diagnostic-item">
                <span>队列深度</span>
                <strong>{companionDiagnostics.queues.notice + companionDiagnostics.queues.dialogue + companionDiagnostics.queues.action}</strong>
                <small>提示 {companionDiagnostics.queues.notice} · 动作 {companionDiagnostics.queues.action}</small>
              </div>
              <div className="companion-diagnostic-item">
                <span>音频租约</span>
                <strong>{companionDiagnostics.audioLease.active ? '占用中' : '空闲'}</strong>
                <small>{companionDiagnostics.audioLease.active ? `${companionDiagnostics.audioLease.role} · ${formatLeaseRemaining(companionDiagnostics.audioLease.expiresAt)}` : '没有播放方'}</small>
              </div>
            </div>
            <div className="companion-diagnostics-meta">
              <span>优先级：{companionDiagnostics.attention ? companionPriorityLabels[companionDiagnostics.attention.priority] || companionDiagnostics.attention.priority : '无'}</span>
              <span>原因：{companionDiagnostics.attention?.reason || '无'}</span>
              <span>活动提示：{companionDiagnostics.active.notice ? '是' : '否'}</span>
              <span>活动动作：{companionDiagnostics.active.action ? '是' : '否'}</span>
            </div>
            <div className="companion-decision-list">
              <div className="field-label">最近决策</div>
              {companionDiagnostics.decisions.length ? companionDiagnostics.decisions.slice(-8).reverse().map((decision) => (
                <div className="companion-decision-row" key={`${decision.intentId}-${decision.lane}-${decision.outcome}`}>
                  <span className={decision.accepted ? 'badge badge-success' : 'badge badge-neutral'}>{decision.accepted ? '接受' : '抑制'}</span>
                  <span>{decision.lane} · {decision.outcome}</span>
                  <code>{decision.reason}</code>
                  <small>队列 {decision.queueDepth}</small>
                </div>
              )) : <div className="empty-chat">暂无决策记录</div>}
            </div>
          </>
        ) : <div className="empty-chat">诊断暂不可用，稍后自动重试。</div>}
      </section>

      <div className="status-line">
        {status || `原始大小 ${Math.round(originalSettings.scale * 100)}%`}
      </div>
    </section>
  )
}
