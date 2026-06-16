import type { AboutInfoViewState, UpdateCheckViewState } from '../../../shared/openpet-contracts'

export interface AboutPaneProps {
  aboutInfo: AboutInfoViewState
  updateCheck: UpdateCheckViewState
  status: string
  checking: boolean
  onCheckUpdates: () => void | Promise<void>
}

const formatCheckedAt = (timestamp: string) => {
  if (!timestamp) return '尚未检查'
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp
  return date.toLocaleString()
}

export function AboutPane({ aboutInfo, updateCheck, status, checking, onCheckUpdates }: AboutPaneProps) {
  const update = aboutInfo.update || {}
  const rows = [
    { label: '应用名称', value: aboutInfo.productName || aboutInfo.name },
    { label: '当前版本', value: aboutInfo.version },
    { label: '运行模式', value: aboutInfo.packaged ? '已打包' : '开发模式' },
    { label: '平台', value: `${aboutInfo.platform || '-'} ${aboutInfo.arch || ''}`.trim() },
    { label: '更新源', value: update.configured ? `${update.provider}/${update.owner}/${update.repo}` : '未配置' },
    { label: '发布通道', value: update.channel || '-' }
  ]
  const updateSummary = updateCheck.status === 'idle'
    ? '尚未检查'
    : `${updateCheck.message || updateCheck.status}${updateCheck.latestVersion ? ` · ${updateCheck.latestVersion}` : ''}`

  return (
    <section className="pane">
      <header className="pane-header">
        <div>
          <h1>About</h1>
          <p>版本与发布信息</p>
        </div>
        <div className="header-actions">
          <button type="button" className="primary" onClick={onCheckUpdates} disabled={checking}>
            {checking ? '检查中' : '检查更新'}
          </button>
        </div>
      </header>
      <div className="section compact">
        {rows.map((row) => (
          <div className="readonly-row" key={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>

      <div className="section compact">
        <div className="readonly-row">
          <span>更新状态</span>
          <strong>{updateSummary}</strong>
        </div>
        <div className="readonly-row">
          <span>上次检查</span>
          <strong>{formatCheckedAt(updateCheck.checkedAt)}</strong>
        </div>
        <div className="readonly-row">
          <span>安装包</span>
          <strong>{updateCheck.assets?.length ? updateCheck.assets.map((asset) => asset.name).join(', ') : '-'}</strong>
        </div>
        <div className="readonly-row">
          <span>Release</span>
          <strong className="endpoint-text">{updateCheck.releaseUrl || '-'}</strong>
        </div>
      </div>
      {status ? <div className="status-line">{status}</div> : null}
    </section>
  )
}
