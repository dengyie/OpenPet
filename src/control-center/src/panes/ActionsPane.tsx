import { useEffect, useState } from 'react'
import type {
  ActionEntry,
  ActionTriggerRuntimeDecisionViewState,
  ActionTriggerRuntimeDiagnosticsViewState,
  ActionTriggerRule,
  ActionTriggerProposalInboxItem,
  ActionTriggerProposalAcceptanceResult,
  ActionTriggerProposalType,
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
  onApplyTriggerProposal: () => void | Promise<void>
  onAcceptTriggerProposal: (proposalId: string) => void | Promise<void>
  onRejectTriggerProposal: (proposalId: string) => void | Promise<void>
  onChangeTriggerRule: (ruleId: string, partial: Partial<ActionTriggerRule>) => void
  onRemoveTriggerRule: (ruleId: string) => void
  triggerProposalType: ActionTriggerProposalType
  setTriggerProposalType: (value: ActionTriggerProposalType) => void
  triggerProposalNotes: string
  setTriggerProposalNotes: (value: string) => void
  lastTriggerProposalResult: ActionTriggerProposalAcceptanceResult | null
}

const triggerProposalDetails: Record<ActionTriggerProposalType, {
  label: string
  summary: string
  outcome: string
  boundary: string
  buttonLabel: string
}> = {
  click: {
    label: '点击',
    summary: '把选中的动作设为点击桌宠时播放的动作。',
    outcome: '接受后会立即把 clickAction 改成目标动作。',
    boundary: '只允许写入 host 拥有的 clickAction 绑定，不开放插件直接改配置。',
    buttonLabel: '应用点击触发'
  },
  manual: {
    label: '菜单',
    summary: '动作保留在动作库和菜单里，由用户手动触发。',
    outcome: '接受后只确认提案，不会修改默认动作或点击动作。',
    boundary: '菜单可见性由动作导入结果决定，当前无需额外触发规则。',
    buttonLabel: '确认菜单触发'
  },
  random: {
    label: '随机',
    summary: '建议作为随机/周期性行为使用。',
    outcome: '接受后会保存一条宿主随机规则，后续可在下方规则列表继续编辑。',
    boundary: '当前只持久化规则配置，不在这个里程碑里实现运行时执行器。',
    buttonLabel: '保存随机规则'
  },
  state: {
    label: '状态',
    summary: '建议由 hover、idle、心情、靠近等运行状态触发。',
    outcome: '接受后会保存一条宿主状态规则，后续可在下方规则列表继续编辑。',
    boundary: '状态条件和优先级仍由 host 控制，这一轮只补持久化和编辑闭环。',
    buttonLabel: '保存状态规则'
  },
  event: {
    label: '事件',
    summary: '建议由插件事件、本地 API 事件或系统事件触发。',
    outcome: '接受后会保存一条宿主事件规则，后续可在下方规则列表继续编辑。',
    boundary: '事件来源与匹配仍由 host 约束，这一轮只补持久化配置面。',
    buttonLabel: '保存事件规则'
  },
  unbound: {
    label: '不绑定',
    summary: '动作导入后暂不配置自动触发。',
    outcome: '接受后只确认提案，不会修改任何触发绑定。',
    boundary: '用户之后仍可在 Actions 或未来规则编辑器里手动绑定。',
    buttonLabel: '确认不绑定'
  }
}

const triggerProposalStatusLabel: Record<ActionTriggerProposalInboxItem['status'], string> = {
  pending: '待审核',
  accepted: '已接受',
  rejected: '已拒绝',
  applied: '已应用',
  'pending-host-rule': '待规则'
}

const triggerRuleTypeLabel: Record<ActionTriggerRule['type'], string> = {
  random: '随机',
  state: '状态',
  event: '事件'
}

const triggerRuntimeOutcomeLabel: Record<ActionTriggerRuntimeDecisionViewState['outcome'], string> = {
  matched: 'matched',
  skipped: 'skipped',
  blocked: 'blocked'
}

const getTriggerResultTitle = (result: ActionTriggerProposalAcceptanceResult) => {
  if (result.code === 'rule_saved') return '最近结果：已保存规则'
  if (result.applied) return '最近结果：已应用'
  return '最近结果：已确认'
}

