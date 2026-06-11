import React, { useEffect, useState } from 'react'

function ActionPreview({ action }) {
  const [frameIndex, setFrameIndex] = useState(0)

  useEffect(() => {
    setFrameIndex(0)
    if (!action || action.frameCount <= 1) return undefined
    const timer = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % action.frameCount)
    }, action.frameMs || 100)
    return () => window.clearInterval(timer)
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
              backgroundPositionX: `${-(frameIndex * displayWidth)}px`
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

function FrameInspectionReport({ report }) {
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

export function ActionsPane({
  actionsConfig,
  selectedActionId,
  importDraft,
  importInspection,
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
  onDelete
}) {
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
              <option value={action.id} key={action.id}>{action.label}</option>
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
              <option value={action.id} key={action.id}>{action.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="actions-workspace">
        <ActionPreview action={selectedAction} />
        <div className="action-list">
          {actionsConfig.actions.length === 0 ? (
            <div className="empty-chat">暂无动作</div>
          ) : actionsConfig.actions.map((action) => (
            <div
              className={selectedAction?.id === action.id ? 'action-row selected' : 'action-row'}
              key={action.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectAction(action.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onSelectAction(action.id)
              }}
            >
              <div>
                <strong>{action.label}</strong>
                <span>{action.id}</span>
              </div>
              <div className="action-meta">
                <span>{action.frameCount} 帧</span>
                <span>{action.frameWidth}x{action.frameHeight}</span>
                <span>{action.loop ? '循环' : '单次'}</span>
                <button
                  type="button"
                  className="danger-text"
                  disabled={working || actionsConfig.actions.length <= 1}
                  onClick={(event) => {
                    event.stopPropagation()
                    onDelete(action.id)
                  }}
                >
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
