import { useEffect, useState } from 'react'
import type {
  ActionEntry,
  ActionTriggerRule,
  ActionTriggerRuleType,
  ActionsConfigViewState,
  CompletedActionFrameInspectionResult,
  PetPackInspectionResult,
  PetPackPreviewAction,
  PetPacksViewState
} from '../../../shared/openpet-contracts'

export interface ActionImportDraft {
  actionId: string
  label: string
}

export interface ActionsPaneProps {
  actionsConfig: ActionsConfigViewState
  petPacks: PetPacksViewState
  selectedActionId: string
  importDraft: ActionImportDraft
  importInspection: CompletedActionFrameInspectionResult | null
  petPackInspection: PetPackInspectionResult | null
  status: string
  working: boolean
  onSelectAction: (actionId: string) => void
  onChangeImportDraft: (partial: Partial<ActionImportDraft>, clearInspection?: boolean) => void
  onChangeConfig: (partial: Partial<ActionsConfigViewState>) => void
  onAddTriggerRule: (type: ActionTriggerRuleType) => void
  onChangeTriggerRule: (ruleId: string, partial: Partial<ActionTriggerRule>) => void
  onDeleteTriggerRule: (ruleId: string) => void
  onPreviewTriggerRule: (rule: ActionTriggerRule) => void
  onSaveConfig: () => void | Promise<void>
  onInspect: () => void | Promise<void>
  onReinspect: () => void | Promise<void>
  onClearInspection: () => void | Promise<void>
  onImport: () => void | Promise<void>
  onDelete: (actionId: string) => void | Promise<void>
  onInspectPetPack: () => void | Promise<void>
  onClearPetPackInspection: () => void | Promise<void>
  onImportPetPack: () => void | Promise<void>
  onExportPetPack: (packId: string) => void | Promise<void>
  onSetActivePetPack: (packId: string) => void | Promise<void>
  onRemovePetPack: (packId: string) => void | Promise<void>
}

const triggerTypeLabels: Record<ActionTriggerRuleType, string> = {
  random: '随机',
  state: '状态',
  event: '事件'
}

function TriggerRuleEditor({
  rule,
  actions,
  working,
  onChange,
  onDelete,
  onPreview
}: {
  rule: ActionTriggerRule
  actions: ActionEntry[]
  working: boolean
  onChange: (ruleId: string, partial: Partial<ActionTriggerRule>) => void
  onDelete: (ruleId: string) => void
  onPreview: (rule: ActionTriggerRule) => void
}) {
  const actionOptions = actions.filter((action) => action.id)
  const ruleType = rule.type || 'state'
  const actionLabel = actions.find((action) => action.id === rule.actionId)?.label || rule.actionId

  return (
    <div className="trigger-rule-row">
      <div className="trigger-rule-header">
        <label className="switch-row compact-switch">
          <input
            type="checkbox"
            role="switch"
            aria-label={`Enable trigger rule ${rule.label}`}
            checked={Boolean(rule.enabled)}
            disabled={working}
            onChange={(event) => onChange(rule.id, { enabled: event.target.checked })}
          />
          <span>{rule.enabled ? '启用' : '停用'}</span>
        </label>
        <div className="trigger-rule-title">
          <strong>{rule.label || `${triggerTypeLabels[ruleType]}触发`}</strong>
          <span>{triggerTypeLabels[ruleType]} · {actionLabel || '未绑定动作'} · {rule.source}</span>
        </div>
        <div className="trigger-rule-actions">
          <button type="button" className="ghost" disabled={working} onClick={() => onPreview(rule)}>模拟预览</button>
          <button type="button" className="danger-text" disabled={working} onClick={() => onDelete(rule.id)}>删除</button>
        </div>
      </div>

      <div className="trigger-rule-fields">
        <label>
          <span>名称</span>
          <input
            className="text-input"
            value={rule.label || ''}
            disabled={working}
            onChange={(event) => onChange(rule.id, { label: event.target.value })}
          />
        </label>
        <label>
          <span>动作</span>
          <select
            className="text-input"
            value={rule.actionId || ''}
            disabled={working}
            onChange={(event) => onChange(rule.id, { actionId: event.target.value })}
          >
            {actionOptions.map((action) => (
              <option value={action.id || ''} key={action.id}>{action.label || action.id}</option>
            ))}
          </select>
        </label>

        {ruleType === 'random' ? (
          <>
            <label>
              <span>间隔 ms</span>
              <input
                className="text-input"
                type="number"
                min="1000"
                step="1000"
                value={rule.intervalMs ?? 60000}
                disabled={working}
                onChange={(event) => onChange(rule.id, { intervalMs: Number(event.target.value) })}
              />
            </label>
            <label>
              <span>概率</span>
              <input
                className="text-input"
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={rule.probability ?? 0.2}
                disabled={working}
                onChange={(event) => onChange(rule.id, { probability: Number(event.target.value) })}
              />
            </label>
          </>
        ) : null}

        {ruleType === 'state' ? (
          <label>
            <span>状态</span>
            <input
              className="text-input"
              value={rule.state || ''}
              placeholder="idle"
              disabled={working}
              onChange={(event) => onChange(rule.id, { state: event.target.value })}
            />
          </label>
        ) : null}

        {ruleType === 'event' ? (
          <label>
            <span>事件名</span>
            <input
              className="text-input"
              value={rule.eventName || ''}
              placeholder="openpet:event"
              disabled={working}
              onChange={(event) => onChange(rule.id, { eventName: event.target.value })}
            />
          </label>
        ) : null}
      </div>
    </div>
  )
}

