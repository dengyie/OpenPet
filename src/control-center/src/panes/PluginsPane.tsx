import type {
  JsonValue,
  PermissionDiffState,
  PluginLogEntry,
  PluginLogFilters,
  PluginPackageReviewViewState,
  PluginViewState
} from '../../../shared/openpet-contracts'
import { Toggle } from '../components/Toggle'
import { formatBytes, formatPluginLogTime } from '../lib/format'

type ExportFormat = 'json' | 'csv'

interface PluginConfigField {
  key: string
  title?: string
  description?: string
  type?: 'string' | 'number' | 'boolean'
  enum?: JsonValue[]
  required?: boolean
}

export interface PluginsPaneProps {
  plugins: PluginViewState[]
  logs: PluginLogEntry[]
  filters: PluginLogFilters
  status: string
  runningCommand: string
  savingConfig: string
  clearingStorage: string
  pluginReview: PluginPackageReviewViewState | null
  inspectingPlugin: boolean
  installingPlugin: boolean
  uninstallingPlugin: string
  onToggle: (pluginId: string, enabled: boolean) => void | Promise<void>
  onInspectPluginPackage: () => void | Promise<void>
  onClearPluginReview: () => void | Promise<void>
  onInstallReviewedPlugin: () => void | Promise<void>
  onUninstallPlugin: (pluginId: string) => void | Promise<void>
  onChangeConfig: (pluginId: string, key: string, value: JsonValue) => void
  onSaveConfig: (pluginId: string) => void | Promise<void>
  onRun: (pluginId: string, commandId: string) => void | Promise<void>
  onChangeFilters: (filters: PluginLogFilters) => void
  onExportLogs: (format: ExportFormat) => void | Promise<void>
  onClearLogs: () => void | Promise<void>
  onClearStorage: (pluginId: string) => void | Promise<void>
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
)

const isPluginConfigField = (field: unknown): field is PluginConfigField => {
  if (!isRecord(field) || typeof field.key !== 'string') return false
  if (field.type != null && !['string', 'number', 'boolean'].includes(String(field.type))) return false
  if (field.enum != null && !Array.isArray(field.enum)) return false
  return true
}

const toConfigFields = (plugin: PluginViewState) => (
  Array.isArray(plugin.configSchema?.properties)
    ? plugin.configSchema.properties.filter(isPluginConfigField)
    : []
)

const formatDiff = (diff?: PermissionDiffState) => {
  const added = diff?.added?.length ? `新增 ${diff.added.join(', ')}` : ''
  const removed = diff?.removed?.length ? `移除 ${diff.removed.join(', ')}` : ''
  const unchanged = diff?.unchanged?.length ? `保留 ${diff.unchanged.join(', ')}` : ''
  return [added, removed, unchanged].filter(Boolean).join(' · ') || '无变化'
}

function PluginReviewPanel({
  review,
  installingPlugin,
  onInstallReviewedPlugin,
  onClearPluginReview
}: {
  review: PluginPackageReviewViewState | null
  installingPlugin: boolean
  onInstallReviewedPlugin: () => void | Promise<void>
  onClearPluginReview: () => void | Promise<void>
}) {
  if (!review) return null
  const plugin = review.plugin || {}
  const actionLabel = review.installMode === 'update' ? '确认更新' : '安装插件'
  return (
    <div className={review.riskLevel === 'review' ? 'plugin-review-panel warning' : 'plugin-review-panel'}>
      <div className="plugin-review-header">
        <div>
          <h2>{plugin.name || plugin.id}</h2>
          <span>{review.installMode === 'update' ? `更新 ${review.existingVersion} → ${plugin.version}` : `安装 ${plugin.version}`}</span>
        </div>
        <div className="plugin-log-actions">
          <button type="button" className="ghost" disabled={installingPlugin} onClick={onClearPluginReview}>取消</button>
          <button type="button" className="primary" disabled={installingPlugin || Boolean(review.signature?.errors?.length)} onClick={onInstallReviewedPlugin}>
            {installingPlugin ? '处理中' : actionLabel}
          </button>
        </div>
      </div>
      <div className="plugin-review-grid">
        <div>
          <strong>权限</strong>
          <span>{formatDiff(review.permissionDiff?.permissions)}</span>
        </div>
        <div>
          <strong>网络</strong>
          <span>{formatDiff(review.permissionDiff?.networkAllowlist)}</span>
        </div>
        <div>
          <strong>签名</strong>
          <span>{review.signature?.label || 'Unknown'}{review.signature?.signer ? ` · ${review.signature.signer}` : ''}</span>
        </div>
        <div>
          <strong>包摘要</strong>
          <span>{review.fileCount} files · {formatBytes(review.byteSize || 0)} · {review.packageHash?.slice(0, 16)}</span>
        </div>
      </div>
      {review.signature?.errors?.length ? (
        <div className="inspection-block error">
          {review.signature.errors.map((error) => <span key={error}>{error}</span>)}
        </div>
      ) : null}
      <div className="permission-line">
        {(plugin.commands || []).length ? `命令：${plugin.commands.map((command) => command.id).join(' · ')}` : '无命令'}
      </div>
    </div>
  )
}

