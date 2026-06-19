import type { ControlCenterSettings, CursorOption } from '../../../shared/openpet-contracts'
import { SegmentedControl } from '../components/SegmentedControl'
import { Toggle } from '../components/Toggle'
import { bubbleDurationOptions, homeRadiusOptions, menuPositionOptions, speedOptions, walkDurationOptions } from '../constants'

export interface PetPaneProps {
  settings: ControlCenterSettings
  originalSettings: ControlCenterSettings
  status: string
  saving: boolean
  cursorOptions: CursorOption[]
  manageMode: boolean
  editingCursorId: string
  editingCursorName: string
  onChange: (partial: Partial<ControlCenterSettings>, previewScale?: boolean) => void
  onSelectCursor: (cursorId: string) => void | Promise<void>
  onImportCursor: () => void | Promise<void>
  onToggleManageMode: () => void
  onStartEditCursor: (cursorId: string) => void
  onChangeEditingCursorName: (value: string) => void
  onCancelEditCursor: () => void
  onSaveEditedCursor: (cursorId: string) => void | Promise<void>
  onReplaceCustomCursor: (cursorId: string) => void | Promise<void>
  onDeleteCustomCursor: (cursorId: string) => void | Promise<void>
  onSave: () => void | Promise<void>
  onReset: () => void
}

const formatCursorSize = (width: number, height: number) => (
  width > 0 && height > 0 ? `${width}×${height}` : '未知尺寸'
)

