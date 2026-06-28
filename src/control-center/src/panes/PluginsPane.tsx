import type {
  JsonValue,
  PermissionDiffState,
  PluginLogEntry,
  PluginLogFilters,
  PluginPackageReviewViewState,
  PluginViewState
} from '../../../shared/openpet-contracts'
import { PluginEntryDetails } from '../components/PluginEntryDetails'
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
  creatorStudioPromptDraft: string
  runningCreatorStudioDefaultFlow: boolean
  lastCommandResult: {
    pluginId: string
    commandId: string
    exitCode: number | null
    message: string
    stdout: string
    stderr: string
    resultText: string
    details: Array<{ label: string, value: string }>
  } | null
  commandPayloadDrafts: Record<string, string>
  runningSetup: string
  openingDashboard: string
  changingService: string
  checkingServiceHealth: string
  savingServiceHealthPolicy: string
  savingConfig: string
  clearingStorage: string
  pluginReview: PluginPackageReviewViewState | null
  inspectingPlugin: boolean
  githubRepositoryUrl: string
  inspectingGithubPlugin: boolean
  installingPlugin: boolean
  uninstallingPlugin: string
  onToggle: (pluginId: string, enabled: boolean) => void | Promise<void>
  onInspectPluginPackage: () => void | Promise<void>
  onInspectGithubPluginRepository: () => void | Promise<void>
  onClearPluginReview: () => void | Promise<void>
  onInstallReviewedPlugin: () => void | Promise<void>
  onUninstallPlugin: (pluginId: string) => void | Promise<void>
  onChangeConfig: (pluginId: string, key: string, value: JsonValue) => void
  onChangeCommandPayload: (pluginId: string, value: string) => void
  onChangeCreatorStudioPromptDraft: (value: string) => void
  onChangeGithubRepositoryUrl: (value: string) => void
  onSaveConfig: (pluginId: string) => void | Promise<void>
  onRun: (pluginId: string, commandId: string) => void | Promise<void>
  onRunCreatorStudioDefaultFlow: () => void | Promise<void>
  onRunSetup: (pluginId: string, setupId: string) => void | Promise<void>
  onOpenDashboard: (pluginId: string, dashboardId: string) => void | Promise<void>
  onStartService: (pluginId: string, serviceId: string) => void | Promise<void>
  onStopService: (pluginId: string, serviceId: string) => void | Promise<void>
  onCheckServiceHealth: (pluginId: string, serviceId: string) => void | Promise<void>
  onSaveServiceHealthPolicy: (pluginId: string, serviceId: string, enabled: boolean, intervalMs: number) => void | Promise<void>
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
      <PluginEntryDetails source={plugin} />
    </div>
  )
}

