import { useState } from 'react'
import type {
  CreatorActionAssetViewState,
  CreatorActionAttemptViewState,
  CreatorCanonicalCandidateViewState,
  CreatorStateViewState,
  CreatorWorkflowProgressViewState,
  CreatorWorkflowResult,
  CreatorWorkflowStageViewState
} from '../../../shared/openpet-contracts'

export type CreatorPaneMode = 'new-character' | 'existing-character'

interface NewCharacterDraft {
  characterName: string
  stylePrompt: string
  referenceImageToken: string
  referenceFileName: string
}

interface ExistingActionDraft {
  actionName: string
  motionPrompt: string
  referenceImageToken: string
  referenceFileName: string
}

interface CandidateAcceptanceOptions {
  qualityOverride: boolean
  acknowledgedWarningCodes: string[]
}

export interface CreatorPaneProps {
  creatorState: CreatorStateViewState
  mode: CreatorPaneMode
  newCharacterDraft: NewCharacterDraft
  existingActionDraft: ExistingActionDraft
  status: string
  running: boolean
  previewing: boolean
  openingDashboard: boolean
  result: CreatorWorkflowResult | null
  creatorStudioReady: boolean
  creatorStudioMessage: string
  newCharacterBlockers: string[]
  existingActionBlockers: string[]
  canGenerateNewCharacter: boolean
  canGenerateExistingAction: boolean
  onChangeMode: (mode: CreatorPaneMode) => void
  onChangeNewCharacterDraft: (partial: Partial<NewCharacterDraft>) => void
  onChangeExistingActionDraft: (partial: Partial<ExistingActionDraft>) => void
  onSelectNewCharacterReference: () => void | Promise<void>
  onSelectExistingActionReference: () => void | Promise<void>
  onClearExistingActionReference: () => void | Promise<void>
  onGenerateNewCharacter: () => void | Promise<void>
  onGenerateExistingAction: () => void | Promise<void>
  onPreviewResult: () => void | Promise<void>
  onRestoreClickAction: () => void | Promise<void>
  onRetryFullPetAction: (actionId: string) => void | Promise<void>
  onRetryFullPetIdentity: () => void | Promise<void>
  onAcceptCreatorIdentity: (candidateId: string, sha256: string, options: CandidateAcceptanceOptions) => void | Promise<void>
  onAcceptCreatorActionCandidate: (actionId: string, candidateId: string, sha256: string, options: CandidateAcceptanceOptions) => void | Promise<void>
  onExportCreatorRecoveryBundle: () => void | Promise<void>
  onImportAvailableActions: () => void | Promise<void>
  onOpenCreatorStudioDetails: () => void | Promise<void>
  onCopyText?: (text: string, label?: string, key?: string) => void | Promise<void>
  onLoadAssetPreview?: (relativePath: string) => Promise<string>
  copiedPromptKey?: string
}

const formatWorkflowState = (state: CreatorWorkflowResult['state']) => {
  if (state === 'completed') return '已完成'
  if (state === 'generating') return '进行中'
  if (state === 'awaiting-identity-review') return '等待身份确认'
  if (state === 'recovery-required') return '需要资产恢复'
  if (state === 'provider-not-ready') return 'Provider 未就绪'
  if (state === 'hatch-pet-not-ready') return '生成前置检查失败'
  if (state === 'review-required') return '需要复查'
  if (state === 'preview-ready') return '预览就绪'
  if (state === 'import-failed') return '导入失败'
  return '缺少输入'
}

const formatStageStatus = (status: CreatorWorkflowStageViewState['status']) => {
  if (status === 'completed') return '已完成'
  if (status === 'active') return '进行中'
  if (status === 'failed') return '失败'
  if (status === 'skipped') return '已跳过'
  return '等待中'
}

const formatActionAttemptStatus = (status: CreatorActionAttemptViewState['status']) => {
  if (status === 'passed') return '通过'
  if (status === 'mirrored') return '镜像'
  if (status === 'failed') return '失败'
  if (status === 'running') return '生成中'
  if (status === 'omitted') return '省略'
  return '等待中'
}

const createUniqueActionIds = (values: string[]) => {
  const seen = new Set<string>()
  const items: string[] = []
  for (const value of values) {
    const item = String(value || '').trim()
    if (!item || seen.has(item)) continue
    seen.add(item)
    items.push(item)
  }
  return items
}

const actionToneClass = (status: CreatorActionAttemptViewState['status']) => {
  if (status === 'passed' || status === 'mirrored') return 'ok'
  if (status === 'failed') return 'error'
  return ''
}

const formatFailurePlain = (code: string, message: string, score?: number | null) => {
  const parts = [message || code || '动作未通过质量检查']
  if (code) parts.push(`错误码 ${code}`)
  if (typeof score === 'number') parts.push(`分数 ${score}`)
  return parts.join(' · ')
}

