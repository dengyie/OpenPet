import React from 'react'
import { SegmentedControl } from '../components/SegmentedControl.jsx'
import { Toggle } from '../components/Toggle.jsx'
import { bubbleDurationOptions, speedOptions, walkDurationOptions } from '../constants.js'

export function PetPane({ settings, originalSettings, onChange, onSave, onReset, saving }) {
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

        <div className="field-row">
          <div className="field-label">开机自启</div>
          <Toggle checked={settings.autoStart} onChange={(autoStart) => onChange({ autoStart })} />
        </div>
      </div>

      <div className="status-line">
        原始大小 {Math.round(originalSettings.scale * 100)}%
      </div>
    </section>
  )
}