export function PluginsPane({ plugins, logs, filters, status, runningCommand, creatorStudioPromptDraft, runningCreatorStudioDefaultFlow, lastCommandResult, commandPayloadDrafts, runningSetup, openingDashboard, changingService, checkingServiceHealth, savingServiceHealthPolicy, savingConfig, clearingStorage, pluginReview, inspectingPlugin, githubRepositoryUrl, inspectingGithubPlugin, installingPlugin, uninstallingPlugin, onToggle, onInspectPluginPackage, onInspectGithubPluginRepository, onClearPluginReview, onInstallReviewedPlugin, onUninstallPlugin, onChangeConfig, onChangeCommandPayload, onChangeCreatorStudioPromptDraft, onChangeGithubRepositoryUrl, onSaveConfig, onRun, onRunCreatorStudioDefaultFlow, onRunSetup, onOpenDashboard, onStartService, onStopService, onCheckServiceHealth, onSaveServiceHealthPolicy, onChangeFilters, onExportLogs, onClearLogs, onClearStorage }: PluginsPaneProps) {
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

      <div className="card-stack">
        <div className="field-row">
          <label className="field-label" htmlFor="plugin-github-repository-url">GitHub repository URL</label>
          <div className="inline-form">
            <input
              id="plugin-github-repository-url"
              className="text-input"
              type="url"
              value={githubRepositoryUrl}
              placeholder="https://github.com/owner/repo"
              onChange={(event) => onChangeGithubRepositoryUrl(event.target.value)}
            />
            <button
              type="button"
              className="ghost"
              disabled={inspectingGithubPlugin || !githubRepositoryUrl.trim()}
              onClick={onInspectGithubPluginRepository}
            >
              {inspectingGithubPlugin ? '读取中' : 'Import from GitHub'}
            </button>
          </div>
          <p className="field-help">Only repositories with plugin.json at the repository root are supported.</p>
        </div>
      </div>

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
                <>
                  <div className="plugin-command-payload">
                    <label className="field-label" htmlFor={`plugin-command-payload-${plugin.id}`}>可选命令 Payload JSON</label>
                    <input
                      id={`plugin-command-payload-${plugin.id}`}
                      className="text-input"
                      type="text"
                      value={commandPayloadDrafts[plugin.id] || ''}
                      placeholder='{"runId":"2026-06-27-creator-studio-run-001"}'
                      onChange={(event) => onChangeCommandPayload(plugin.id, event.target.value)}
                    />
                    <p className="field-note">
                      留空时使用命令默认行为。Creator Studio 的 Import Approved Action / Pet 可填写 <code>{'{"runId":"..."}'}</code> 指定要导入的 run。
                    </p>
                  </div>
                  <div className="plugin-commands">
                    {plugin.commands.map((command) => {
                      const commandKey = `${plugin.id}:${command.id}`
                      return (
                        <button
                          type="button"
                          className="ghost"
                          key={command.id}
                          disabled={!plugin.enabled || !plugin.runnable || plugin.blockStatus?.blocked || runningCommand === commandKey}
                          onClick={() => onRun(plugin.id, command.id)}
                        >
                          {runningCommand === commandKey ? '运行中' : command.title}
                        </button>
                      )
                    })}
                  </div>
                </>
              ) : null}
              {lastCommandResult?.pluginId === plugin.id ? (
                <div className="plugin-command-result">
                  <strong>最近命令结果</strong>
                  <span>{lastCommandResult.commandId}{lastCommandResult.exitCode != null ? ` · exit ${lastCommandResult.exitCode}` : ''}</span>
                  <p>{lastCommandResult.message}</p>
                  {lastCommandResult.details.length ? (
                    <dl className="plugin-command-details">
                      {lastCommandResult.details.map((detail) => (
                        <div key={`${detail.label}:${detail.value}`}>
                          <dt>{detail.label}</dt>
                          <dd>{detail.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {lastCommandResult.resultText ? <code>{lastCommandResult.resultText}</code> : null}
                  {lastCommandResult.stdout ? <p>stdout: {lastCommandResult.stdout}</p> : null}
                  {lastCommandResult.stderr ? <p>stderr: {lastCommandResult.stderr}</p> : null}
                </div>
              ) : null}
              <PluginEntryDetails source={plugin} compact />
              {plugin.entries?.setup?.length ? (
                <div className="plugin-commands">
                  {plugin.entries.setup.map((setup) => {
                    const setupKey = `${plugin.id}:${setup.id}`
                    const setupStatus = setup.runtime?.status || 'not-run'
                    const running = setupStatus === 'running' || runningSetup === setupKey
                    const title = setup.title || setup.id
                    return (
                      <div className="plugin-service-control" key={setup.id}>
                        <span>Setup status: {setupStatus}</span>
                        <button
                          type="button"
                          className="ghost"
                          disabled={!plugin.enabled || plugin.blockStatus?.blocked || running}
                          onClick={() => onRunSetup(plugin.id, setup.id)}
                        >
                          {running ? '运行中' : `Run ${title} Setup`}
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : null}
              {plugin.entries?.services?.length ? (
                <div className="plugin-commands">
                  {plugin.entries.services.map((service) => {
                    const serviceKey = `${plugin.id}:${service.id}`
                    const runtimeStatus = service.runtime?.status || 'stopped'
                    const healthStatus = service.runtime?.health?.status || (service.health?.url ? 'unknown' : 'not-configured')
                    const policy = service.healthPolicy || { enabled: false, intervalMs: 30000 }
                    const policyEnabled = Boolean(policy.enabled)
                    const running = runtimeStatus === 'running'
                    const policySaving = savingServiceHealthPolicy === serviceKey
                    const policyDisabled = !plugin.enabled || Boolean(plugin.blockStatus?.blocked) || policySaving
                    const title = service.title || service.id
                    return (
                      <div className="plugin-service-control" key={service.id}>
                        <span>Service status: {runtimeStatus}{service.runtime?.pid ? ` · pid ${service.runtime.pid}` : ''}</span>
                        <span>Health: {healthStatus}</span>
                        <button
                          type="button"
                          className="ghost"
                          disabled={!plugin.enabled || plugin.blockStatus?.blocked || changingService === serviceKey}
                          onClick={() => running ? onStopService(plugin.id, service.id) : onStartService(plugin.id, service.id)}
                        >
                          {changingService === serviceKey
                            ? '处理中'
                            : running
                              ? `Stop ${title}`
                              : `Start ${title}`}
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          disabled={!plugin.enabled || plugin.blockStatus?.blocked || !service.health?.url || checkingServiceHealth === serviceKey}
                          onClick={() => onCheckServiceHealth(plugin.id, service.id)}
                        >
                          {checkingServiceHealth === serviceKey ? '检查中' : `Check ${title} Health`}
                        </button>
                        {service.health?.url ? (
                          <div className="plugin-health-policy">
                            <label className="plugin-health-policy-toggle">
                              <span>Periodic health</span>
                              <Toggle
                                ariaLabel={`Periodic health for ${title}`}
                                checked={policyEnabled}
                                disabled={policyDisabled}
                                onChange={(nextEnabled) => onSaveServiceHealthPolicy(plugin.id, service.id, nextEnabled, policy.intervalMs)}
                              />
                            </label>
                            <label className="plugin-health-policy-interval">
                              <span>Interval</span>
                              <select
                                className="text-input"
                                value={policy.intervalMs}
                                disabled={policyDisabled || !policyEnabled}
                                onChange={(event) => onSaveServiceHealthPolicy(plugin.id, service.id, policyEnabled, Number(event.target.value))}
                              >
                                <option value={15000}>15s</option>
                                <option value={30000}>30s</option>
                                <option value={60000}>60s</option>
                                <option value={300000}>5m</option>
                              </select>
                            </label>
                            <button
                              type="button"
                              className="ghost"
                              disabled={policyDisabled}
                              onClick={() => onSaveServiceHealthPolicy(plugin.id, service.id, policyEnabled, policy.intervalMs)}
                            >
                              {policySaving ? '保存中' : 'Save policy'}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ) : null}
              {plugin.entries?.dashboards?.length ? (
                <div className="plugin-commands">
                  {plugin.entries.dashboards.map((dashboard) => {
                    const dashboardKey = `${plugin.id}:${dashboard.id}`
                    const creatorStudioService = plugin.id === 'openpet.creator-studio'
                      ? plugin.entries?.services?.find((service) => service.id === 'studio')
                      : null
                    const requiresServiceStart = creatorStudioService?.runtime?.status !== 'running'
                    return (
                      <button
                        type="button"
                        className="ghost"
                        key={dashboard.id}
                        disabled={!plugin.enabled || plugin.blockStatus?.blocked || openingDashboard === dashboardKey}
                        onClick={() => onOpenDashboard(plugin.id, dashboard.id)}
                        title={requiresServiceStart ? '请先启动 Creator Studio Service' : ''}
                      >
                        {openingDashboard === dashboardKey ? '打开中' : dashboard.title}
                      </button>
                    )
                  })}
                </div>
              ) : null}
              {plugin.id === 'openpet.creator-studio' ? (
                <div className="plugin-config-panel" aria-label="Creator Studio 默认流">
                  <div className="plugin-config-header">
                    <strong>生成并导入</strong>
                    <button
                      type="button"
                      className="ghost"
                      disabled={!plugin.enabled || plugin.blockStatus?.blocked || openingDashboard === `${plugin.id}:main`}
                      onClick={() => onOpenDashboard(plugin.id, 'main')}
                    >
                      查看任务详情
                    </button>
                  </div>
                  <div className="field-note">
                    宿主默认路径会优先走已保存的图片 Provider。高级入口保留任务详情、QA、日志和手动逐步执行。
                  </div>
                  <label className="plugin-config-field" htmlFor="creator-studio-default-prompt">
                    <span>Creator Studio 请求</span>
                    <textarea
                      id="creator-studio-default-prompt"
                      className="text-input"
                      value={creatorStudioPromptDraft}
                      placeholder="描述你想新增或生成的动作 / 宠物效果"
                      onChange={(event) => onChangeCreatorStudioPromptDraft(event.target.value)}
                    />
                  </label>
                  <div className="plugin-commands">
                    <button
                      type="button"
                      className="primary"
                      disabled={!plugin.enabled || Boolean(plugin.blockStatus?.blocked) || runningCreatorStudioDefaultFlow}
                      onClick={() => onRunCreatorStudioDefaultFlow()}
                    >
                      {runningCreatorStudioDefaultFlow ? '处理中' : '生成并导入'}
                    </button>
                  </div>
                  <div className="field-note">高级入口：查看任务详情 / 手动逐步执行</div>
                </div>
              ) : null}
              {plugin.id === 'openpet.creator-studio' && plugin.entries?.dashboards?.length ? (
                <div className="field-note">Creator Studio Dashboard 依赖 Creator Studio Service；请先启动服务，再打开面板。</div>
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
                            <Toggle ariaLabel={field.title || field.key} checked={Boolean(value)} onChange={(nextValue) => onChangeConfig(plugin.id, field.key, nextValue)} />
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
            <Toggle ariaLabel={`Enable ${plugin.name}`} checked={plugin.enabled} onChange={(enabled) => onToggle(plugin.id, enabled)} />
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