const formatCursorTime = (timestamp: string) => {
  if (!timestamp || timestamp === 'builtin') return '内置指针'
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '刚刚上传'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date).replace(/\//g, '-')
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

function UploadIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 13V5m0 0L6.8 8.2M10 5l3.2 3.2M5 14.5v.7c0 1 .8 1.8 1.8 1.8h6.4c1 0 1.8-.8 1.8-1.8v-.7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m13.6 4.4 2 2a1 1 0 0 1 0 1.4l-7.8 7.8-3.4.6.6-3.4 7.8-7.8a1 1 0 0 1 1.4 0Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m12.5 5.5 2 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5.5 6.5v8a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-8M4 5h12M8 5V3.8c0-.4.3-.8.8-.8h2.4c.5 0 .8.4.8.8V5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 8v5M10 5.5h.01" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function PetPane({
  settings,
  originalSettings,
  status,
  onChange,
  onSelectCursor,
  onImportCursor,
  onToggleManageMode,
  onStartEditCursor,
  onChangeEditingCursorName,
  onCancelEditCursor,
  onSaveEditedCursor,
  onReplaceCustomCursor,
  onDeleteCustomCursor,
  onSave,
  onReset,
  cursorOptions,
  manageMode,
  editingCursorId,
  editingCursorName,
  saving
}: PetPaneProps) {
  const scalePercent = Math.round(settings.scale * 100)

  return (
    <section className="pane">
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
        <SegmentedControl
          label="菜单位置"
          value={settings.menuPosition}
          options={menuPositionOptions}
          onChange={(menuPosition) => onChange({ menuPosition: menuPosition as ControlCenterSettings['menuPosition'] })}
        />

        <div className="field-row">
          <div className="field-label">开机自启</div>
          <Toggle ariaLabel="Enable auto start" checked={settings.autoStart} onChange={(autoStart) => onChange({ autoStart })} />
        </div>

        <div className="cursor-settings-block">
          <div className="cursor-selection-header">
            <h2>指针选择</h2>
            <p>预览会模拟真实指针落点，方便你判断图片尺寸和视觉效果。</p>
          </div>

          <div className="cursor-options-row" role="list" aria-label="可选指针">
            {cursorOptions.map((option) => {
              const selected = settings.selectedCursorId === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`cursor-option-card${selected ? ' selected' : ''}`}
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
              )
            })}

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

          <div className="cursor-library-panel">
            <div className="cursor-library-header">
              <div className="cursor-library-title">
                <h3>我的自定义指针（可管理、编辑或删除）</h3>
                <span className="cursor-library-title-icon" aria-hidden="true">
                  <InfoIcon />
                </span>
              </div>
              <div className="cursor-library-actions">
                <button type="button" className="ghost accent" onClick={onImportCursor} disabled={saving}>
                  <span className="button-icon" aria-hidden="true">
                    <UploadIcon />
                  </span>
                  上传指针
                </button>
                <button type="button" className="ghost" onClick={onToggleManageMode} disabled={saving}>
                  {manageMode ? '完成' : '管理'}
                </button>
              </div>
            </div>

            {settings.customCursors.length ? (
              <div className="cursor-library-list">
                {settings.customCursors.map((cursor) => {
                  const selected = settings.selectedCursorId === cursor.id
                  const editing = editingCursorId === cursor.id
                  return (
                    <div key={cursor.id} className="cursor-library-row">
                      <div className="cursor-library-preview">
                        <span className="cursor-card-surface" />
                        <img src={cursor.assetUrl} alt={`${cursor.name} 预览`} />
                      </div>

                      <div className="cursor-library-main">
                        {editing ? (
                          <div className="cursor-edit-form">
                            <input
                              className="text-input"
                              value={editingCursorName}
                              onChange={(event) => onChangeEditingCursorName(event.target.value)}
                              placeholder="指针名称"
                              aria-label="指针名称"
                            />
                            <div className="inline-action">
                              <button type="button" className="ghost" onClick={() => onReplaceCustomCursor(cursor.id)} disabled={saving}>
                                替换图片
                              </button>
                              <button type="button" className="ghost" onClick={onCancelEditCursor} disabled={saving}>
                                取消
                              </button>
                              <button type="button" className="primary" onClick={() => onSaveEditedCursor(cursor.id)} disabled={saving}>
                                保存名称
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="cursor-library-name-row">
                              <strong>{cursor.name}</strong>
                              {selected ? <span className="cursor-usage-badge">使用中</span> : null}
                            </div>
                            <div className="cursor-library-meta">
                              <span>尺寸：{formatCursorSize(cursor.width, cursor.height)}</span>
                              <span>上传时间：{formatCursorTime(cursor.createdAt)}</span>
                            </div>
                          </>
                        )}
                      </div>

                      {manageMode && !editing ? (
                        <div className="cursor-library-row-actions">
                          <button type="button" className="ghost icon-button" onClick={() => onStartEditCursor(cursor.id)} disabled={saving}>
                            <span className="button-icon" aria-hidden="true">
                              <EditIcon />
                            </span>
                            编辑
                          </button>
                          <button type="button" className="ghost icon-button danger" onClick={() => onDeleteCustomCursor(cursor.id)} disabled={saving}>
                            <span className="button-icon" aria-hidden="true">
                              <TrashIcon />
                            </span>
                            删除
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="cursor-library-empty">
                还没有上传自定义指针，点击“添加自定义”或“上传指针”开始创建。
              </div>
            )}
          </div>

          <div className="cursor-guidance-note">
            <span className="cursor-guidance-icon" aria-hidden="true">
              <InfoIcon />
            </span>
            建议使用 32×32 / 64×64 PNG 或 WEBP 格式，透明背景，文件大小不超过 500KB。
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
            disabled={!settings.grounded}
            onChange={(enabled) => onChange({
              home: { ...settings.home, enabled }
            })}
          />
        </div>

        <SegmentedControl
          label="活动范围"
          value={settings.home.radius}
          options={homeRadiusOptions}
          disabled={!settings.home.enabled}
          onChange={(radius) => onChange({
            home: { ...settings.home, radius: String(radius) as ControlCenterSettings['home']['radius'] }
          })}
        />
      </div>

      <div className="status-line">
        {status || `原始大小 ${Math.round(originalSettings.scale * 100)}%`}
      </div>
    </section>
  )
}
