import { useEffect, useState } from 'react'
import type { ControlCenterSettings, CursorOption } from '../../../shared/openpet-contracts'
import {
  CUSTOM_CURSOR_MAX_SIZE_PERCENT,
  CUSTOM_CURSOR_MIN_SIZE_PERCENT,
  CUSTOM_CURSOR_SIZE_STEP_PERCENT,
  SYSTEM_CURSOR_ID
} from '../../../shared/cursor-library.ts'
import { SegmentedControl } from '../components/SegmentedControl'
import { Toggle } from '../components/Toggle'
import { bubbleDurationOptions, homeRadiusOptions, menuPositionOptions, speedOptions, walkDurationOptions } from '../constants'

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
  saving
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

      <div className="status-line">
        {status || `原始大小 ${Math.round(originalSettings.scale * 100)}%`}
      </div>
    </section>
  )
}
