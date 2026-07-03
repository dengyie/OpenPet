import type {
  LocalHttpConfigViewState,
  PaginatedLogsViewState,
  ServiceLogEntry,
  ServiceStatusViewState
} from '../../../shared/openpet-contracts'
import { Toggle } from '../components/Toggle'

type LogExportFormat = 'json' | 'csv'

export interface ServicePaneProps {
  serviceStatus: ServiceStatusViewState
  logs: ServiceLogEntry[]
  logsPage: PaginatedLogsViewState<ServiceLogEntry>
  status: string
  saving: boolean
  onChange: (partial: Partial<LocalHttpConfigViewState>) => void
  onSave: () => void | Promise<void>
  onRotateToken: () => void | Promise<void>
  onRevokeMcpSessions: () => void | Promise<void>
  onRefreshLogs: () => void | Promise<void>
  onPrevLogsPage?: () => void | Promise<void>
  onNextLogsPage?: () => void | Promise<void>
  onExportLogs: (format: LogExportFormat) => void | Promise<void>
  onClearLogs: () => void | Promise<void>
}

const formatLogTime = (timestamp: string) => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function ServicePane({ serviceStatus, logs, logsPage, status, saving, onChange, onSave, onRotateToken, onRevokeMcpSessions, onRefreshLogs, onPrevLogsPage, onNextLogsPage, onExportLogs, onClearLogs }: ServicePaneProps) {
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
          <Toggle ariaLabel="Enable HTTP API" checked={config.enabled} onChange={(enabled) => onChange({ enabled })} />
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

        <div className="readonly-row">
          <span>MCP Sessions</span>
          <div className="inline-action">
            <strong>{runtime.mcp?.activeSessions || 0}</strong>
            <button type="button" className="ghost" onClick={onRevokeMcpSessions} disabled={saving || !runtime.enabled || !(runtime.mcp?.activeSessions)}>
              撤销全部
            </button>
          </div>
        </div>
      </div>

      <div className="plugin-log-panel">
        <div className="plugin-log-header">
          <div>
            <h2>访问日志</h2>
            <span>第 {logsPage.page} / {logsPage.totalPages} 页 · 共 {logsPage.total} 条</span>
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
        <div className="log-pagination">
          <button type="button" className="ghost" onClick={onPrevLogsPage} disabled={!onPrevLogsPage}>上一页</button>
          <span>当前 {logs.length} 条 / 每页 {logsPage.pageSize} 条</span>
          <button type="button" className="ghost" onClick={onNextLogsPage} disabled={!onNextLogsPage}>下一页</button>
        </div>
      </div>

      {status ? <div className="status-line">{status}</div> : null}
    </section>
  )
}
