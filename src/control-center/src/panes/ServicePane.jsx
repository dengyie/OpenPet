import React from 'react'
import { Toggle } from '../components/Toggle.jsx'

const formatLogTime = (timestamp) => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function ServicePane({ serviceStatus, logs, status, saving, onChange, onSave, onRotateToken, onRefreshLogs, onExportLogs, onClearLogs }) {
  const config = serviceStatus.config
  const runtime = serviceStatus.runtime
  const endpoint = runtime.enabled && runtime.port
    ? `http://${runtime.host}:${runtime.port}/api/status`
    : '未启动'
  const mcpEndpoint = runtime.enabled && runtime.port
    ? `http://${runtime.host}:${runtime.port}/mcp`
    : '未启动'

  return (
    <section className="pane">
      <header className="pane-header">
        <div>
          <h1>Service</h1>
          <p>本机 HTTP API</p>
        </div>
        <div className="header-actions">
          <button type="button" className="ghost" onClick={onRotateToken} disabled={saving}>
            轮换令牌
          </button>
          <button type="button" className="primary" onClick={onSave} disabled={saving}>
            {saving ? '保存中' : '保存'}
          </button>
        </div>
      </header>

      <div className="section">
        <div className="field-row">
          <div>
            <div className="field-label">HTTP API</div>
            <div className="field-note">{runtime.enabled ? '运行中' : '未启动'}</div>
          </div>
          <Toggle checked={config.enabled} onChange={(enabled) => onChange({ enabled })} />
        </div>

        <div className="field-row">
          <div>
            <div className="field-label">监听地址</div>
            <div className="field-note">固定为本机回环地址</div>
          </div>
          <input className="text-input" value="127.0.0.1" disabled />
        </div>

        <label className="field-row">
          <span className="field-label">端口</span>
          <input
            className="text-input"
            type="number"
            min="0"
            max="65535"
            value={config.port}
            onChange={(event) => onChange({ port: Number(event.target.value) })}
          />
        </label>

        <div className="readonly-row">
          <span>当前端点</span>
          <strong className="endpoint-text">{endpoint}</strong>
        </div>

        <div className="readonly-row">
          <span>访问令牌</span>
          <code className="endpoint-text">{config.token || '启用服务后生成'}</code>
        </div>

        <div className="readonly-row">
          <span>MCP</span>
          <strong className="endpoint-text">{mcpEndpoint}</strong>
        </div>
      </div>

      <div className="plugin-log-panel">
        <div className="plugin-log-header">
          <div>
            <h2>访问日志</h2>
            <span>最近 {logs.length} 条请求</span>
          </div>
          <div className="plugin-log-actions">
            <button type="button" className="ghost" onClick={onRefreshLogs}>刷新</button>
            <button type="button" className="ghost" onClick={() => onExportLogs('json')} disabled={logs.length === 0}>JSON</button>
            <button type="button" className="ghost" onClick={() => onExportLogs('csv')} disabled={logs.length === 0}>CSV</button>
            <button type="button" className="ghost" onClick={onClearLogs} disabled={logs.length === 0}>清空</button>
          </div>
        </div>
        <div className="plugin-log-list">
          {logs.length === 0 ? (
            <div className="empty-state">暂无请求</div>
          ) : logs.map((log) => (
            <div className={log.statusCode >= 400 ? 'plugin-log-row error service-log-row' : 'plugin-log-row service-log-row'} key={log.id}>
              <span>{formatLogTime(log.timestamp)}</span>
              <strong>{log.statusCode || '-'}</strong>
              <div>{log.method}</div>
              <p>{log.path}</p>
            </div>
          ))}
        </div>
      </div>

      {status ? <div className="status-line">{status}</div> : null}
    </section>
  )
}