export function PluginsPane({ plugins, logs, filters, status, runningCommand, savingConfig, clearingStorage, pluginReview, inspectingPlugin, installingPlugin, uninstallingPlugin, onToggle, onInspectPluginPackage, onClearPluginReview, onInstallReviewedPlugin, onUninstallPlugin, onChangeConfig, onSaveConfig, onRun, onChangeFilters, onExportLogs, onClearLogs, onClearStorage }: PluginsPaneProps) {
  return (
    <section className="pane">
      <header className="pane-header">
        <div>
          <h1>Plugins</h1>
          <p>插件安装审查、权限与官方命令</p>
        </div>
        <div className="header-actions">
          <button type="button" className="primary" disabled={inspectingPlugin} onClick={onInspectPluginPackage}>
            {inspectingPlugin ? '读取中' : 'Install plugin'}
          </button>
        </div>
      </header>

      <PluginReviewPanel
        review={pluginReview}
        installingPlugin={installingPlugin}
        onInstallReviewedPlugin={onInstallReviewedPlugin}
        onClearPluginReview={onClearPluginReview}
      />

      <div className="plugin-list">
        {plugins.length === 0 ? (
          <div className="empty-chat">暂无插件</div>
        ) : plugins.map((plugin) => (
          <div className="plugin-row" key={plugin.id}>
            <div className="plugin-main">
              <div className="plugin-title">
                <strong>{plugin.name}</strong>
                <span>{plugin.source}</span>
              </div>
              <div className="plugin-meta">
                <span>{plugin.id}</span>
                <span>{plugin.version}</span>
                <span>{plugin.runnable ? '可运行' : '仅展示'}</span>
                <span>{plugin.signatureStatus?.label || 'Signature unknown'}</span>
              </div>
              <div className="permission-line">
                {(plugin.permissions || []).length === 0 ? '无权限' : plugin.permissions.join(' · ')}
              </div>
              <div className="plugin-storage-line">
                <span>{plugin.storage?.valid === false ? '存储数据无效' : `存储 ${plugin.storage?.keyCount || 0} 项 / ${formatBytes(plugin.storage?.byteSize || 2)}`}</span>
                <button
                  type="button"
                  className="ghost"
                  disabled={plugin.storage?.valid !== false && ((plugin.storage?.keyCount || 0) === 0 || clearingStorage === plugin.id)}
                  onClick={() => onClearStorage(plugin.id)}
                >
                  {clearingStorage === plugin.id ? '清理中' : '清理存储'}
                </button>
              </div>
              {plugin.commands?.length ? (
                <div className="plugin-commands">
                  {plugin.commands.map((command) => {
                    const commandKey = `${plugin.id}:${command.id}`
                    return (
                      <button
                        type="button"
                        className="ghost"
                        key={command.id}
                        disabled={!plugin.enabled || !plugin.runnable || runningCommand === commandKey}
                        onClick={() => onRun(plugin.id, command.id)}
                      >
                        {runningCommand === commandKey ? '运行中' : command.title}
                      </button>
                    )
                  })}
                </div>
              ) : null}
              {plugin.source === 'local' ? (
                <div className="plugin-commands">
                  <button
                    type="button"
                    className="danger-text"
                    disabled={uninstallingPlugin === plugin.id}
                    onClick={() => onUninstallPlugin(plugin.id)}
                  >
                    {uninstallingPlugin === plugin.id ? '卸载中' : '卸载插件'}
                  </button>
                </div>
              ) : null}
              {toConfigFields(plugin).length ? (
                <div className="plugin-config-panel">
                  <div className="plugin-config-header">
                    <strong>{plugin.configSchema.title || '配置'}</strong>
                    <button
                      type="button"
                      className="ghost"
                      disabled={savingConfig === plugin.id}
                      onClick={() => onSaveConfig(plugin.id)}
                    >
                      {savingConfig === plugin.id ? '保存中' : '保存配置'}
                    </button>
                  </div>
                  {plugin.configSchema.description ? (
                    <div className="field-note">{plugin.configSchema.description}</div>
                  ) : null}
                  <div className="plugin-config-grid">
                    {toConfigFields(plugin).map((field) => {
                      const value = plugin.config?.[field.key]
                      const selectedEnumIndex = field.enum?.findIndex((option) => option === value) ?? -1
                      const inputValue = typeof value === 'string' || typeof value === 'number' ? value : ''
                      return (
                        <label className="plugin-config-field" key={field.key}>
                          <span>
                            {field.title || field.key}
                            {field.required ? <em>必填</em> : null}
                          </span>
                          {field.enum?.length ? (
                            <select
                              className="text-input"
                              value={selectedEnumIndex >= 0 ? selectedEnumIndex : ''}
                              onChange={(event) => {
                                const index = Number(event.target.value)
                                if (field.enum && Number.isInteger(index) && index >= 0 && index < field.enum.length) {
                                  onChangeConfig(plugin.id, field.key, field.enum[index])
                                }
                              }}
                            >
                              {field.enum.map((option, index) => (
                                <option value={index} key={String(option)}>{String(option)}</option>
                              ))}
                            </select>
                          ) : field.type === 'boolean' ? (
                            <Toggle checked={Boolean(value)} onChange={(nextValue) => onChangeConfig(plugin.id, field.key, nextValue)} />
                          ) : (
                            <input
                              className="text-input"
                              type={field.type === 'number' ? 'number' : 'text'}
                              value={inputValue}
                              onChange={(event) => onChangeConfig(plugin.id, field.key, event.target.value)}
                            />
                          )}
                          {field.description ? <small>{field.description}</small> : null}
                        </label>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            <Toggle checked={plugin.enabled} onChange={(enabled) => onToggle(plugin.id, enabled)} />
          </div>
        ))}
      </div>

      {status ? <div className="status-line">{status}</div> : null}

      <div className="plugin-log-panel">
        <div className="plugin-log-header">
          <div>
            <h2>运行日志</h2>
            <span>最近 {logs.length} 条事件</span>
          </div>
          <div className="plugin-log-actions">
            <button type="button" className="ghost" onClick={() => onExportLogs('json')} disabled={logs.length === 0}>JSON</button>
            <button type="button" className="ghost" onClick={() => onExportLogs('csv')} disabled={logs.length === 0}>CSV</button>
            <button type="button" className="ghost" onClick={onClearLogs} disabled={logs.length === 0}>清空</button>
          </div>
        </div>
        <div className="plugin-log-filters">
          <select className="text-input" value={filters.pluginId} onChange={(event) => onChangeFilters({ ...filters, pluginId: event.target.value })}>
            <option value="">全部插件</option>
            {plugins.map((plugin) => <option value={plugin.id} key={plugin.id}>{plugin.name}</option>)}
          </select>
          <select className="text-input" value={filters.level} onChange={(event) => onChangeFilters({ ...filters, level: event.target.value })}>
            <option value="">全部级别</option>
            <option value="info">Info</option>
            <option value="error">Error</option>
          </select>
          <input
            className="text-input"
            value={filters.query}
            placeholder="搜索日志"
            onChange={(event) => onChangeFilters({ ...filters, query: event.target.value })}
          />
        </div>
        <div className="plugin-log-list">
          {logs.length === 0 ? (
            <div className="empty-chat">暂无日志</div>
          ) : logs.map((log) => (
            <div className={log.level === 'error' ? 'plugin-log-row error' : 'plugin-log-row'} key={log.id}>
              <span>{formatPluginLogTime(log.timestamp)}</span>
              <strong>{log.level === 'error' ? 'Error' : 'Info'}</strong>
              <div>
                <span>{log.pluginId || 'plugin'}</span>
                {log.commandId ? <span>/{log.commandId}</span> : null}
              </div>
              <p>{log.message}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