function ActionPreview({ action }: { action?: ActionEntry }) {
  const [frameIndex, setFrameIndex] = useState(0)

  useEffect(() => {
    setFrameIndex(0)
    const frameCount = Number(action?.frameCount || 0)
    if (!action || frameCount <= 1) return undefined
    let timeoutId = 0
    const tick = () => {
      setFrameIndex((current) => {
        const next = (current + 1) % frameCount
        const durations = Array.isArray(action.frameDurations) ? action.frameDurations : []
        timeoutId = window.setTimeout(tick, durations[next] || action.frameMs || 100)
        return next
      })
    }
    const durations = Array.isArray(action.frameDurations) ? action.frameDurations : []
    timeoutId = window.setTimeout(tick, durations[0] || action.frameMs || 100)
    return () => window.clearTimeout(timeoutId)
  }, [action])

  if (!action) {
    return <div className="action-preview empty-chat">暂无可预览动作</div>
  }

  const frameWidth = Number(action.frameWidth || 0)
  const frameHeight = Number(action.frameHeight || 0)
  const fitScale = frameWidth && frameHeight
    ? Math.min(1, 220 / frameWidth, 180 / frameHeight)
    : 1
  const displayWidth = Math.max(1, Math.round(frameWidth * fitScale))
  const displayHeight = Math.max(1, Math.round(frameHeight * fitScale))
  const sprite = action.previewSprite || action.sprite
  const frameColumn = Number(action.frameColumn || 0)
  const frameRow = Number(action.frameRow || 0)
  const atlasColumns = Number(action.atlas?.columns || action.frameCount || 1)
  const atlasRows = Number(action.atlas?.rows || 1)

  return (
    <div className="action-preview">
      <div className="preview-stage">
        {sprite && frameWidth && frameHeight ? (
          <div
            className="preview-sprite"
            style={{
              width: `${displayWidth}px`,
              height: `${displayHeight}px`,
              backgroundImage: `url(${sprite})`,
              backgroundPositionX: `${-((frameColumn + frameIndex) * displayWidth)}px`,
              backgroundPositionY: `${-(frameRow * displayHeight)}px`,
              backgroundSize: `${atlasColumns * displayWidth}px ${atlasRows * displayHeight}px`
            }}
          />
        ) : <div className="empty-chat">无预览图片</div>}
      </div>
      <div className="preview-meta">
        <strong>{action.label || action.id}</strong>
        <span>{action.frameCount || 0} frames · {action.frameMs || 100}ms</span>
      </div>
    </div>
  )
}

