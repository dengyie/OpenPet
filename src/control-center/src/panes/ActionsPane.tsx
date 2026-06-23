import { useEffect, useState } from 'react'
import type {
  ActionEntry,
  ActionTriggerProposalAcceptanceResult,
  ActionTriggerProposalInboxItem,
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
  triggerProposalType: ActionTriggerProposalType
  setTriggerProposalType: (value: ActionTriggerProposalType) => void
  triggerProposalNotes: string
  setTriggerProposalNotes: (value: string) => void
  lastTriggerProposalResult: ActionTriggerProposalAcceptanceResult | null
  selectedTriggerProposalId: string
  setSelectedTriggerProposalId: (value: string) => void
  triggerProposalRejectReason: string
  setTriggerProposalRejectReason: (value: string) => void
  onAcceptInboxTriggerProposal: (proposalId: string) => void | Promise<void>
  onRejectInboxTriggerProposal: (proposalId: string) => void | Promise<void>
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
    outcome: '接受后会标记为待主程序规则，不会立即生效。',
    boundary: '随机频率、冷却和冲突处理需要后续 host trigger-rule schema。',
    buttonLabel: '确认待规则'
  },
  state: {
    label: '状态',
    summary: '建议由 hover、idle、心情、靠近等运行状态触发。',
    outcome: '接受后会标记为待主程序规则，不会立即生效。',
    boundary: '状态条件和优先级必须由 host 统一校验和持久化。',
    buttonLabel: '确认待规则'
  },
  event: {
    label: '事件',
    summary: '建议由插件事件、本地 API 事件或系统事件触发。',
    outcome: '接受后会标记为待主程序规则，不会立即生效。',
    boundary: '事件来源、权限和参数匹配需要 host 规则编辑器确认。',
    buttonLabel: '确认待规则'
  },
  unbound: {
    label: '不绑定',
    summary: '动作导入后暂不配置自动触发。',
    outcome: '接受后只确认提案，不会修改任何触发绑定。',
    boundary: '用户之后仍可在 Actions 或未来规则编辑器里手动绑定。',
    buttonLabel: '确认不绑定'
  }
}

function TriggerProposalInbox({
  proposals,
  selectedProposalId,
  rejectReason,
  working,
  onSelect,
  onChangeRejectReason,
  onAccept,
  onReject
}: {
  proposals: ActionTriggerProposalInboxItem[]
  selectedProposalId: string
  rejectReason: string
  working: boolean
  onSelect: (proposalId: string) => void
  onChangeRejectReason: (value: string) => void
  onAccept: (proposalId: string) => void | Promise<void>
  onReject: (proposalId: string) => void | Promise<void>
}) {
  const pending = proposals.filter((proposal) => proposal.status === 'pending')
  const decided = proposals.filter((proposal) => proposal.status !== 'pending')
  const selectedProposal = proposals.find((proposal) => proposal.id === selectedProposalId) || pending[0] || proposals[0]
  const details = selectedProposal ? triggerProposalDetails[selectedProposal.type] : null

  return (
    <div className="trigger-review-card" aria-label="触发建议 Inbox">
      <div className="trigger-review-header">
        <div>
          <strong>触发建议 Inbox</strong>
          <span>{pending.length} 个待处理 · {decided.length} 个已处理</span>
        </div>
        <span className={pending.length ? 'trigger-badge pending' : 'trigger-badge applied'}>
          {pending.length ? '待确认' : '已清空'}
        </span>
      </div>

      {proposals.length ? (
        <div className="trigger-inbox-grid">
          <div className="trigger-inbox-list">
            {proposals.map((proposal) => {
              const proposalDetails = triggerProposalDetails[proposal.type]
              const selected = proposal.id === selectedProposal?.id
              return (
                <button
                  type="button"
                  className={selected ? 'trigger-inbox-item selected' : 'trigger-inbox-item'}
                  key={proposal.id}
                  onClick={() => onSelect(proposal.id)}
                >
                  <strong>{proposal.actionId}</strong>
                  <span>{proposalDetails.label} · {proposal.status}</span>
                  {proposal.sourcePluginId ? <span>{proposal.sourcePluginId}</span> : null}
                </button>
              )
            })}
          </div>

          {selectedProposal && details ? (
            <div className="trigger-inbox-detail">
              <div className="trigger-review-header compact">
                <div>
                  <strong>{selectedProposal.actionId}</strong>
                  <span>{details.label} · {selectedProposal.submittedAt || '未记录时间'}</span>
                </div>
                <span className={selectedProposal.status === 'accepted' ? 'trigger-badge applied' : 'trigger-badge pending'}>
                  {selectedProposal.status}
                </span>
              </div>
              <div className="trigger-review-copy">
                <span><strong>含义</strong>{details.summary}</span>
                <span><strong>接受结果</strong>{details.outcome}</span>
                <span><strong>备注</strong>{selectedProposal.notes || '无备注'}</span>
                {selectedProposal.sourceRunId ? <span><strong>来源</strong>{selectedProposal.sourceRunId}</span> : null}
                {selectedProposal.result ? <span><strong>结果</strong>{selectedProposal.result.message}</span> : null}
                {selectedProposal.decisionReason ? <span><strong>拒绝原因</strong>{selectedProposal.decisionReason}</span> : null}
              </div>
              {selectedProposal.status === 'pending' ? (
                <>
                  <label className="field-row trigger-review-row">
                    <span className="field-label">拒绝原因</span>
                    <input
                      className="text-input"
                      value={rejectReason}
                      placeholder="可选"
                      onChange={(event) => onChangeRejectReason(event.target.value)}
                    />
                  </label>
                  <div className="inline-action">
                    <button type="button" className="ghost" onClick={() => onAccept(selectedProposal.id)} disabled={working}>
                      接受建议
                    </button>
                    <button type="button" className="danger-text" onClick={() => onReject(selectedProposal.id)} disabled={working}>
                      拒绝建议
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="empty-chat">暂无来自 Creator Studio 或插件的触发建议。</div>
      )}
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
  triggerProposalType,
  setTriggerProposalType,
  triggerProposalNotes,
  setTriggerProposalNotes,
  lastTriggerProposalResult,
  selectedTriggerProposalId,
  setSelectedTriggerProposalId,
  triggerProposalRejectReason,
  setTriggerProposalRejectReason,
  onAcceptInboxTriggerProposal,
  onRejectInboxTriggerProposal
}: ActionsPaneProps) {
  const selectedAction = actionsConfig.actions.find((action) => action.id === selectedActionId)
    || actionsConfig.actions.find((action) => action.id === actionsConfig.defaultAction)
    || actionsConfig.actions[0]
  const selectedActionLabel = selectedAction?.label || selectedAction?.id || '未选择'
  const triggerDetails = triggerProposalDetails[triggerProposalType]

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

        <TriggerProposalInbox
          proposals={actionsConfig.triggerProposalInbox || []}
          selectedProposalId={selectedTriggerProposalId}
          rejectReason={triggerProposalRejectReason}
          working={working}
          onSelect={setSelectedTriggerProposalId}
          onChangeRejectReason={setTriggerProposalRejectReason}
          onAccept={onAcceptInboxTriggerProposal}
          onReject={onRejectInboxTriggerProposal}
        />

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

          {lastTriggerProposalResult ? (
            <div className={lastTriggerProposalResult.applied ? 'trigger-result applied' : 'trigger-result pending'}>
              <strong>{lastTriggerProposalResult.applied ? '最近结果：已应用' : '最近结果：已确认'}</strong>
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
