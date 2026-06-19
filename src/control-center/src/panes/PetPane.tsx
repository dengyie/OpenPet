import type { ControlCenterSettings } from '../../../shared/openpet-contracts'
import { SegmentedControl } from '../components/SegmentedControl'
import { Toggle } from '../components/Toggle'
import { bubbleDurationOptions, homeRadiusOptions, menuPositionOptions, speedOptions, walkDurationOptions } from '../constants'

export interface PetPaneProps {
  settings: ControlCenterSettings
  originalSettings: ControlCenterSettings
  status: string
  saving: boolean
  onChange: (partial: Partial<ControlCenterSettings>, previewScale?: boolean) => void
  onImportCursor: () => void | Promise<void>
  onClearCursor: () => void
  onSave: () => void | Promise<void>
  onReset: () => void
}

export function PetPane({ settings, originalSettings, status, onChange, onImportCursor, onClearCursor, onSave, onReset, saving }: PetPaneProps) {
  const scalePercent = Math.round(settings.scale * 100)
  const hasCustomCursor = Boolean(settings.customCursor.assetUrl)
  const cursorLabel = settings.customCursor.fileName || '未选择'
  const cursorActionLabel = hasCustomCursor ? '更换图片' : '选择图片'
  const cursorPreviewAlt = settings.customCursor.fileName || '自定义鼠标指针预览'
  const cursorPreviewSlots = Array.from({ length: 6 }, (_, index) => index)

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

        <div className="field-row">
          <div>
            <div className="field-label">自定义鼠标指针</div>
            <div className="field-note">开启后，鼠标移动到宠物交互区域时会显示你选择的指针图片。</div>
          </div>
          <div className="inline-action">
            <Toggle
              ariaLabel="启用自定义鼠标指针"
              checked={Boolean(settings.customCursor.enabled && hasCustomCursor)}
              disabled={!hasCustomCursor || saving}
              onChange={(enabled) => onChange({ customCursor: { ...settings.customCursor, enabled } })}
            />
          </div>
        </div>

        <div className="field-row tall">
          <div>
            <div className="field-label">指针选择</div>
            <div className="field-note">预览会模拟真实指针落点，方便你判断图片尺寸和视觉效果。</div>
          </div>
          <div className="cursor-preview-card">
            <div className="cursor-preview-surface" aria-label="指针预览画布">
              {cursorPreviewSlots.map((slot) => (
                <div key={slot} className="cursor-preview-slot">
                  <div className="cursor-preview-target" aria-hidden="true" />
                  {hasCustomCursor ? (
                    <img src={settings.customCursor.assetUrl} alt={cursorPreviewAlt} />
                  ) : (
                    <div className="cursor-preview-empty" aria-hidden="true">未选择指针</div>
                  )}
                </div>
              ))}
            </div>
            <div className="cursor-preview-meta">
              <strong className="cursor-preview-name">{cursorLabel}</strong>
              <span className="field-note">
                {hasCustomCursor
                  ? '当前会在宠物交互区域内作为鼠标指针显示。'
                  : '支持选择带透明背景的 PNG 图片。'}
              </span>
              <div className="inline-action">
                <button type="button" className="ghost" onClick={onImportCursor} disabled={saving}>
                  {cursorActionLabel}
                </button>
                <button type="button" className="ghost" onClick={onClearCursor} disabled={saving || !hasCustomCursor}>
                  清除
                </button>
              </div>
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