const getTriggerRulePreview = ({
  type,
  action,
  notes
}: {
  type: ActionTriggerProposalType
  action?: ActionEntry
  notes: string
}) => {
  const trimmedNotes = notes.trim()
  if (type === 'click') {
    return {
      title: '立即应用',
      rows: [
        `类型：点击`,
        `目标动作：${action?.label || action?.id || '未选择'}`,
        '绑定：clickAction',
        '结果：立即改写点击动作'
      ],
      notes: trimmedNotes ? `备注：${trimmedNotes}` : '备注：无'
    }
  }
  if (type === 'manual') {
    return {
      title: '仅确认提案',
      rows: [
        '类型：菜单',
        `目标动作：${action?.label || action?.id || '未选择'}`,
        '绑定：无需自动绑定',
        '结果：保留在动作菜单中手动触发'
      ],
      notes: trimmedNotes ? `备注：${trimmedNotes}` : '备注：无'
    }
  }
  if (type === 'unbound') {
    return {
      title: '保留未绑定',
      rows: [
        '类型：不绑定',
        `目标动作：${action?.label || action?.id || '未选择'}`,
        '绑定：无',
        '结果：仅导入动作，不创建自动触发'
      ],
      notes: trimmedNotes ? `备注：${trimmedNotes}` : '备注：无'
    }
  }

  const binding = type === 'state' ? 'idle' : (type === 'event' ? 'plugin:event' : '每 60000ms')
  const outcome = type === 'random'
    ? '保存宿主随机规则，不修改点击动作'
    : (type === 'state'
        ? '保存宿主状态规则，不修改点击动作'
        : '保存宿主事件规则，不修改点击动作')

  return {
    title: '保存前预览',
    rows: [
      `类型：${type === 'random' ? '随机' : (type === 'state' ? '状态' : '事件')}`,
      `目标动作：${action?.label || action?.id || '未选择'}`,
      `绑定：${binding}`,
      `结果：${outcome}`
    ],
    notes: trimmedNotes ? `备注：${trimmedNotes}` : '备注：无'
  }
}