function SpriteFrame({
  sprite,
  action,
  className = 'sprite-frame'
}: {
  sprite?: string
  action?: ActionEntry | PetPackPreviewAction | null
  className?: string
}) {
  if (!sprite || !action) return <div className="pet-pack-thumb" />
  const frameWidth = Number(action.frameWidth || 0)
  const frameHeight = Number(action.frameHeight || 0)
  if (!frameWidth || !frameHeight) return <div className="pet-pack-thumb" />

  const frameColumn = Number(action.frameColumn || 0)
  const frameRow = Number(action.frameRow || 0)
  const atlasColumns = Number(action.atlas?.columns || action.frameCount || 1)
  const atlasRows = Number(action.atlas?.rows || 1)

  return (
    <div
      className={className}
      style={{
        backgroundImage: `url(${sprite})`,
        backgroundPositionX: `${-(frameColumn * 52)}px`,
        backgroundPositionY: `${-(frameRow * 52)}px`,
        backgroundSize: `${atlasColumns * 52}px ${atlasRows * 52}px`
      }}
    />
  )
}

function FrameInspectionReport({ report }: { report: CompletedActionFrameInspectionResult | null }) {
  if (!report) return null
  const inspection = report.inspection || {}
  const frames = Array.isArray(inspection.frames) ? inspection.frames : []
  const skippedFiles = Array.isArray(inspection.skippedFiles) ? inspection.skippedFiles : []
  const errors = Array.isArray(inspection.errors) ? inspection.errors : []
  const warnings = Array.isArray(inspection.warnings) ? inspection.warnings : []

  return (
    <div className={inspection.valid ? 'inspection-report' : 'inspection-report invalid'}>
      <div className="inspection-summary">
        <strong>{report.folderName}</strong>
        <span>{inspection.frameCount || 0} 帧 · 最大尺寸 {inspection.maxWidth || 0}x{inspection.maxHeight || 0}</span>
      </div>
      {errors.length ? (
        <div className="inspection-block error">
          <strong>错误</strong>
          {errors.map((error) => <span key={error}>{error}</span>)}
        </div>
      ) : null}
      {warnings.length ? (
        <div className="inspection-block">
          <strong>提示</strong>
          {warnings.map((warning) => <span key={warning}>{warning}</span>)}
        </div>
      ) : null}
      {skippedFiles.length ? (
        <div className="inspection-block">
          <strong>已忽略文件</strong>
          <span>{skippedFiles.join(' · ')}</span>
        </div>
      ) : null}
      {frames.length ? (
        <div className="frame-list">
          {frames.slice(0, 8).map((frame) => (
            <span key={frame.fileName}>{frame.fileName} · {frame.width}x{frame.height}</span>
          ))}
          {frames.length > 8 ? <span>还有 {frames.length - 8} 帧</span> : null}
        </div>
      ) : null}
    </div>
  )
}

function PetPackInspectionReport({ report }: { report: PetPackInspectionResult | null }) {
  if (!report) return null
  const errors = Array.isArray(report.errors) ? report.errors : []
  const pack = report.pack
  const provenance = pack?.provenance || {}
  const conflict = pack?.conflict

  return (
    <div className={report.valid ? 'inspection-report' : 'inspection-report invalid'}>
      <div className="inspection-summary">
        <strong>{report.folderName || 'Pet pack'}</strong>
        <span>{pack ? `${pack.actionCount} 动作 · ${pack.version}` : '未读取到 manifest'}</span>
      </div>
      {pack?.previewSprite ? (
        <div className="pet-pack-preview">
          <SpriteFrame sprite={pack.previewSprite} action={pack.previewAction} />
          <div>
            <strong>{pack.displayName}</strong>
            <span>{pack.id}</span>
            <span>默认 {pack.defaultAction} · 点击 {pack.clickAction}</span>
            {provenance.sourceUrl ? <span>来源 {provenance.sourceUrl}</span> : null}
            {provenance.assetAuthor ? <span>作者 {provenance.assetAuthor}</span> : null}
            {provenance.license ? <span>许可 {provenance.license}</span> : null}
            {provenance.originalFormat ? <span>格式 {provenance.originalFormat}</span> : null}
            {conflict?.decision ? <span>冲突 {conflict.decision} · {conflict.installedVersion || 'none'} {'->'} {conflict.incomingVersion || 'none'}</span> : null}
          </div>
        </div>
      ) : null}
      {errors.length ? (
        <div className="inspection-block error">
          <strong>错误</strong>
          {errors.map((error) => <span key={error}>{error}</span>)}
        </div>
      ) : null}
    </div>
  )
}

