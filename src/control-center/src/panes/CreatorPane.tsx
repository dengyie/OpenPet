import { useState } from 'react'
import type {
  CreatorActionAssetViewState,
  CreatorActionAttemptViewState,
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
  onImportAvailableActions: () => void | Promise<void>
  onOpenCreatorStudioDetails: () => void | Promise<void>
  onCopyText?: (text: string, label?: string, key?: string) => void | Promise<void>
  onLoadAssetPreview?: (relativePath: string) => Promise<string>
  copiedPromptKey?: string
}

const formatWorkflowState = (state: CreatorWorkflowResult['state']) => {
  if (state === 'completed') return '已完成'
  if (state === 'generating') return '进行中'
  if (state === 'provider-not-ready') return 'Provider 未就绪'
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
  if (!actions.length && !assets.length && !processAssets.length) return null

  return (
    <div className="creator-asset-review" data-testid="creator-asset-review">
      <strong>本次生成资产审查台</strong>
      <span className="field-note" data-testid="creator-asset-review-guide">
        推荐流程：先导入可用动作 → 在此审查坏资产（对照参考身份/失败帧）→ 一键重生成红项。
      </span>
      {processAssets.length ? (
        <div className="creator-process-assets" data-testid="creator-process-assets">
          <strong>过程资产</strong>
          <span className="field-note">anchor / conditioning board / sprite sheet 在失败时也会保留，可按需加载大图。</span>
          <div className="creator-asset-thumbs">
            {processAssets.map((asset) => (
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

const ResultCard = ({
  result,
  running,
  previewing,
  dashboardAvailable,
  openingDashboard,
  onPreviewResult,
  onRestoreClickAction,
  onRetryFullPetAction,
  onRetryFullPetIdentity,
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
  openingDashboard: boolean
  onPreviewResult: () => void | Promise<void>
  onRestoreClickAction: () => void | Promise<void>
  onRetryFullPetAction: (actionId: string) => void | Promise<void>
  onRetryFullPetIdentity: () => void | Promise<void>
  onImportAvailableActions: () => void | Promise<void>
  onOpenCreatorStudioDetails: () => void | Promise<void>
  onCopyText?: (text: string, label?: string, key?: string) => void | Promise<void>
  onLoadAssetPreview?: (relativePath: string) => Promise<string>
  copiedPromptKey?: string
}) => {
  const tone = ['completed', 'review-required'].includes(result.state)
    ? 'ok'
    : result.state === 'preview-ready' || result.state === 'generating'
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
  const canPreview = result.state === 'completed' || Boolean(result.importedAction) || Boolean(result.activePet)

  return (
    <div className={`provider-feedback ${tone}`.trim()} data-testid="creator-result">
      <strong>{formatWorkflowState(result.state)}</strong>
      <span>{result.message}</span>
      {progress?.phaseLabel ? (
        <span data-testid="creator-result-phase">阶段：{progress.phaseLabel}</span>
      ) : null}
      {progress ? <WorkflowProgressPanel progress={progress} /> : null}
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
        <span className="creator-result-cta">可以立即预览，或直接点击桌宠验证动作。</span>
      ) : null}
      {result.state === 'generating' ? (
        <span className="creator-result-cta">生成进行中，下方会同步阶段与动作成败。</span>
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
            {openingDashboard ? '打开中' : '打开 Creator Studio 详情'}
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
  onImportAvailableActions,
  onOpenCreatorStudioDetails,
  onCopyText,
  onLoadAssetPreview,
  copiedPromptKey
}: CreatorPaneProps) {
  const providerReady = creatorState.provider.ready
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
        <strong>{providerReady ? 'Image Provider ready' : 'Image Provider not ready'}</strong>
        <span>{creatorState.provider.message || (providerReady ? '当前 Provider 可用于 Create 主路径。' : '请先到 AI -> 模型 Provider -> 图片模型 保存可用模型。')}</span>
        {!providerReady ? (
          <span>Go to AI -&gt; 模型 Provider -&gt; 图片模型, save a working model, then return to Create.</span>
        ) : null}
        <div className="creator-result-grid">
          <span><strong>Provider</strong> {creatorState.provider.provider || 'openai-compatible'}</span>
          <span><strong>Model</strong> {creatorState.provider.model || 'gpt-image-2'}</span>
          <span><strong>Code</strong> {creatorState.provider.code || '-'}</span>
        </div>
      </div>

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
            >
              {running && mode === 'new-character' ? 'Generating' : 'Generate Character'}
            </button>
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
            >
              {running && mode === 'existing-character' ? 'Generating' : 'Generate Action'}
            </button>
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
          openingDashboard={openingDashboard}
          onPreviewResult={onPreviewResult}
          onRestoreClickAction={onRestoreClickAction}
          onRetryFullPetAction={onRetryFullPetAction}
          onRetryFullPetIdentity={onRetryFullPetIdentity}
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