function TriggerRulesCard({
  rules,
  actions,
  working,
  onChangeRule,
  onRemoveRule
}: {
  rules: ActionTriggerRule[]
  actions: ActionEntry[]
  working: boolean
  onChangeRule: (ruleId: string, partial: Partial<ActionTriggerRule>) => void
  onRemoveRule: (ruleId: string) => void
}) {
  if (!rules.length) {
    return (
      <div className="trigger-inbox-card" aria-label="宿主触发规则">
        <div className="trigger-review-header">
          <div>
            <strong>宿主触发规则</strong>
            <span>这里显示已保存的 random / state / event 规则。修改后通过上方“保存配置”落盘。</span>
          </div>
          <span className="trigger-badge applied">空</span>
        </div>
        <div className="empty-chat">暂无已保存规则</div>
      </div>
    )
  }

  return (
    <div className="trigger-inbox-card" aria-label="宿主触发规则">
      <div className="trigger-review-header">
        <div>
          <strong>宿主触发规则</strong>
          <span>{rules.length} 条已保存规则 · 修改后需要点击“保存配置”</span>
        </div>
        <span className="trigger-badge pending">Host owned</span>
      </div>
      <div className="trigger-rules-grid">
        {rules.map((rule) => (
          <div className="trigger-rule-item" key={rule.id}>
            <div className="trigger-inbox-main">
              <div>
                <strong>{actions.find((action) => action.id === rule.actionId)?.label || rule.actionId}</strong>
                <span>{triggerRuleTypeLabel[rule.type]} · {rule.id}</span>
              </div>
              <span className={`trigger-badge ${rule.enabled ? 'applied' : 'rejected'}`}>
                {rule.enabled ? '已启用' : '已停用'}
              </span>
            </div>

            <div className="readonly-row trigger-review-row">
              <span>类型</span>
              <select
                className="text-input"
                value={rule.type}
                disabled
              >
                <option value={rule.type}>{triggerRuleTypeLabel[rule.type]}</option>
              </select>
            </div>

            <div className="readonly-row trigger-review-row">
              <span>动作</span>
              <select
                className="text-input"
                value={rule.actionId}
                disabled={working}
                onChange={(event) => onChangeRule(rule.id, { actionId: event.target.value })}
              >
                {actions.map((action) => (
                  <option value={action.id || ''} key={`${rule.id}:${action.id || action.label}`}>{action.label || action.id}</option>
                ))}
              </select>
            </div>

            <div className="readonly-row trigger-review-row">
              <span>启用</span>
              <select
                className="text-input"
                value={rule.enabled ? 'enabled' : 'disabled'}
                disabled={working}
                onChange={(event) => onChangeRule(rule.id, { enabled: event.target.value === 'enabled' })}
              >
                <option value="enabled">启用</option>
                <option value="disabled">停用</option>
              </select>
            </div>

            {rule.type === 'random' ? (
              <label className="field-row trigger-review-row">
                <span className="field-label">间隔毫秒</span>
                <input
                  className="text-input"
                  type="number"
                  min={1000}
                  step={1000}
                  value={String(rule.intervalMs || 60000)}
                  onChange={(event) => onChangeRule(rule.id, { intervalMs: Math.max(1000, Number(event.target.value || 60000)) })}
                />
              </label>
            ) : (
              <label className="field-row trigger-review-row">
                <span className="field-label">{rule.type === 'state' ? '状态绑定' : '事件绑定'}</span>
                <input
                  className="text-input"
                  value={rule.binding}
                  placeholder={rule.type === 'state' ? 'idle' : 'plugin:event'}
                  onChange={(event) => onChangeRule(rule.id, { binding: event.target.value })}
                />
              </label>
            )}

            <label className="field-row trigger-review-row">
              <span className="field-label">备注</span>
              <input
                className="text-input"
                value={rule.notes}
                placeholder="记录触发规则用途"
                onChange={(event) => onChangeRule(rule.id, { notes: event.target.value })}
              />
            </label>

            <div className="trigger-inbox-meta">
              {rule.sourcePluginId ? <span>来源：{rule.sourcePluginId}</span> : null}
              {rule.sourceRunId ? <span>Run：{rule.sourceRunId}</span> : null}
              {rule.sourceCommandId ? <span>命令：{rule.sourceCommandId}</span> : null}
              <span>更新：{rule.updatedAt || rule.createdAt || '-'}</span>
            </div>

            <div className="inline-action">
              <button type="button" className="ghost" disabled={working} onClick={() => onRemoveRule(rule.id)}>
                从配置中移除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TriggerRuntimeDiagnosticsCard({
  diagnostics,
  actions
}: {
  diagnostics: ActionTriggerRuntimeDiagnosticsViewState
  actions: ActionEntry[]
}) {
  const decisions = Array.isArray(diagnostics.decisions) ? diagnostics.decisions : []
  const counts = decisions.reduce((summary, entry) => {
    summary[entry.outcome] += 1
    return summary
  }, { matched: 0, skipped: 0, blocked: 0 })

  return (
    <div className="trigger-inbox-card" aria-label="触发规则运行时诊断">
      <div className="trigger-review-header">
        <div>
          <strong>触发规则运行时诊断</strong>
          <span>当前动作：{diagnostics.currentState?.actionId || '未记录'} · 最近 {decisions.length} 条</span>
        </div>
        <span className="trigger-badge pending">Runtime</span>
      </div>

      <div className="trigger-diagnostics-summary">
        <span>matched {counts.matched}</span>
        <span>skipped {counts.skipped}</span>
        <span>blocked {counts.blocked}</span>
      </div>

      {decisions.length ? (
        <div className="trigger-inbox-grid">
          {decisions.map((entry, index) => {
            const actionLabel = actions.find((action) => action.id === entry.actionId)?.label || entry.actionId
            return (
              <div className={`trigger-inbox-item ${entry.outcome === 'blocked' ? 'rejected' : (entry.outcome === 'matched' ? 'pending' : '')}`} key={`${entry.ruleId}:${index}`}>
                <div className="trigger-inbox-main">
                  <div>
                    <strong>{entry.ruleId}</strong>
                    <span>{triggerRuleTypeLabel[entry.triggerType]} · {triggerRuntimeOutcomeLabel[entry.outcome]}</span>
                  </div>
                  <span className={`trigger-badge ${entry.outcome === 'blocked' ? 'rejected' : (entry.outcome === 'matched' ? 'applied' : 'pending')}`}>
                    {triggerRuntimeOutcomeLabel[entry.outcome]}
                  </span>
                </div>
                <div className="trigger-inbox-meta">
                  <span>动作：{actionLabel || '未找到动作'}</span>
                  <span>绑定：{entry.binding || '-'}</span>
                  <span>来源：{entry.source || '-'}</span>
                  <span>原因：{entry.reason || '-'}</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="empty-chat">暂无运行时决策记录</div>
      )}
    </div>
  )
}

function TriggerProposalInbox({
  proposals,
  actions,
  working,
  onAccept,
  onReject
}: {
  proposals: ActionTriggerProposalInboxItem[]
  actions: ActionEntry[]
  working: boolean
  onAccept: (proposalId: string) => void | Promise<void>
  onReject: (proposalId: string) => void | Promise<void>
}) {
  const sortedProposals = [...proposals].sort((left, right) => {
    if (left.status === 'pending' && right.status !== 'pending') return -1
    if (right.status === 'pending' && left.status !== 'pending') return 1
    return String(right.updatedAt || right.createdAt).localeCompare(String(left.updatedAt || left.createdAt))
  })

  if (!sortedProposals.length) {
    return (
      <div className="trigger-inbox-card" aria-label="触发提案 Inbox">
        <div className="trigger-review-header">
          <div>
            <strong>触发提案 Inbox</strong>
            <span>Creator Studio 和插件提交的触发建议会在这里等待用户确认。</span>
          </div>
          <span className="trigger-badge applied">空</span>
        </div>
        <div className="empty-chat">暂无待审核提案</div>
      </div>
    )
  }

  return (
    <div className="trigger-inbox-card" aria-label="触发提案 Inbox">
      <div className="trigger-review-header">
        <div>
          <strong>触发提案 Inbox</strong>
          <span>{sortedProposals.filter((proposal) => proposal.status === 'pending').length} 条待审核 · {sortedProposals.length} 条总记录</span>
        </div>
        <span className="trigger-badge pending">Review queue</span>
      </div>
      <div className="trigger-inbox-grid">
        {sortedProposals.map((proposal) => {
          const action = actions.find((candidate) => candidate.id === proposal.actionId)
          const details = triggerProposalDetails[proposal.type] || triggerProposalDetails.unbound
          const isPending = proposal.status === 'pending'
          const badgeTone = proposal.status === 'pending' || proposal.status === 'pending-host-rule'
            ? 'pending'
            : (proposal.status === 'rejected' ? 'rejected' : 'applied')
          return (
            <div className={`trigger-inbox-item ${proposal.status}`} key={proposal.id}>
              <div className="trigger-inbox-main">
                <div>
                  <strong>{action?.label || proposal.actionId}</strong>
                  <span>{proposal.actionId} · {details.label}</span>
                </div>
                <span className={`trigger-badge ${badgeTone}`}>
                  {triggerProposalStatusLabel[proposal.status] || proposal.status}
                </span>
              </div>
              {proposal.message ? <p>{proposal.message}</p> : <p>{details.summary}</p>}
              <div className="trigger-inbox-meta">
                {proposal.sourcePluginId ? <span>来源：{proposal.sourcePluginId}</span> : null}
                {proposal.sourceRunId ? <span>Run：{proposal.sourceRunId}</span> : null}
                {proposal.resultCode ? <span>结果：{proposal.resultCode}</span> : null}
                {proposal.rejectionReason ? <span>原因：{proposal.rejectionReason}</span> : null}
              </div>
              {isPending ? (
                <div className="inline-action">
                  <button type="button" className="ghost" disabled={working} onClick={() => onReject(proposal.id)}>
                    拒绝
                  </button>
                  <button type="button" className="primary" disabled={working} onClick={() => onAccept(proposal.id)}>
                    接受提案
                  </button>
                </div>
              ) : null}
            </div>
          )
        })}
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
  onRemovePetPack,
  onApplyTriggerProposal,
  onAcceptTriggerProposal,
  onRejectTriggerProposal,
  onChangeTriggerRule,
  onRemoveTriggerRule,
  triggerProposalType,
  setTriggerProposalType,
  triggerProposalNotes,
  setTriggerProposalNotes,
  lastTriggerProposalResult
}: ActionsPaneProps) {
  const selectedAction = actionsConfig.actions.find((action) => action.id === selectedActionId)
    || actionsConfig.actions.find((action) => action.id === actionsConfig.defaultAction)
    || actionsConfig.actions[0]
  const selectedActionLabel = selectedAction?.label || selectedAction?.id || '未选择'
  const triggerDetails = triggerProposalDetails[triggerProposalType]
  const triggerPreview = getTriggerRulePreview({
    type: triggerProposalType,
    action: selectedAction,
    notes: triggerProposalNotes
  })

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

        <div className="trigger-review-card" aria-label="触发建议审阅">
          <div className="trigger-review-header">
            <div>
              <strong>触发建议审阅</strong>
              <span>目标动作：{selectedActionLabel}</span>
            </div>
            <span className={triggerProposalType === 'click' ? 'trigger-badge applied' : 'trigger-badge pending'}>
              {triggerDetails.label}
            </span>
          </div>

          <div className="readonly-row trigger-review-row">
            <span>建议类型</span>
            <select
              className="text-input"
              value={triggerProposalType}
              onChange={(event) => setTriggerProposalType(event.target.value as ActionTriggerProposalType)}
            >
              <option value="click">点击</option>
              <option value="manual">菜单</option>
              <option value="random">随机</option>
              <option value="state">状态</option>
              <option value="event">事件</option>
              <option value="unbound">不绑定</option>
            </select>
          </div>

          <label className="field-row trigger-review-row">
            <span className="field-label">建议备注</span>
            <input
              className="text-input"
              value={triggerProposalNotes}
              placeholder={selectedAction?.id ? `目标动作 ${selectedAction.id}` : '选择动作后应用'}
              onChange={(event) => setTriggerProposalNotes(event.target.value)}
            />
          </label>

          <div className="trigger-review-copy">
            <span><strong>含义</strong>{triggerDetails.summary}</span>
            <span><strong>接受结果</strong>{triggerDetails.outcome}</span>
            <span><strong>边界</strong>{triggerDetails.boundary}</span>
          </div>

          <div className="trigger-preview-card">
            <strong>{triggerPreview.title}</strong>
            {triggerPreview.rows.map((row) => (
              <span key={row}>{row}</span>
            ))}
            <span>{triggerPreview.notes}</span>
          </div>

          {lastTriggerProposalResult ? (
            <div className={lastTriggerProposalResult.applied ? 'trigger-result applied' : 'trigger-result pending'}>
              <strong>{getTriggerResultTitle(lastTriggerProposalResult)}</strong>
              <span>{lastTriggerProposalResult.message}</span>
              <span>结果码：{lastTriggerProposalResult.code}</span>
            </div>
          ) : null}

          <div className="inline-action">
            <button type="button" className="ghost" onClick={onApplyTriggerProposal} disabled={working || !selectedAction?.id}>
              {triggerDetails.buttonLabel}
            </button>
          </div>
        </div>

        <TriggerProposalInbox
          proposals={actionsConfig.triggerProposalInbox || []}
          actions={actionsConfig.actions}
          working={working}
          onAccept={onAcceptTriggerProposal}
          onReject={onRejectTriggerProposal}
        />

        <TriggerRulesCard
          rules={actionsConfig.triggerRules || []}
          actions={actionsConfig.actions}
          working={working}
          onChangeRule={onChangeTriggerRule}
          onRemoveRule={onRemoveTriggerRule}
        />

        <TriggerRuntimeDiagnosticsCard
          diagnostics={actionsConfig.triggerRuntimeDiagnostics}
          actions={actionsConfig.actions}
        />
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