export function ActionsPane({
  actionsConfig,
  petPacks,
  selectedActionId,
  importDraft,
  importInspection,
  petPackInspection,
  status,
  working,
  onSelectAction,
  onChangeImportDraft,
  onChangeConfig,
  onAddTriggerRule,
  onChangeTriggerRule,
  onDeleteTriggerRule,
  onPreviewTriggerRule,
  onSaveConfig,
  onInspect,
  onReinspect,
  onClearInspection,
  onImport,
  onDelete,
  onInspectPetPack,
  onClearPetPackInspection,
  onImportPetPack,
  onExportPetPack,
  onSetActivePetPack,
  onRemovePetPack
}: ActionsPaneProps) {
  const selectedAction = actionsConfig.actions.find((action) => action.id === selectedActionId)
    || actionsConfig.actions.find((action) => action.id === actionsConfig.defaultAction)
    || actionsConfig.actions[0]

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
          <button type="button" className="ghost" onClick={onInspect} disabled={working || !importDraft.actionId.trim()}>
            {working ? '处理中' : '选择并检查'}
          </button>
          <button type="button" className="ghost" onClick={onReinspect} disabled={working || !importInspection?.selectionId}>
            重新检查
          </button>
          <button
            type="button"
            className="primary"
            onClick={onImport}
            disabled={working || !importDraft.actionId.trim() || !importInspection?.selectionId || !importInspection?.inspection?.valid}
          >
            确认导入
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
            onChange={(event) => onChangeImportDraft({ actionId: event.target.value }, true)}
          />
        </label>

        <label className="field-row">
          <span className="field-label">显示名称</span>
          <input
            className="text-input"
            value={importDraft.label}
            placeholder="挥手"
            onChange={(event) => onChangeImportDraft({ label: event.target.value })}
          />
        </label>

        {importInspection ? (
          <div className="inspection-row">
            <FrameInspectionReport report={importInspection} />
            <button type="button" className="danger-text" onClick={onClearInspection} disabled={working}>
              清除选择
            </button>
          </div>
        ) : null}

        <div className="readonly-row">
          <span>默认动作</span>
          <select
            className="text-input"
            value={actionsConfig.defaultAction}
            onChange={(event) => onChangeConfig({ defaultAction: event.target.value })}
          >
            {actionsConfig.actions.map((action) => (
              <option value={action.id || ''} key={action.id || action.label}>{action.label || action.id}</option>
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
              <option value={action.id || ''} key={action.id || action.label}>{action.label || action.id}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="actions-workspace">
        <ActionPreview action={selectedAction} />
        <div className="action-list">
          {actionsConfig.actions.length === 0 ? (
            <div className="empty-chat">暂无动作</div>
          ) : actionsConfig.actions.map((action) => {
            const actionId = action.id || ''
            return (
            <div
              className={selectedAction?.id === action.id ? 'action-row selected' : 'action-row'}
              key={action.id || action.label}
              role="button"
              tabIndex={0}
              onClick={() => actionId && onSelectAction(actionId)}
              onKeyDown={(event) => {
                if ((event.key === 'Enter' || event.key === ' ') && actionId) onSelectAction(actionId)
              }}
            >
              <div>
                <strong>{action.label || action.id}</strong>
                <span>{action.id}</span>
              </div>
              <div className="action-meta">
                <span>{action.frameCount} 帧</span>
                <span>{action.frameWidth}x{action.frameHeight}</span>
                <span>{action.loop ? '循环' : '单次'}</span>
                <button
                  type="button"
                  className="danger-text"
                  disabled={working || actionsConfig.actions.length <= 1 || !actionId}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (actionId) onDelete(actionId)
                  }}
                >
                  删除
                </button>
              </div>
            </div>
            )
          })}
        </div>
      </div>

      <div className="trigger-rules-panel">
        <div className="plugin-log-header">
          <div>
            <h2>Trigger Rules</h2>
            <span>保存非点击动作触发草稿，真实调度执行由后续运行时接入</span>
          </div>
          <div className="plugin-log-actions">
            <button type="button" className="ghost" disabled={working || actionsConfig.actions.length === 0} onClick={() => onAddTriggerRule('random')}>新增随机</button>
            <button type="button" className="ghost" disabled={working || actionsConfig.actions.length === 0} onClick={() => onAddTriggerRule('state')}>新增状态</button>
            <button type="button" className="ghost" disabled={working || actionsConfig.actions.length === 0} onClick={() => onAddTriggerRule('event')}>新增事件</button>
          </div>
        </div>

        <div className="trigger-rule-list">
          {(actionsConfig.triggerRules || []).length === 0 ? (
            <div className="empty-chat">暂无触发规则草稿</div>
          ) : (actionsConfig.triggerRules || []).map((rule) => (
            <TriggerRuleEditor
              key={rule.id}
              rule={rule}
              actions={actionsConfig.actions}
              working={working}
              onChange={onChangeTriggerRule}
              onDelete={onDeleteTriggerRule}
              onPreview={onPreviewTriggerRule}
            />
          ))}
        </div>
      </div>

      <div className="pet-pack-panel">
        <div className="plugin-log-header">
          <div>
            <h2>Pet Packs</h2>
            <span>当前 {petPacks.activePackId}</span>
          </div>
          <div className="plugin-log-actions">
            <button type="button" className="ghost" onClick={onInspectPetPack} disabled={working}>选择并检查</button>
            <button
              type="button"
              className="primary"
              onClick={onImportPetPack}
              disabled={working || !petPackInspection?.selectionId || !petPackInspection?.valid}
            >
              导入整包
            </button>
          </div>
        </div>

        {petPackInspection ? (
          <div className="inspection-row">
            <PetPackInspectionReport report={petPackInspection} />
            <button type="button" className="danger-text" onClick={onClearPetPackInspection} disabled={working}>
              清除选择
            </button>
          </div>
        ) : null}

        <div className="pet-pack-list">
          {petPacks.packs.length === 0 ? (
            <div className="empty-chat">暂无 Pet pack</div>
          ) : petPacks.packs.map((pack) => (
            <div className={pack.active ? 'pet-pack-row active' : 'pet-pack-row'} key={pack.id}>
              <div className="pet-pack-identity">
                <SpriteFrame sprite={pack.previewSprite} action={pack.previewAction} />
                <div>
                  <strong>{pack.displayName}</strong>
                  <span>{pack.id} · {pack.version}</span>
                  <span>{pack.source} · {pack.actionCount || 0} 动作</span>
                  {pack.error ? <span className="danger-text">{pack.error}</span> : null}
                </div>
              </div>
              <div className="pet-pack-actions">
                <button type="button" className="ghost" disabled={working || pack.source === 'built-in' || pack.valid === false} onClick={() => onExportPetPack(pack.id)}>
                  导出
                </button>
                <button type="button" className="ghost" disabled={working || pack.active || pack.valid === false} onClick={() => onSetActivePetPack(pack.id)}>
                  {pack.active ? '使用中' : '启用'}
                </button>
                <button type="button" className="danger-text" disabled={working || pack.active || pack.source === 'built-in'} onClick={() => onRemovePetPack(pack.id)}>
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {status ? <div className="status-line">{status}</div> : null}
    </section>
  )
}
