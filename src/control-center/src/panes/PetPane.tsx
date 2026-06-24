import type { ControlCenterSettings, CursorOption } from '../../../shared/openpet-contracts'
import { SYSTEM_CURSOR_ID } from '../../../shared/cursor-library.ts'
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
  onSelectCursor: (cursorId: string) => void | Promise<void>
  onImportCursor: () => void | Promise<void>
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
  onSave,
  onReset,
  cursorOptions,
  saving
}: PetPaneProps) {
  const scalePercent = Math.round(settings.scale * 100)
  const visibleCursorOptions = cursorOptions.filter((option) => option.id !== SYSTEM_CURSOR_ID)
  const updateHomeEnabled = (enabled: boolean) => onChange({
    grounded: enabled ? true : settings.grounded,
    home: { ...settings.home, enabled }
  })
  const updateHomeRadius = (radius: ControlCenterSettings['home']['radius']) => onChange({
    grounded: true,
    home: { ...settings.home, enabled: true, radius }
  })

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
            <div className="field-note">宠物说话时在头顶显示可回复的小弹窗，不影响普通气泡和完整聊天窗。</div>
          </div>
          <Toggle
            ariaLabel="Enable pet bubble chat popup"
            checked={settings.petBubbleChat.enabled}
            onChange={(enabled) => onChange({ petBubbleChat: { ...settings.petBubbleChat, enabled } })}
          />
        </div>
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
          <div className="cursor-settings-shell">
            <div className="cursor-selection-header">
              <h2>指针选择</h2>
              <p>预览会模拟真实指针落点，方便你判断图片尺寸和视觉效果。</p>
            </div>

            <div className="cursor-options-rail">
              <div className="cursor-options-row" role="list" aria-label="可选指针">
                {visibleCursorOptions.map((option) => {
                  const selected = settings.selectedCursorId === option.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`cursor-option-card${selected ? ' selected' : ''}`}
                      data-cursor-type={option.type}
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
            </div>

            <div className="cursor-guidance-note">
              <span className="cursor-guidance-icon" aria-hidden="true">
                <InfoIcon />
              </span>
              建议使用 32×32 / 64×64 PNG 格式，透明背景，文件大小不超过 500KB。
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