const LazyAssetThumb = ({
  asset,
  actionId,
  onLoadAssetPreview
}: {
  asset: CreatorActionAssetViewState
  actionId: string
  onLoadAssetPreview?: (relativePath: string) => Promise<string>
}) => {
  const [src, setSrc] = useState(asset.previewDataUrl || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    if (src || loading) return
    if (!asset.previewable || !asset.relativePath || !onLoadAssetPreview) {
      setError('不可预览')
      return
    }
    setLoading(true)
    setError('')
    try {
      const next = await onLoadAssetPreview(asset.relativePath)
      if (next) setSrc(next)
      else setError('加载失败')
    } catch (_) {
      setError('加载失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="creator-asset-thumb" data-kind={asset.kind}>
      {src ? (
        <img src={src} alt={`${actionId} ${asset.label}`} />
      ) : (
        <button
          type="button"
          className="creator-asset-thumb-fallback"
          data-testid={`creator-load-preview-${actionId}-${asset.kind}`}
          onClick={() => { void load() }}
          disabled={loading || !asset.previewable}
          title={asset.previewable ? '点击加载预览' : '该资源不可预览'}
        >
          {loading ? '加载中…' : (error || asset.label || asset.kind)}
        </button>
      )}
      <span>{asset.label || asset.kind}</span>
      <code title={asset.relativePath}>{asset.relativePath}</code>
    </div>
  )
}

const ActionMatrix = ({
  actions,
  running,
  canRepair,
  onRetryFullPetAction
}: {
  actions: CreatorActionAttemptViewState[]
  running: boolean
  canRepair: boolean
  onRetryFullPetAction: (actionId: string) => void | Promise<void>
}) => (
  <div className="creator-action-matrix" data-testid="creator-action-matrix">
    {actions.map((action) => (
      <div
        key={action.actionId}
        className={`creator-action-chip ${actionToneClass(action.status)}`.trim()}
        data-testid={`creator-action-chip-${action.actionId}`}
        data-status={action.status}
      >
        <strong>{action.actionId}</strong>
        <span>{formatActionAttemptStatus(action.status)}</span>
        {action.reason ? <span className="creator-action-reason">{action.reason}</span> : null}
        {action.importable ? <span className="creator-action-flag">可导入</span> : null}
        {action.status === 'failed' && canRepair && action.actionId !== 'running-left' ? (
          <button
            type="button"
            className="ghost"
            disabled={running}
            data-testid={`creator-retry-action-${action.actionId}`}
            onClick={() => onRetryFullPetAction(action.actionId)}
          >
            重新生成
          </button>
        ) : null}
      </div>
    ))}
  </div>
)

const AssetReviewBench = ({
  actions,
  actionAssets,
  processAssets = [],
  onCopyText,
  onRetryFullPetAction,
  running,
  canRepair,
  onLoadAssetPreview,
  copiedPromptKey = ''
}: {
  actions: CreatorActionAttemptViewState[]
  actionAssets: CreatorActionAssetViewState[]
  processAssets?: CreatorActionAssetViewState[]
  onCopyText?: (text: string, label?: string, key?: string) => void | Promise<void>
  onRetryFullPetAction: (actionId: string) => void | Promise<void>
  running: boolean
  canRepair: boolean
  onLoadAssetPreview?: (relativePath: string) => Promise<string>
  copiedPromptKey?: string
}) => {
  const assets = actionAssets.length
    ? actionAssets
    : actions.flatMap((action) => action.assets || [])
  const archivedProcessAssets = processAssets.filter((asset) => asset.role === 'repair-archive')
  const archivedPromptAssets = archivedProcessAssets.filter((asset) => asset.kind === 'prompt' && asset.promptText)
  const archivedVisualAssets = archivedProcessAssets.filter((asset) => asset.kind !== 'prompt')
  const currentProcessAssets = processAssets.filter((asset) => asset.role !== 'repair-archive')
  if (!actions.length && !assets.length && !processAssets.length) return null

  return (
    <div className="creator-asset-review" data-testid="creator-asset-review">
      <strong>本次生成资产审查台</strong>
      <span className="field-note" data-testid="creator-asset-review-guide">
        推荐流程：先导入可用动作 → 在此审查坏资产（对照参考身份/失败帧）→ 一键重生成红项。
      </span>
      {currentProcessAssets.length ? (
        <div className="creator-process-assets" data-testid="creator-process-assets">
          <strong>过程资产</strong>
          <span className="field-note">anchor / conditioning board / sprite sheet 在失败时也会保留，可按需加载大图。</span>
          <div className="creator-asset-thumbs">
            {currentProcessAssets.map((asset) => (
              <LazyAssetThumb
                key={`process-${asset.kind}-${asset.relativePath}`}
                asset={asset}
                actionId={asset.actionId || 'process'}
                onLoadAssetPreview={onLoadAssetPreview}
              />
            ))}
          </div>
        </div>
      ) : null}
      {archivedProcessAssets.length ? (
        <div className="creator-process-assets creator-repair-assets" data-testid="creator-repair-assets">
          <strong>历史重试资产（付费产物）</strong>
          <span className="field-note">这些资产来自之前的 Provider 调用，重新生成不会删除；请对照它们查看为什么失败。</span>
          {archivedVisualAssets.length ? <div className="creator-asset-thumbs">
            {archivedVisualAssets.map((asset) => (
              <LazyAssetThumb
                key={`repair-${asset.kind}-${asset.relativePath}`}
                asset={asset}
                actionId={asset.actionId || 'process'}
                onLoadAssetPreview={onLoadAssetPreview}
              />
            ))}
          </div> : null}
          {archivedPromptAssets.map((asset) => {
            const copyKey = `repair:${asset.relativePath}`
            return (
              <div className="creator-repair-prompt" key={copyKey}>
                <details data-testid={`creator-repair-prompt-${asset.actionId}`}>
                  <summary>查看历史提示词 · {asset.actionId}</summary>
                  <pre className="creator-prompt-pre">{asset.promptText}</pre>
                </details>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => onCopyText?.(asset.promptText || '', `${asset.actionId} 历史提示词`, copyKey)}
                >
                  {copiedPromptKey === copyKey ? '已复制' : '复制历史提示词'}
                </button>
              </div>
            )
          })}
        </div>
      ) : null}
      <div className="creator-asset-review-list">
        {actions.map((action) => {
          const related = (action.assets && action.assets.length
            ? action.assets
            : assets.filter((asset) => asset.actionId === action.actionId))
          const evidence = action.failureEvidence || []
          const promptText = action.promptText || related.find((asset) => asset.promptText)?.promptText || ''
          const identityAssets = related.filter((asset) => asset.kind === 'identity' || asset.kind === 'anchor')
          const failedFrameAssets = related.filter((asset) => ['frame', 'keyframe', 'row'].includes(asset.kind))
          const otherAssets = related.filter((asset) => !['prompt', 'identity', 'anchor', 'frame', 'keyframe', 'row'].includes(asset.kind))
          const copyKey = `${action.actionId}:prompt`
          const copied = copiedPromptKey === copyKey
          return (
            <div
              key={action.actionId}
              className={`creator-asset-card ${actionToneClass(action.status)}`.trim()}
              data-testid={`creator-asset-card-${action.actionId}`}
            >
              <div className="creator-asset-card-header">
                <strong>{action.actionId}</strong>
                <span>{formatActionAttemptStatus(action.status)}</span>
                {action.quality ? <span>{action.quality}</span> : null}
                {typeof action.score === 'number' ? <span>分数 {action.score}</span> : null}
              </div>
              {action.reason ? <span data-testid={`creator-asset-reason-${action.actionId}`}>{action.reason}</span> : null}
              {evidence.length ? (
                <div className="creator-asset-evidence" data-testid={`creator-asset-evidence-${action.actionId}`}>
                  {evidence.map((item, index) => (
                    <span key={`${item.code}-${index}`}>
                      <strong>坏在哪</strong> {formatFailurePlain(item.code, item.message, item.score)}
                    </span>
                  ))}
                </div>
              ) : null}
              {(identityAssets.length || failedFrameAssets.length) ? (
                <div className="creator-asset-compare" data-testid={`creator-asset-compare-${action.actionId}`}>
                  <div className="creator-asset-compare-col">
                    <strong>参考身份</strong>
                    <div className="creator-asset-thumbs">
                      {identityAssets.length ? identityAssets.map((asset) => (
                        <LazyAssetThumb
                          key={`id-${asset.relativePath}`}
                          asset={asset}
                          actionId={action.actionId}
                          onLoadAssetPreview={onLoadAssetPreview}
                        />
                      )) : <span className="field-note">无身份参考落盘</span>}
                    </div>
                  </div>
                  <div className="creator-asset-compare-col">
                    <strong>失败/生成帧</strong>
                    <div className="creator-asset-thumbs" data-testid={`creator-asset-thumbs-${action.actionId}`}>
                      {failedFrameAssets.length ? failedFrameAssets.map((asset) => (
                        <LazyAssetThumb
                          key={`frame-${asset.kind}-${asset.relativePath}`}
                          asset={asset}
                          actionId={action.actionId}
                          onLoadAssetPreview={onLoadAssetPreview}
                        />
                      )) : <span className="field-note">暂无失败帧（可能未落盘）</span>}
                    </div>
                  </div>
                </div>
              ) : related.length ? (
                <div className="creator-asset-thumbs" data-testid={`creator-asset-thumbs-${action.actionId}`}>
                  {related.filter((asset) => asset.kind !== 'prompt').map((asset) => (
                    <LazyAssetThumb
                      key={`${asset.kind}-${asset.relativePath}`}
                      asset={asset}
                      actionId={action.actionId}
                      onLoadAssetPreview={onLoadAssetPreview}
                    />
                  ))}
                </div>
              ) : (
                <span className="field-note">暂无缩略图（可能仍在生成或未落盘）</span>
              )}
              {otherAssets.length ? (
                <div className="creator-asset-thumbs" data-testid={`creator-asset-extra-${action.actionId}`}>
                  {otherAssets.map((asset) => (
                    <LazyAssetThumb
                      key={`extra-${asset.kind}-${asset.relativePath}`}
                      asset={asset}
                      actionId={action.actionId}
                      onLoadAssetPreview={onLoadAssetPreview}
                    />
                  ))}
                </div>
              ) : null}
              <div className="header-actions">
                {promptText ? (
                  <>
                    <details data-testid={`creator-asset-prompt-${action.actionId}`}>
                      <summary>查看提示词</summary>
                      <pre className="creator-prompt-pre">{promptText}</pre>
                    </details>
                    <button
                      type="button"
                      className="ghost"
                      data-testid={`creator-copy-prompt-${action.actionId}`}
                      onClick={() => onCopyText?.(promptText, `${action.actionId} 提示词`, copyKey)}
                    >
                      {copied ? '已复制' : '复制提示词'}
                    </button>
                  </>
                ) : null}
                {action.status === 'failed' && canRepair && action.actionId !== 'running-left' ? (
                  <button
                    type="button"
                    className="ghost"
                    disabled={running}
                    onClick={() => onRetryFullPetAction(action.actionId)}
                  >
                    重新生成 {action.actionId}
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const WorkflowProgressPanel = ({ progress }: { progress: CreatorWorkflowProgressViewState }) => (
  <div className="creator-progress" data-testid="creator-progress">
    <div className="creator-result-grid">
      <span><strong>当前阶段</strong> {progress.phaseLabel || progress.phase || '-'}</span>
      <span><strong>Run status</strong> {progress.runStatus || '-'}</span>
      <span><strong>Current step</strong> {progress.currentStep || '-'}</span>
    </div>
    {progress.summary ? <span data-testid="creator-progress-summary">{progress.summary}</span> : null}
    {progress.failureReason ? (
      <span data-testid="creator-progress-failure"><strong>失败原因</strong> {progress.failureReason}</span>
    ) : null}
    {progress.stages?.length ? (
      <div className="creator-result-grid" data-testid="creator-progress-stages">
        {progress.stages.map((stage) => (
          <span key={stage.id}>
            <strong>{stage.label}</strong> {formatStageStatus(stage.status)}
            {stage.message ? ` · ${stage.message}` : ''}
          </span>
        ))}
      </div>
    ) : null}
    {progress.actions?.length ? (
      <div className="creator-result-grid" data-testid="creator-progress-actions">
        {progress.actions.map((action) => (
          <span key={action.actionId} className={actionToneClass(action.status)} data-status={action.status}>
            <strong>{action.actionId}</strong> {formatActionAttemptStatus(action.status)}
            {action.reason ? ` · ${action.reason}` : ''}
            {action.quality ? ` · ${action.quality}` : ''}
            {action.importable ? ' · 可导入' : ''}
          </span>
        ))}
      </div>
    ) : null}
    {progress.availableActionIds?.length || progress.failedActionIds?.length ? (
      <div className="creator-result-grid" data-testid="creator-progress-availability">
        <span><strong>可导入</strong> {progress.availableActionIds?.length ? progress.availableActionIds.join(', ') : 'none'}</span>
        <span><strong>失败</strong> {progress.failedActionIds?.length ? progress.failedActionIds.join(', ') : 'none'}</span>
        <span><strong>完整性</strong> {progress.completeness || '-'}</span>
      </div>
    ) : null}
  </div>
)

const formatTimestamp = (value: string) => {
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? value : new Date(timestamp).toLocaleString()
}

const formatAttemptStatus = (value: string) => {
  if (value === 'completed') return 'completed'
  if (value === 'failed') return 'failed'
  if (value === 'attempted') return 'attempted'
  return 'unavailable'
}

const formatCandidateSelectionState = (candidate: CreatorCanonicalCandidateViewState) => {
  if (candidate.selectionState === 'selected-by-human') return '已由你选择'
  if (candidate.selectionState === 'technically-unusable') return '技术上不可用'
  if (candidate.selectionState === 'selectable-with-warning') return '未达推荐标准，但可以选择'
  return '推荐使用'
}

const CandidateDecisionEvidence = ({ candidate }: { candidate: CreatorCanonicalCandidateViewState }) => (
  <div className="creator-candidate-decision">
    <strong>{formatCandidateSelectionState(candidate)}</strong>
    {candidate.selection?.qualityOverride ? <span>采用时未达推荐标准</span> : null}
    {typeof candidate.score === 'number' ? <span>综合分 {candidate.score}</span> : null}
    {candidate.qualityWarningCodes.length ? (
      <span className="creator-candidate-failures">质量建议：{candidate.qualityWarningCodes.join('、')}</span>
    ) : null}
    {candidate.technicalFailureCodes.length ? (
      <span className="creator-candidate-failures">技术阻断：{candidate.technicalFailureCodes.join('、')}</span>
    ) : null}
  </div>
)

const IdentityReviewPanel = ({
  progress,
  running,
  onAcceptCreatorIdentity,
  onRetryFullPetIdentity,
  onLoadAssetPreview
}: {
  progress: CreatorWorkflowProgressViewState
  running: boolean
  onAcceptCreatorIdentity: (candidateId: string, sha256: string, options: CandidateAcceptanceOptions) => void | Promise<void>
  onRetryFullPetIdentity: () => void | Promise<void>
  onLoadAssetPreview?: (relativePath: string) => Promise<string>
}) => {
  const [confirmingCandidateId, setConfirmingCandidateId] = useState('')
  const qualityFirst = progress.qualityFirst
  const identityReview = qualityFirst?.identityReview
  if (!qualityFirst || !identityReview) return null
  const identityGenerationFailed = qualityFirst.phase === 'identity-generation-failed'
  const acceptancePending = qualityFirst.phase === 'awaiting_identity_review'
  const automaticallySelected = identityReview.status === 'selected'
  return (
    <div className="creator-identity-review" data-testid="creator-identity-review">
      <div className="creator-identity-review-header">
        <div>
          <strong>{identityGenerationFailed ? '身份候选生成失败' : (automaticallySelected ? 'Canonical identity 已自动选定' : '选择 canonical identity')}</strong>
          <span>{identityGenerationFailed
            ? (progress.failureReason || '身份候选生成失败；请检查各候选的 Provider 请求记录和技术阻断原因后重新生成。')
            : automaticallySelected
              ? '系统已按质量分、身份分和稳定候选 ID 选定唯一 anchor；其他付费候选仍作为可检查的备用资产保留。'
              : '动作生成尚未开始。请选择最符合参考图身份、比例和渲染风格的可用候选。'}</span>
        </div>
        <span>{`${qualityFirst.passingCandidateCount}/${qualityFirst.candidateCount} 通过质量门`}</span>
      </div>
      <div className="creator-canonical-candidates" data-testid="canonical-candidates">
        {identityReview.candidates.map((candidate) => (
          <div
            key={candidate.candidateId}
            className={`creator-canonical-candidate ${candidate.technicalEligible ? 'ok' : 'error'} ${candidate.disposition}`.trim()}
            data-testid={`creator-canonical-candidate-${candidate.candidateId}`}
          >
            {candidate.relativePath ? (
              <LazyAssetThumb
                asset={{
                  actionId: 'identity',
                  kind: 'identity',
                  relativePath: candidate.relativePath,
                  label: candidate.candidateId,
                  previewable: candidate.previewable
                }}
                actionId="identity"
                onLoadAssetPreview={onLoadAssetPreview}
              />
            ) : <span className="creator-candidate-preview-missing">候选图不可预览</span>}
            <div className="creator-candidate-details">
              <strong>{candidate.candidateId}</strong>
              <CandidateDecisionEvidence candidate={candidate} />
              {candidate.model ? <span>模型 {candidate.model}</span> : null}
              <code title={candidate.sha256}>sha256 {candidate.sha256.slice(0, 12)}…</code>
              {candidate.failureCodes.length ? (
                <span className="creator-candidate-failures">坏在哪：{candidate.failureCodes.join('、')}</span>
              ) : null}
              {candidate.modelAttempts.length ? (
                <div className="creator-provider-attempts" data-testid={`creator-provider-attempts-${candidate.candidateId}`}>
                  <strong>Provider 请求记录</strong>
                  {candidate.modelAttempts.map((attempt, index) => (
                    <div key={`${attempt.model}-${attempt.requestId || index}`} className={attempt.ok ? 'ok' : 'error'}>
                      <span>
                        {attempt.ok ? '成功' : '失败'} · {attempt.model || '未记录模型'}
                        {attempt.httpStatus ? <> · HTTP {attempt.httpStatus}</> : null}
                        {attempt.errorCode ? <> · {attempt.errorCode}</> : null}
                        {attempt.durationMs ? <> · {(attempt.durationMs / 1000).toFixed(1)} 秒</> : null}
                      </span>
                      {attempt.httpStatus === 524 ? (
                        <span>上游网关在请求时限内未返回；即使上游稍后完成，OpenPet 也没有收到可导入的图片，请重新生成该候选。</span>
                      ) : attempt.errorCode === 'provider_timeout' ? (
                        <span>图片请求达到 {Math.round(attempt.timeoutMs / 1000)} 秒总时限后停止等待，请重新生成该候选。</span>
                      ) : null}
                      {attempt.requestId ? <code title={attempt.requestId}>requestId {attempt.requestId}</code> : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {candidate.duplicateOfCandidateId ? (
                <span>与 {candidate.duplicateOfCandidateId} 视觉重复；资产仍保留，不视为坏图</span>
              ) : null}
            </div>
            <button
              type="button"
              className="primary"
              disabled={running || !acceptancePending || !candidate.technicalEligible || !candidate.sha256}
              onClick={() => {
                if (candidate.recommended) {
                  void onAcceptCreatorIdentity(candidate.candidateId, candidate.sha256, { qualityOverride: false, acknowledgedWarningCodes: [] })
                } else {
                  setConfirmingCandidateId(candidate.candidateId)
                }
              }}
              data-testid={`creator-accept-identity-${candidate.candidateId}`}
              title={!acceptancePending
                ? '当前使用自动选择或已完成身份选择，无需再次接受候选'
                : candidate.technicalEligible
                  ? (candidate.recommended ? '接受推荐身份候选并开始 idle 生成' : '该候选未达推荐标准，但技术完整，可以由你选择')
                  : '该候选技术上不可用'}
            >
              {candidate.recommended ? '选择此候选' : '仍然选择此候选'}
            </button>
            {confirmingCandidateId === candidate.candidateId ? (
              <div className="creator-quality-override-confirmation" data-testid="creator-quality-override-confirmation">
                <strong>确认采用未推荐候选 {candidate.candidateId}</strong>
                <span>sha256 {candidate.sha256.slice(0, 12)}…；自动质量结果仍保持未通过，后续动作可能继承这些差异。</span>
                <span>{candidate.qualityWarningCodes.join('、') || '自动质量系统未给出具体原因'}</span>
                <button
                  type="button"
                  className="primary"
                  disabled={running}
                  onClick={() => onAcceptCreatorIdentity(candidate.candidateId, candidate.sha256, {
                    qualityOverride: true,
                    acknowledgedWarningCodes: candidate.qualityWarningCodes
                  })}
                >
                  我了解风险，按我的选择继续
                </button>
                <button type="button" className="ghost" onClick={() => setConfirmingCandidateId('')}>取消</button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="ghost"
        disabled={running}
        onClick={onRetryFullPetIdentity}
        data-testid="creator-retry-identity-candidates"
      >
        重新生成身份候选
      </button>
    </div>
  )
}

const ActionCandidateReview = ({
  progress,
  running,
  onAcceptCreatorActionCandidate,
  onLoadAssetPreview
}: {
  progress: CreatorWorkflowProgressViewState
  running: boolean
  onAcceptCreatorActionCandidate: (actionId: string, candidateId: string, sha256: string, options: CandidateAcceptanceOptions) => void | Promise<void>
  onLoadAssetPreview?: (relativePath: string) => Promise<string>
}) => {
  const [confirmingKey, setConfirmingKey] = useState('')
  const entries = Object.entries(progress.qualityFirst?.actionResults || {})
    .filter(([, result]) => result.candidates.length > 0)
  if (!entries.length) return null
  return (
    <div className="creator-action-candidate-review" data-testid="creator-action-candidate-review">
      <strong>动作候选选择</strong>
      <span>复用已有资产不会产生新的图片请求；重新生成会产生新的图片请求。</span>
      {entries.map(([actionId, result]) => (
        <div key={actionId} className="creator-action-candidate-group">
          <strong>{actionId}</strong>
          {result.failureCode ? <span className="creator-candidate-failures">状态原因：{result.failureCode}</span> : null}
          <div className="creator-canonical-candidates">
            {result.candidates.map((candidate) => {
              const key = `${actionId}:${candidate.candidateId}`
              return (
                <div key={key} className={`creator-canonical-candidate ${candidate.technicalEligible ? 'ok' : 'error'}`}>
                  {candidate.relativePath ? (
                    <LazyAssetThumb
                      asset={{ actionId, kind: 'frame', relativePath: candidate.relativePath, label: candidate.candidateId, previewable: candidate.previewable }}
                      actionId={actionId}
                      onLoadAssetPreview={onLoadAssetPreview}
                    />
                  ) : null}
                  <div className="creator-candidate-details">
                    <strong>{candidate.candidateId}</strong>
                    <CandidateDecisionEvidence candidate={candidate} />
                    <code title={candidate.sha256}>sha256 {candidate.sha256.slice(0, 12)}…</code>
                  </div>
                  <button
                    type="button"
                    className="primary"
                    disabled={running || !candidate.technicalEligible || !candidate.sha256}
                    onClick={() => {
                      if (candidate.recommended) {
                        void onAcceptCreatorActionCandidate(actionId, candidate.candidateId, candidate.sha256, { qualityOverride: false, acknowledgedWarningCodes: [] })
                      } else {
                        setConfirmingKey(key)
                      }
                    }}
                    data-testid={`creator-accept-action-candidate-${actionId}-${candidate.candidateId}`}
                  >
                    {candidate.recommended ? '复用已有资产' : '按我的选择复用'}
                  </button>
                  {confirmingKey === key ? (
                    <div className="creator-quality-override-confirmation" data-testid={`creator-action-quality-override-${actionId}-${candidate.candidateId}`}>
                      <strong>该动作候选未达推荐标准</strong>
                      <span>{candidate.qualityWarningCodes.join('、') || '自动质量系统未给出具体原因'}</span>
                      <button
                        type="button"
                        className="primary"
                        onClick={() => onAcceptCreatorActionCandidate(actionId, candidate.candidateId, candidate.sha256, {
                          qualityOverride: true,
                          acknowledgedWarningCodes: candidate.qualityWarningCodes
                        })}
                      >
                        我了解风险，复用此资产
                      </button>
                      <button type="button" className="ghost" onClick={() => setConfirmingKey('')}>取消</button>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

const PackageQualityReview = ({ progress }: { progress: CreatorWorkflowProgressViewState }) => {
  const review = progress.qualityFirst?.packageReview
  if (!review) return null
  return (
    <div className={`creator-package-quality-review ${review.recommended ? 'ok' : 'error'}`} data-testid="creator-package-quality-review">
      <strong>{review.recommended ? '最终包达到自动质量建议' : '最终包未达推荐标准，但已保留给你复查'}</strong>
      {!review.recommended ? <span>质量系统只提供建议；你选择的候选、原始失败证据和最终审美决定均被保留。</span> : null}
      {review.qualityWarningCodes.length ? <span className="creator-candidate-failures">质量建议：{review.qualityWarningCodes.join('、')}</span> : null}
      {review.evidenceRelativePath ? <code title={review.evidenceRelativePath}>{review.evidenceRelativePath}</code> : null}
    </div>
  )
}

const ResultCard = ({
  result,
  running,
  previewing,
  dashboardAvailable,
  dashboardReady,
  openingDashboard,
  onPreviewResult,
  onRestoreClickAction,
  onRetryFullPetAction,
  onRetryFullPetIdentity,
  onAcceptCreatorIdentity,
  onAcceptCreatorActionCandidate,
  onExportCreatorRecoveryBundle,
  onImportAvailableActions,
  onOpenCreatorStudioDetails,
  onCopyText,
  onLoadAssetPreview,
  copiedPromptKey
}: {
  result: CreatorWorkflowResult
  running: boolean
  previewing: boolean
  dashboardAvailable: boolean
  dashboardReady: boolean
  openingDashboard: boolean
  onPreviewResult: () => void | Promise<void>
  onRestoreClickAction: () => void | Promise<void>
  onRetryFullPetAction: (actionId: string) => void | Promise<void>
  onRetryFullPetIdentity: () => void | Promise<void>
  onAcceptCreatorIdentity: (candidateId: string, sha256: string, options: CandidateAcceptanceOptions) => void | Promise<void>
  onAcceptCreatorActionCandidate: (actionId: string, candidateId: string, sha256: string, options: CandidateAcceptanceOptions) => void | Promise<void>
  onExportCreatorRecoveryBundle: () => void | Promise<void>
  onImportAvailableActions: () => void | Promise<void>
  onOpenCreatorStudioDetails: () => void | Promise<void>
  onCopyText?: (text: string, label?: string, key?: string) => void | Promise<void>
  onLoadAssetPreview?: (relativePath: string) => Promise<string>
  copiedPromptKey?: string
}) => {
  const tone = ['completed', 'review-required'].includes(result.state)
    ? 'ok'
    : result.state === 'preview-ready' || result.state === 'generating' || result.state === 'awaiting-identity-review'
      ? ''
      : 'error'
  const progress = result.diagnostics?.progress || null
  const showAdvanced = dashboardAvailable && Boolean(result.run?.runId)
  const diagnostics = result.diagnostics || null
  const hatchPetAgent = diagnostics?.hatchPetAgent || null
  const clickActionChange = result.clickActionChange || null
  const basicActions = result.basicActions || null
  const conditioning = diagnostics?.conditioning || null
  const conditioningReferences = conditioning?.referenceFileNames?.length
    ? conditioning.referenceFileNames.join(', ')
    : 'none'
  const progressActions = progress?.actions || []
  const actionAssets = result.actionAssets || progress?.actionAssets || []
  const processAssets = result.processAssets || progress?.processAssets || []
  const availableActionIds = result.availableActionIds?.length
    ? result.availableActionIds
    : (progress?.availableActionIds || basicActions?.availableActionIds || [])
  const failedActionIds = result.failedActionIds?.length
    ? result.failedActionIds
    : (progress?.failedActionIds || progressActions.filter((action) => action.status === 'failed').map((action) => action.actionId))
  const canRepairFullPet = result.run?.mode === 'full-pet' &&
    ['review-required', 'preview-ready', 'completed', 'import-failed'].includes(String(result.state))
  const repairableActionIds = canRepairFullPet
    ? createUniqueActionIds([
      ...failedActionIds,
      ...(basicActions?.omittedActionIds || []),
      ...(basicActions?.missingRequiredOfficialActionIds || []),
      ...progressActions.filter((action) => action.status === 'failed').map((action) => action.actionId)
    ]).filter((actionId) => actionId !== 'running-left')
    : []
  const canImportAvailable = result.run?.mode === 'full-pet' &&
    availableActionIds.length > 0 &&
    ['review-required', 'preview-ready', 'import-failed'].includes(String(result.state))
  const previewActionId = String(
    result.clickAction ||
    result.importedAction?.actionId ||
    result.activePet?.clickAction ||
    result.activePet?.defaultAction ||
    ''
  ).trim()
  const canPreview = Boolean(previewActionId) && (
    result.state === 'completed' ||
    Boolean(result.importedAction) ||
    Boolean(result.activePet)
  )

  return (
    <div className={`provider-feedback ${tone}`.trim()} data-testid="creator-result">
      <strong>{formatWorkflowState(result.state)}</strong>
      <span>{result.message}</span>
      {progress?.phaseLabel ? (
        <span data-testid="creator-result-phase">阶段：{progress.phaseLabel}</span>
      ) : null}
      {progress ? <WorkflowProgressPanel progress={progress} /> : null}
      {progress?.qualityFirst?.identityReview?.candidates.length ? (
        <IdentityReviewPanel
          progress={progress}
          running={running}
          onAcceptCreatorIdentity={onAcceptCreatorIdentity}
          onRetryFullPetIdentity={onRetryFullPetIdentity}
          onLoadAssetPreview={onLoadAssetPreview}
        />
      ) : null}
      {progress?.qualityFirst ? (
        <ActionCandidateReview
          progress={progress}
          running={running}
          onAcceptCreatorActionCandidate={onAcceptCreatorActionCandidate}
          onLoadAssetPreview={onLoadAssetPreview}
        />
      ) : null}
      {progress?.qualityFirst ? <PackageQualityReview progress={progress} /> : null}
      {progress?.qualityFirst?.phase === 'recovery-required' ? (
        <div className="creator-recovery-panel error" data-testid="creator-recovery-required">
          <strong>idle 未通过质量门</strong>
          <span>本次所有付费资产都已保留。你可以导出资产恢复包检查坏资产，或重新生成身份候选后再试。</span>
          {progress.qualityFirst.recovery?.reason ? <span>失败原因：{progress.qualityFirst.recovery.reason}</span> : null}
          <button
            type="button"
            className="primary"
            disabled={running || !progress.qualityFirst.recovery?.exportable}
            onClick={onExportCreatorRecoveryBundle}
            data-testid="creator-export-recovery"
          >
            验证并导出资产恢复包
          </button>
          <button
            type="button"
            className="ghost"
            disabled={running}
            onClick={onRetryFullPetIdentity}
            data-testid="creator-retry-identity-from-recovery"
          >
            重新生成身份候选
          </button>
        </div>
      ) : null}
      {progressActions.length ? (
        <ActionMatrix
          actions={progressActions}
          running={running}
          canRepair={canRepairFullPet}
          onRetryFullPetAction={onRetryFullPetAction}
        />
      ) : null}
      {(progressActions.length || actionAssets.length || processAssets.length) ? (
        <AssetReviewBench
          actions={progressActions}
          actionAssets={actionAssets}
          onCopyText={onCopyText}
          onRetryFullPetAction={onRetryFullPetAction}
          running={running}
          canRepair={canRepairFullPet}
          processAssets={processAssets}
          onLoadAssetPreview={onLoadAssetPreview}
          copiedPromptKey={copiedPromptKey}
        />
      ) : null}
      {result.importNotes ? (
        <span data-testid="creator-import-notes"><strong>导入说明</strong> {result.importNotes}</span>
      ) : null}
      {result.degradedActionIds?.length ? (
        <span data-testid="creator-degraded-actions">
          <strong>降级占位动作</strong> {result.degradedActionIds.join(', ')}；当前可运行但不是通过质量门的真实动作，请重新生成。
        </span>
      ) : null}
      {canImportAvailable || repairableActionIds.length ? (
        <div className="header-actions" data-testid="creator-main-ctas">
          {canImportAvailable ? (
            <button
              type="button"
              className="primary"
              disabled={running || previewing}
              onClick={onImportAvailableActions}
              data-testid="creator-import-available-actions"
            >
              {running ? '导入中' : `导入可用动作（${availableActionIds.length}）`}
            </button>
          ) : null}
          {repairableActionIds.length ? (
            <button
              type="button"
              className="ghost"
              disabled={running || previewing}
              onClick={() => onRetryFullPetAction(repairableActionIds[0])}
              data-testid="creator-retry-failed-actions"
            >
              一键重生成失败动作
            </button>
          ) : null}
        </div>
      ) : null}
      {result.state === 'completed' ? (
        <span className="creator-result-cta">
          {canPreview ? '可以立即预览，或直接点击桌宠验证动作。' : '生成已完成，但当前没有可播放的已导入动作；请先完成动作导入。'}
        </span>
      ) : null}
      {result.state === 'generating' ? (
        <span className="creator-result-cta">生成进行中，下方会同步阶段与动作成败。</span>
      ) : null}
      {result.state === 'hatch-pet-not-ready' ? (
        <span className="creator-result-cta" data-testid="creator-guide-hatch-pet-preflight">
          未创建生成任务，也未产生图片费用。请到 AI -&gt; Hatch Pet Agent 修复配置或 capability 检查后重试。
        </span>
      ) : null}
      {result.state === 'review-required' ? (
        <span className="creator-result-cta" data-testid="creator-guide-review">
          建议：先导入可用动作 → 审查坏资产（对照参考身份/失败帧）→ 一键重生成红项。桌宠预览仅在动作已导入后可用。
        </span>
      ) : null}
      {result.state === 'preview-ready' ? (
        <span className="creator-result-cta" data-testid="creator-guide-preview-ready">
          预览产物已生成。下一步：导入可用 → 审查红项坏在哪 → 重生成失败动作。预览按钮只播放已导入动作，不会静默。
        </span>
      ) : null}
      {result.reference ? (
        <div className="creator-result-grid">
          <span><strong>使用的参考图</strong> {result.reference.fileName || 'reference.png'}</span>
          <span><strong>Updated</strong> {formatTimestamp(result.reference.updatedAt || '')}</span>
        </div>
      ) : null}
      {result.activePet ? (
        <div className="creator-result-grid">
          <span><strong>当前角色</strong> {result.activePet.displayName || result.activePet.id}</span>
          <span><strong>默认动作</strong> {result.activePet.defaultAction || 'idle'}</span>
          <span><strong>点击动作</strong> {result.activePet.clickAction || 'waving'}</span>
        </div>
      ) : null}
      {result.importedAction ? (
        <div className="creator-result-grid">
          <span><strong>已导入动作</strong> {result.importedAction.label || result.importedAction.actionId}</span>
          <span><strong>点击动作</strong> {result.clickAction || result.importedAction.actionId}</span>
          {clickActionChange?.previousActionId ? <span><strong>原点击动作</strong> {clickActionChange.previousActionId}</span> : null}
        </div>
      ) : null}
      {basicActions ? (
        <div className="creator-result-grid">
          <span><strong>必需动作</strong> {basicActions.requiredActionIds?.length ? basicActions.requiredActionIds.join(', ') : 'idle'}</span>
          <span><strong>可用动作</strong> {basicActions.availableActionIds?.length ? basicActions.availableActionIds.join(', ') : 'none'}</span>
          <span><strong>可选省略</strong> {basicActions.omittedActionIds?.length ? basicActions.omittedActionIds.join(', ') : 'none'}</span>
          <span><strong>预览复用动作</strong> {basicActions.previewFallbackActionIds?.length ? basicActions.previewFallbackActionIds.join(', ') : (basicActions.fallbackActionIds.length ? basicActions.fallbackActionIds.join(', ') : 'none')}</span>
          {basicActions.missingRequiredActionIds.length ? <span><strong>需要复查</strong> {basicActions.missingRequiredActionIds.join(', ')}</span> : null}
          {basicActions.missingRequiredOfficialActionIds?.length ? <span><strong>官方质量缺口</strong> {basicActions.missingRequiredOfficialActionIds.join(', ')}</span> : null}
        </div>
      ) : null}
      {result.run ? (
        <div className="creator-result-grid">
          <span><strong>Mode</strong> {result.run.mode || '-'}</span>
          <span><strong>Run ID</strong> {result.run.runId || 'pending'}</span>
          <span><strong>Command</strong> {result.run.commandId || '-'}</span>
        </div>
      ) : null}
      {diagnostics ? (
        <div className="creator-result-grid">
          <span><strong>Run status</strong> {diagnostics.runStatus || '-'}</span>
          <span><strong>Attempt</strong> {formatAttemptStatus(diagnostics.attemptStatus)}</span>
          <span><strong>Backend</strong> {diagnostics.backend || '-'} / {diagnostics.backendState || '-'}</span>
          <span><strong>Conditioning</strong> {conditioning ? `${conditioning.mode || 'not recorded'} via ${conditioning.endpoint || 'not recorded'}` : 'not recorded'}</span>
          <span><strong>References</strong> {conditioning && Number.isFinite(Number(conditioning.referenceImageCount)) ? conditioning.referenceImageCount : 'not recorded'}</span>
          <span><strong>Requested outputs</strong> {conditioning && Number.isFinite(Number(conditioning.requestedOutputCount)) ? conditioning.requestedOutputCount : 'not recorded'}</span>
          <span><strong>Image field</strong> {conditioning?.multipartImageField || 'not recorded'}</span>
          <span><strong>Outputs</strong> {diagnostics.outputCount}</span>
          {diagnostics.generatedAt ? <span><strong>Generated</strong> {formatTimestamp(diagnostics.generatedAt)}</span> : null}
          {diagnostics.failedAt ? <span><strong>Failed</strong> {formatTimestamp(diagnostics.failedAt)}</span> : null}
          {conditioning ? <span><strong>Reference inputs</strong> {conditioningReferences}</span> : null}
          {diagnostics.failureReason ? <span><strong>Failure reason</strong> {diagnostics.failureReason}</span> : null}
        </div>
      ) : null}
      {hatchPetAgent ? (
        <div className="creator-result-grid" data-testid="creator-hatch-pet-agent-status">
          <span><strong>Hatch Pet Agent mode</strong> {hatchPetAgent.mode || '-'}</span>
          <span><strong>Hatch Pet Agent status</strong> {hatchPetAgent.status || '-'}</span>
          <span><strong>Hatch Pet Agent decision</strong> {hatchPetAgent.decision || '-'}</span>
          <span><strong>Hatch Pet Agent decision ID</strong> {hatchPetAgent.decisionId || '-'}</span>
        </div>
      ) : null}
      {showAdvanced ? (
        <div className="header-actions">
          <button type="button" className="primary" disabled={previewing || !canPreview} onClick={onPreviewResult} data-testid="creator-preview-result" title={canPreview ? '' : '当前状态不可预览'}>
            {previewing ? '预览中' : (canPreview ? '立即预览' : '当前不可预览')}
          </button>
          {clickActionChange?.canRestore ? (
            <button type="button" className="ghost" disabled={previewing} onClick={onRestoreClickAction} data-testid="creator-restore-click-action">
              恢复原点击动作
            </button>
          ) : null}
          <button type="button" className="ghost" disabled={openingDashboard} onClick={onOpenCreatorStudioDetails}>
            {openingDashboard ? '启动并打开中' : (dashboardReady ? '打开 Creator Studio 详情' : '启动并打开 Creator Studio 详情')}
          </button>
          {repairableActionIds.map((actionId) => (
            <button
              key={actionId}
              type="button"
              className="ghost"
              disabled={previewing || running}
              onClick={() => onRetryFullPetAction(actionId)}
            >
              重新生成 {actionId}
            </button>
          ))}
          {canRepairFullPet ? (
            <button type="button" className="ghost" disabled={previewing || running} onClick={onRetryFullPetIdentity}>
              重新生成 canonical identity
            </button>
          ) : null}
        </div>
      ) : result.state === 'completed' ? (
        <div className="header-actions">
          <button type="button" className="primary" disabled={previewing || !canPreview} onClick={onPreviewResult} data-testid="creator-preview-result" title={canPreview ? '' : '当前状态不可预览'}>
            {previewing ? '预览中' : (canPreview ? '立即预览' : '当前不可预览')}
          </button>
          {clickActionChange?.canRestore ? (
            <button type="button" className="ghost" disabled={previewing} onClick={onRestoreClickAction} data-testid="creator-restore-click-action">
              恢复原点击动作
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function CreatorPane({
  creatorState,
  mode,
  newCharacterDraft,
  existingActionDraft,
  status,
  running,
  previewing,
  openingDashboard,
  result,
  creatorStudioReady,
  creatorStudioMessage,
  newCharacterBlockers,
  existingActionBlockers,
  canGenerateNewCharacter,
  canGenerateExistingAction,
  onChangeMode,
  onChangeNewCharacterDraft,
  onChangeExistingActionDraft,
  onSelectNewCharacterReference,
  onSelectExistingActionReference,
  onClearExistingActionReference,
  onGenerateNewCharacter,
  onGenerateExistingAction,
  onPreviewResult,
  onRestoreClickAction,
  onRetryFullPetAction,
  onRetryFullPetIdentity,
  onAcceptCreatorIdentity,
  onAcceptCreatorActionCandidate,
  onExportCreatorRecoveryBundle,
  onImportAvailableActions,
  onOpenCreatorStudioDetails,
  onCopyText,
  onLoadAssetPreview,
  copiedPromptKey
}: CreatorPaneProps) {
  const providerReady = creatorState.provider.ready
  const providerCheckDelayed = !providerReady && creatorState.provider.code === 'health_check_timeout'
  const hatchPetReady = creatorState.hatchPetAgent.ok
  const hasEditableReference = Boolean(creatorState.editableReference)

  return (
    <section className="pane creator-pane">
      <header className="pane-header">
        <div>
          <h1>Create</h1>
          <p>普通用户默认主路径：上传一张清晰来源图并可补充描述；OpenPet 会在内部准备角色锚定视图和动作锚定视图，上传的图片仍是身份最高优先级。</p>
        </div>
        <div className="segmented" role="group" aria-label="创建模式">
          <button
            type="button"
            className={mode === 'new-character' ? 'active' : ''}
            onClick={() => onChangeMode('new-character')}
            data-testid="creator-mode-new"
          >
            New Character
          </button>
          <button
            type="button"
            className={mode === 'existing-character' ? 'active' : ''}
            onClick={() => onChangeMode('existing-character')}
            data-testid="creator-mode-existing"
          >
            Existing Character
          </button>
        </div>
      </header>

      <div className={`provider-feedback ${providerReady ? 'ok' : 'error'}`} data-testid="creator-provider-status">
        <strong>{providerReady ? 'Image Provider ready' : (providerCheckDelayed ? 'Image Provider check delayed' : 'Image Provider not ready')}</strong>
        <span>{creatorState.provider.message || (providerReady ? '当前 Provider 可用于 Create 主路径。' : '请先到 AI -> 模型 Provider -> 图片模型 保存可用模型。')}</span>
        {!providerReady ? (
          <span>{providerCheckDelayed
            ? 'Provider 响应较慢，当前检查已超时；这不代表配置或图片模型失效，请稍后重新进入 Create 或再次生成。'
            : 'Go to AI -> 模型 Provider -> 图片模型, save a working model, then return to Create.'}</span>
        ) : null}
        <div className="creator-result-grid">
          <span><strong>Provider</strong> {creatorState.provider.provider || 'openai-compatible'}</span>
          <span><strong>Model</strong> {creatorState.provider.model || 'gpt-image-2'}</span>
          <span><strong>Code</strong> {creatorState.provider.code || '-'}</span>
        </div>
      </div>

      {mode === 'new-character' ? (
        <div className={`provider-feedback ${hatchPetReady ? 'ok' : 'error'}`} data-testid="creator-hatch-pet-readiness">
          <strong>{hatchPetReady ? 'Hatch Pet Agent ready' : 'Hatch Pet Agent not ready'}</strong>
          <span>{creatorState.hatchPetAgent.message || (hatchPetReady
            ? '质量优先角色规划与评价模型已就绪。'
            : '请到 AI -> Hatch Pet Agent 开启并保存可用配置。')}</span>
          {!hatchPetReady ? (
            <span>生成角色需要 Hatch Pet Agent；请到 AI -&gt; Hatch Pet Agent 开启 Agent，并确认 Follow chat 或 Dedicated 模型支持结构化工具。单动作生成不依赖此项。</span>
          ) : null}
          <div className="creator-result-grid">
            <span><strong>Config</strong> {creatorState.hatchPetAgent.configSource || '-'}</span>
            <span><strong>Provider</strong> {creatorState.hatchPetAgent.provider || '-'}</span>
            <span><strong>Model</strong> {creatorState.hatchPetAgent.model || '-'}</span>
            <span><strong>Code</strong> {creatorState.hatchPetAgent.code || '-'}</span>
          </div>
        </div>
      ) : null}

      {!creatorStudioReady ? (
        <div className={`provider-feedback ${creatorState.dashboard.available ? '' : 'error'}`.trim()} data-testid="creator-workflow-status">
          <strong>{creatorState.dashboard.available ? 'Advanced Creator Studio details are optional' : 'Creator Studio not ready'}</strong>
          <span>{creatorStudioMessage}</span>
        </div>
      ) : null}

      {mode === 'new-character' ? (
        <div className="creator-card-stack">
          <div className="field-row">
            <label className="field-label" htmlFor="creator-character-name">Character name</label>
            <div>
              <input
                id="creator-character-name"
                className="text-input"
                type="text"
                value={newCharacterDraft.characterName}
                placeholder="Mango Cat"
                onChange={(event) => onChangeNewCharacterDraft({ characterName: event.target.value })}
              />
              <p className="field-note">生成后会作为新角色名和默认 pet id 的基础。</p>
            </div>
          </div>
          <div className="field-row tall">
            <label className="field-label" htmlFor="creator-new-reference">Reference image</label>
            <div className="creator-file-field">
              <button
                id="creator-new-reference"
                type="button"
                className="ghost accent"
                data-testid="creator-new-reference-input"
                onClick={() => onSelectNewCharacterReference()}
              >
                {newCharacterDraft.referenceFileName ? '重新选择参考图' : '选择参考图'}
              </button>
              <p className="field-note">
                {newCharacterDraft.referenceFileName
                  ? `Selected: ${newCharacterDraft.referenceFileName} · 默认一键路径只支持单张清晰的正面图。`
                  : '上传一张清晰来源图作为这个角色的 canonical reference；OpenPet 会在内部准备角色锚定视图和动作锚定视图。'}
              </p>
            </div>
          </div>
          <div className="field-row tall">
            <label className="field-label" htmlFor="creator-style-prompt">Style prompt</label>
            <div>
              <textarea
                id="creator-style-prompt"
                className="text-input textarea"
                value={newCharacterDraft.stylePrompt}
                placeholder="Soft orange helper cat with warm idle energy."
                onChange={(event) => onChangeNewCharacterDraft({ stylePrompt: event.target.value })}
              />
              <p className="field-note">可选。补充角色气质、色彩和身份提示。</p>
            </div>
          </div>
          <div className="creator-action-bar">
            <button
              type="button"
              className="primary"
              disabled={!canGenerateNewCharacter}
              onClick={onGenerateNewCharacter}
              data-testid="creator-generate-new-character"
              aria-describedby="creator-new-character-readiness"
            >
              {running && mode === 'new-character' ? 'Generating' : 'Generate Character'}
            </button>
            <span
              id="creator-new-character-readiness"
              className={`creator-readiness ${newCharacterBlockers.length ? 'error' : 'success'}`}
              role="status"
              aria-live="polite"
            >
              {newCharacterBlockers.length
                ? `还需完成：${newCharacterBlockers.join('、')}`
                : '已满足生成条件，可以开始生成。'}
            </span>
            <span className="field-note">提交后 Host 会完成生成并停在人工复查；批准、导入和激活需要分别明确执行。</span>
          </div>
        </div>
      ) : (
        <div className="creator-card-stack">
          <div className="readonly-row">
            <strong>Editable target</strong>
            <div className="provider-summary-grid">
              <span>{creatorState.editableTarget.displayName}</span>
              <span>defaultAction: {creatorState.editableTarget.defaultAction || 'idle'}</span>
              <span>clickAction: {creatorState.editableTarget.clickAction || '-'}</span>
            </div>
          </div>
          <div className="field-row tall">
            <label className="field-label" htmlFor="creator-existing-reference">Reference image</label>
            <div className="creator-file-field">
              <div className={`provider-feedback ${hasEditableReference ? 'ok' : 'error'}`}>
                <strong>{hasEditableReference ? 'Stored reference found' : 'Reference required before first action generation'}</strong>
                <span>
                  {hasEditableReference
                    ? `${creatorState.editableReference?.fileName || 'reference.png'} · updated ${formatTimestamp(creatorState.editableReference?.updatedAt || '')}`
                    : '当前可编辑角色还没有 canonical reference。请先选择一张图，随后会在生成动作时自动绑定。'}
                </span>
              </div>
              <button
                id="creator-existing-reference"
                type="button"
                className="ghost accent"
                data-testid="creator-existing-reference-input"
                onClick={() => onSelectExistingActionReference()}
              >
                {existingActionDraft.referenceFileName ? '重新选择参考图' : '选择参考图'}
              </button>
              {existingActionDraft.referenceFileName ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => onClearExistingActionReference()}
                >
                  {hasEditableReference ? '改回已保存 reference' : '清除本次选择'}
                </button>
              ) : null}
              <p className="field-note">
                {existingActionDraft.referenceFileName
                  ? hasEditableReference
                    ? `Selected: ${existingActionDraft.referenceFileName} · 可随时改回已保存 reference；OpenPet 会在内部准备角色锚定视图和动作锚定视图。`
                    : `Selected: ${existingActionDraft.referenceFileName}`
                  : hasEditableReference
                    ? '留空会复用已保存 reference；选新图则会替换并继续生成。上传的图片仍是身份最高优先级。'
                    : '首次生成动作必须选择一张清晰来源图；OpenPet 会在内部准备角色锚定视图和动作锚定视图。'}
              </p>
            </div>
          </div>
          <div className="field-row">
            <label className="field-label" htmlFor="creator-action-name">Action name</label>
            <div>
              <input
                id="creator-action-name"
                className="text-input"
                type="text"
                value={existingActionDraft.actionName}
                placeholder="Shy Spin"
                onChange={(event) => onChangeExistingActionDraft({ actionName: event.target.value })}
              />
              <p className="field-note">导入后会作为当前可编辑角色的新动作名。</p>
            </div>
          </div>
          <div className="field-row tall">
            <label className="field-label" htmlFor="creator-motion-prompt">Motion prompt</label>
            <div>
              <textarea
                id="creator-motion-prompt"
                className="text-input textarea"
                value={existingActionDraft.motionPrompt}
                placeholder="Curl up, then spin gently once after the user clicks."
                onChange={(event) => onChangeExistingActionDraft({ motionPrompt: event.target.value })}
              />
              <p className="field-note">成功导入后，Host 会自动把这个动作绑定到 clickAction。</p>
            </div>
          </div>
          <div className="creator-action-bar">
            <button
              type="button"
              className="primary"
              disabled={!canGenerateExistingAction}
              onClick={onGenerateExistingAction}
              data-testid="creator-generate-existing-action"
              aria-describedby="creator-existing-action-readiness"
            >
              {running && mode === 'existing-character' ? 'Generating' : 'Generate Action'}
            </button>
            <span
              id="creator-existing-action-readiness"
              className={`creator-readiness ${existingActionBlockers.length ? 'error' : 'success'}`}
              role="status"
              aria-live="polite"
            >
              {existingActionBlockers.length
                ? `还需完成：${existingActionBlockers.join('、')}`
                : '已满足生成条件，可以开始生成。'}
            </span>
            <span className="field-note">默认主路径不会中途打断，除非 Provider 未就绪或导入失败。</span>
          </div>
        </div>
      )}

      {result ? (
        <ResultCard
          result={result}
          running={running}
          previewing={previewing}
          dashboardAvailable={creatorState.dashboard.available}
          dashboardReady={creatorStudioReady}
          openingDashboard={openingDashboard}
          onPreviewResult={onPreviewResult}
          onRestoreClickAction={onRestoreClickAction}
          onRetryFullPetAction={onRetryFullPetAction}
          onRetryFullPetIdentity={onRetryFullPetIdentity}
          onAcceptCreatorIdentity={onAcceptCreatorIdentity}
          onAcceptCreatorActionCandidate={onAcceptCreatorActionCandidate}
          onExportCreatorRecoveryBundle={onExportCreatorRecoveryBundle}
          onImportAvailableActions={onImportAvailableActions}
          onOpenCreatorStudioDetails={onOpenCreatorStudioDetails}
          onCopyText={onCopyText}
          onLoadAssetPreview={onLoadAssetPreview}
          copiedPromptKey={copiedPromptKey}
        />
      ) : creatorState.lastRun ? (
        <div className="provider-feedback" data-testid="creator-last-run">
          <strong>Most recent run</strong>
          <span>{creatorState.lastRun.message || '最近一次 Create run 状态已记录。'}</span>
          <div className="creator-result-grid">
            <span><strong>State</strong> {formatWorkflowState(creatorState.lastRun.state)}</span>
            <span><strong>Mode</strong> {creatorState.lastRun.mode || '-'}</span>
            <span><strong>Run ID</strong> {creatorState.lastRun.runId || '-'}</span>
          </div>
        </div>
      ) : null}

      {status ? <div className="status-line" data-testid="creator-status-line">{status}</div> : null}
    </section>
  )
}
