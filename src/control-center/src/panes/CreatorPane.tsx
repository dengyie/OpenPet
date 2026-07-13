import type {
  CreatorStateViewState,
  CreatorWorkflowResult
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
  onOpenCreatorStudioDetails: () => void | Promise<void>
}

const formatWorkflowState = (state: CreatorWorkflowResult['state']) => {
  if (state === 'completed') return '已完成'
  if (state === 'generating') return '进行中'
  if (state === 'provider-not-ready') return 'Provider 未就绪'
  if (state === 'review-required') return '需要复查'
  if (state === 'import-failed') return '导入失败'
  return '缺少输入'
}

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
  onOpenCreatorStudioDetails
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
  onOpenCreatorStudioDetails: () => void | Promise<void>
}) => {
  const tone = ['completed', 'review-required'].includes(result.state)
    ? 'ok'
    : result.state === 'generating'
      ? ''
      : 'error'
  const showAdvanced = dashboardAvailable && Boolean(result.run?.runId)
  const diagnostics = result.diagnostics || null
  const hatchPetAgent = diagnostics?.hatchPetAgent || null
  const clickActionChange = result.clickActionChange || null
  const basicActions = result.basicActions || null
  const conditioning = diagnostics?.conditioning || null
  const conditioningReferences = conditioning?.referenceFileNames?.length
    ? conditioning.referenceFileNames.join(', ')
    : 'none'
  const canRepairFullPet = result.run?.mode === 'full-pet' &&
    ['review-required', 'preview-ready'].includes(String(result.state))
  const repairableActionIds = canRepairFullPet
    ? (basicActions?.missingRequiredOfficialActionIds || []).filter((actionId) => actionId !== 'running-left')
    : []

  return (
    <div className={`provider-feedback ${tone}`.trim()} data-testid="creator-result">
      <strong>{formatWorkflowState(result.state)}</strong>
      <span>{result.message}</span>
      {result.state === 'completed' ? (
        <span className="creator-result-cta">可以立即预览，或直接点击桌宠验证动作。</span>
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
          <span><strong>官方动作覆盖</strong> {basicActions.realActionIds.length ? basicActions.realActionIds.join(', ') : 'none'}</span>
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
          <button type="button" className="primary" disabled={previewing} onClick={onPreviewResult} data-testid="creator-preview-result">
            {previewing ? '预览中' : '立即预览'}
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
          <button type="button" className="primary" disabled={previewing} onClick={onPreviewResult} data-testid="creator-preview-result">
            {previewing ? '预览中' : '立即预览'}
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
  onOpenCreatorStudioDetails
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
          onOpenCreatorStudioDetails={onOpenCreatorStudioDetails}
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
