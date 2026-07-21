import type {
  ImGatewaySecretState,
  JsonValue,
  PaginatedLogsViewState,
  PermissionDiffState,
  PluginDashboardOpenOptions,
  PluginLogEntry,
  PluginLogFilters,
  PluginPackageReviewViewState,
  PluginViewState
} from '../../../shared/openpet-contracts'
import { PluginEntryDetails } from '../components/PluginEntryDetails'
import { Toggle } from '../components/Toggle'
import { formatBytes, formatPluginLogLevel, formatPluginLogTime, getPluginLogLevelClass } from '../lib/format'

type ExportFormat = 'json' | 'csv'

interface PluginConfigField {
  key: string
  title?: string
  description?: string
  type?: 'string' | 'number' | 'boolean'
  enum?: JsonValue[]
  required?: boolean
  hidden?: boolean
}

const IM_GATEWAY_PLUGIN_ID = 'openpet.im-gateway'
const IM_GATEWAY_SERVICE_ID = 'im-gateway'
const CREATOR_STUDIO_SERVICE_ID = 'studio'
const ACTIVE_SERVICE_STATUSES = new Set(['starting', 'running', 'stopping'])

export interface PluginsPaneProps {
  plugins: PluginViewState[]
  logs: PluginLogEntry[]
  logsPage: PaginatedLogsViewState<PluginLogEntry>
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
  imGatewaySecretState: ImGatewaySecretState
  imGatewayTelegramTokenDraft: string
  savingImGatewayTelegramToken: boolean
  clearingImGatewayTelegramToken: boolean
  onToggle: (pluginId: string, enabled: boolean) => void | Promise<void>
  onSetNativeExecutionApproved: (pluginId: string, approved: boolean) => void | Promise<void>
  onInspectPluginPackage: () => void | Promise<void>
  onInspectGithubPluginRepository: () => void | Promise<void>
  onClearPluginReview: () => void | Promise<void>
  onInstallReviewedPlugin: () => void | Promise<void>
  onUninstallPlugin: (pluginId: string) => void | Promise<void>
  onChangeConfig: (pluginId: string, key: string, value: JsonValue) => void
  onChangeCommandPayload: (pluginId: string, value: string) => void
  onChangeImGatewayTelegramTokenDraft: (value: string) => void
  onChangeCreatorStudioPromptDraft: (value: string) => void
  onChangeGithubRepositoryUrl: (value: string) => void
  onSaveConfig: (pluginId: string) => void | Promise<void>
  onSaveImGatewayTelegramBotToken: () => void | Promise<void>
  onClearImGatewayTelegramBotToken: () => void | Promise<void>
  onRun: (pluginId: string, commandId: string) => void | Promise<void>
  onRunCreatorStudioDefaultFlow: () => void | Promise<void>
  onRunSetup: (pluginId: string, setupId: string) => void | Promise<void>
  onOpenDashboard: (pluginId: string, dashboardId: string, options?: PluginDashboardOpenOptions) => void | Promise<void>
  onStartService: (pluginId: string, serviceId: string) => void | Promise<void>
  onStopService: (pluginId: string, serviceId: string) => void | Promise<void>
  onCheckServiceHealth: (pluginId: string, serviceId: string) => void | Promise<void>
  onSaveServiceHealthPolicy: (pluginId: string, serviceId: string, enabled: boolean, intervalMs: number) => void | Promise<void>
  onChangeFilters: (filters: PluginLogFilters) => void
  onPrevLogsPage?: () => void | Promise<void>
  onNextLogsPage?: () => void | Promise<void>
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
  if (field.hidden != null && typeof field.hidden !== 'boolean') return false
  return true
}

const toConfigFields = (plugin: PluginViewState) => (
  Array.isArray(plugin.configSchema?.properties)
    ? plugin.configSchema.properties.filter(isPluginConfigField).filter((field) => field.hidden !== true)
    : []
)

const getPluginService = (plugin: PluginViewState, serviceId: string) => (
  plugin.entries?.services?.find((service) => service.id === serviceId) || null
)

const isImGatewayRuntimeActive = (plugin: PluginViewState) => (
  plugin.id === IM_GATEWAY_PLUGIN_ID && ACTIVE_SERVICE_STATUSES.has(
    getPluginService(plugin, IM_GATEWAY_SERVICE_ID)?.runtime?.status || 'stopped'
  )
)

const getImGatewayOnboardingNotes = (
  plugin: PluginViewState,
  imGatewaySecretState: ImGatewaySecretState
) => {
  const service = getPluginService(plugin, IM_GATEWAY_SERVICE_ID)
  const runtimeStatus = service?.runtime?.status || 'stopped'
  const healthStatus = service?.runtime?.health?.status || 'unknown'
  const healthMessage = typeof service?.runtime?.health?.message === 'string'
    ? service.runtime.health.message.trim()
    : ''
  const notes = [
    imGatewaySecretState.hasTelegramBotToken
      ? 'Telegram Bot Token 已保存。'
      : '先保存 Telegram Bot Token，再启动 IM Gateway Service。',
    plugin.nativeExecutionApproved
      ? runtimeStatus === 'running'
        ? healthStatus === 'healthy'
          ? 'IM Gateway Service 与 Telegram 均已就绪，可以验证 allowlist 和回包。'
          : '服务正在运行，但 Telegram 尚未就绪；请先查看最近诊断并修复后再验证。'
        : '打开“允许原生进程执行”后，启动 IM Gateway Service 让 Telegram polling 生效。'
      : '先打开“允许原生进程执行”，否则 Setup / Service 不会真正启动。'
  ]
  if (healthMessage && healthMessage !== 'OK') notes.push(`最近诊断：${healthMessage}`)
  return notes
}

const formatDiff = (diff?: PermissionDiffState) => {
  const added = diff?.added?.length ? `新增 ${diff.added.join(', ')}` : ''
  const removed = diff?.removed?.length ? `移除 ${diff.removed.join(', ')}` : ''
  const unchanged = diff?.unchanged?.length ? `保留 ${diff.unchanged.join(', ')}` : ''
  return [added, removed, unchanged].filter(Boolean).join(' · ') || '无变化'
}

const getPluginManagementSummary = (plugin: PluginViewState) => {
  const commandCount = plugin.commands?.length || plugin.entries?.commands?.length || 0
  const setupCount = plugin.entries?.setup?.length || 0
  const serviceCount = plugin.entries?.services?.length || 0
  const dashboardCount = plugin.entries?.dashboards?.length || 0
  const configCount = toConfigFields(plugin).length
  const parts = [
    `${(plugin.permissions || []).length} 项权限`,
    commandCount ? `${commandCount} 个命令` : '',
    setupCount ? `${setupCount} 个 Setup` : '',
    serviceCount ? `${serviceCount} 个服务` : '',
    dashboardCount ? `${dashboardCount} 个面板` : '',
    configCount ? `${configCount} 项配置` : ''
  ]
  return parts.filter(Boolean)
}

const getPluginRuntimeSummary = (plugin: PluginViewState) => {
  const services = plugin.entries?.services || []
  if (!plugin.enabled && services.length) return `${services.length} 个服务已停止`
  const failedCount = services.filter((service) => service.runtime?.status === 'failed').length
  const runningCount = services.filter((service) => service.runtime?.status === 'running').length
  const unhealthyCount = services.filter((service) => (
    service.runtime?.status === 'running' && service.runtime?.health?.status === 'unhealthy'
  )).length
  if (failedCount) return `${failedCount} 个服务运行失败`
  if (unhealthyCount) return `${unhealthyCount} 个服务异常`
  if (runningCount) return `${runningCount} 个服务运行中`
  if (services.length) return `${services.length} 个服务已停止`
  return plugin.runnable ? '可运行' : '仅展示'
}

const hasPluginServiceAttention = (plugin: PluginViewState) => (
  plugin.entries?.services?.some((service) => (
    service.runtime?.status === 'failed' ||
    (service.runtime?.status === 'running' && service.runtime?.health?.status === 'unhealthy')
  )) || false
)

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

export function PluginsPane({ plugins, logs, logsPage, filters, status, runningCommand, creatorStudioPromptDraft, runningCreatorStudioDefaultFlow, lastCommandResult, commandPayloadDrafts, runningSetup, openingDashboard, changingService, checkingServiceHealth, savingServiceHealthPolicy, savingConfig, clearingStorage, pluginReview, inspectingPlugin, githubRepositoryUrl, inspectingGithubPlugin, installingPlugin, uninstallingPlugin, imGatewaySecretState, imGatewayTelegramTokenDraft, savingImGatewayTelegramToken, clearingImGatewayTelegramToken, onToggle, onSetNativeExecutionApproved, onInspectPluginPackage, onInspectGithubPluginRepository, onClearPluginReview, onInstallReviewedPlugin, onUninstallPlugin, onChangeConfig, onChangeCommandPayload, onChangeImGatewayTelegramTokenDraft, onChangeCreatorStudioPromptDraft, onChangeGithubRepositoryUrl, onSaveConfig, onSaveImGatewayTelegramBotToken, onClearImGatewayTelegramBotToken, onRun, onRunCreatorStudioDefaultFlow, onRunSetup, onOpenDashboard, onStartService, onStopService, onCheckServiceHealth, onSaveServiceHealthPolicy, onChangeFilters, onPrevLogsPage, onNextLogsPage, onExportLogs, onClearLogs, onClearStorage }: PluginsPaneProps) {
  const enabledPluginCount = plugins.filter((plugin) => plugin.enabled).length
  const attentionPluginCount = plugins.filter((plugin) => (
    Boolean(plugin.blockStatus?.blocked) ||
    (plugin.enabled && (
      (plugin.requiresNativeExecution && !plugin.nativeExecutionApproved) ||
      hasPluginServiceAttention(plugin)
    ))
  )).length

  return (
    <section className="pane">
      <header className="pane-header">
        <div>
          <h1>Plugins</h1>
          <p>查看状态、打开常用入口，需要时再展开高级管理</p>
        </div>
        <div className="header-actions">
          <button type="button" className="primary" disabled={inspectingPlugin} onClick={onInspectPluginPackage}>
            {inspectingPlugin ? '读取中' : 'Install plugin'}
          </button>
        </div>
      </header>

      <div className="plugins-overview" aria-label="插件概览">
        <div>
          <strong>{plugins.length}</strong>
          <span>已安装</span>
        </div>
        <div>
          <strong>{enabledPluginCount}</strong>
          <span>已启用</span>
        </div>
        <div className={attentionPluginCount ? 'attention' : ''}>
          <strong>{attentionPluginCount}</strong>
          <span>需要处理</span>
        </div>
      </div>

      <details className="plugin-install-disclosure">
        <summary>
          <span className="plugin-disclosure-summary-copy">
            <strong>从 GitHub 导入</strong>
            <span>适合仓库根目录包含 plugin.json 的插件</span>
          </span>
        </summary>
        <div className="plugin-install-disclosure-body">
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
        </div>
      </details>

      <PluginReviewPanel
        review={pluginReview}
        installingPlugin={installingPlugin}
        onInstallReviewedPlugin={onInstallReviewedPlugin}
        onClearPluginReview={onClearPluginReview}
      />

      <div className="plugin-list">
        {plugins.length === 0 ? (
          <div className="empty-chat">暂无插件</div>
        ) : plugins.map((plugin) => {
          const managementSummary = getPluginManagementSummary(plugin)
          const blocked = Boolean(plugin.blockStatus?.blocked)
          const needsApproval = plugin.enabled && !blocked && plugin.requiresNativeExecution && !plugin.nativeExecutionApproved
          return (
          <article className={blocked ? 'plugin-row blocked' : 'plugin-row'} key={plugin.id}>
            <div className="plugin-card-header">
              <div className="plugin-title-block">
                <div className="plugin-title">
                  <strong>{plugin.name}</strong>
                  <span className="plugin-source-badge">{plugin.source}</span>
                </div>
                <div className="plugin-meta">
                  <span>{plugin.id}</span>
                  <span>v{plugin.version}</span>
                  <span>{plugin.signatureStatus?.label || 'Signature unknown'}</span>
                </div>
              </div>
              <div className="plugin-enable-control">
                <span>{plugin.enabled ? '已启用' : '已停用'}</span>
                <Toggle ariaLabel={`Enable ${plugin.name}`} checked={plugin.enabled} onChange={(enabled) => onToggle(plugin.id, enabled)} />
              </div>
            </div>

            <div className="plugin-summary-strip" aria-label={`${plugin.name} 状态摘要`}>
              <span className={plugin.enabled ? 'plugin-status-pill success' : 'plugin-status-pill'}>{plugin.enabled ? '插件已启用' : '当前停用'}</span>
              <span className={blocked ? 'plugin-status-pill danger' : 'plugin-status-pill'}>{blocked ? '已被策略阻止' : getPluginRuntimeSummary(plugin)}</span>
              {needsApproval ? <span className="plugin-status-pill warning">需要原生执行授权</span> : null}
              {managementSummary.map((item) => <span className="plugin-summary-item" key={item}>{item}</span>)}
            </div>

            <div className="plugin-main">
              {plugin.requiresNativeExecution ? (
                <div className="plugin-native-execution" role="group" aria-label={`Native execution approval for ${plugin.name}`}>
                  <label className="plugin-health-policy-toggle">
                    <span>允许原生进程执行{plugin.nativeExecutionApproved ? '' : '（未批准时 Setup / Service / Command 不可运行）'}</span>
                    <Toggle
                      ariaLabel={`Allow native process execution for ${plugin.name}`}
                      checked={Boolean(plugin.nativeExecutionApproved)}
                      disabled={Boolean(plugin.blockStatus?.blocked)}
                      onChange={(nextApproved) => onSetNativeExecutionApproved(plugin.id, nextApproved)}
                    />
                  </label>
                  <small className="field-note">声明式插件通过 entries 在你的权限下启动系统进程，无沙箱隔离。仅在你信任该插件来源时开启。</small>
                </div>
              ) : null}
              {plugin.id === 'openpet.creator-studio' ? (
                <div className="plugin-config-panel plugin-primary-workflow" aria-label="Creator Studio 默认流">
                  <div className="plugin-config-header">
                    <strong>生成并等待复查</strong>
                    <button
                      type="button"
                      className="ghost"
                      disabled={!plugin.enabled || plugin.blockStatus?.blocked || openingDashboard === `${plugin.id}:main`}
                      onClick={() => onOpenDashboard(plugin.id, 'main')}
                    >
                      {openingDashboard === `${plugin.id}:main`
                        ? (getPluginService(plugin, CREATOR_STUDIO_SERVICE_ID)?.runtime?.status === 'running' ? '打开中' : '启动并打开中')
                        : getPluginService(plugin, CREATOR_STUDIO_SERVICE_ID)?.runtime?.status === 'running'
                          ? '查看任务详情'
                          : '启动并查看任务详情'}
                    </button>
                  </div>
                  <div className="field-note">
                    宿主默认路径会优先走已保存的图片 Provider，并在生成完成后停在人工复查。审批、导入和激活需要分别执行。
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
                      {runningCreatorStudioDefaultFlow ? '处理中' : '开始生成'}
                    </button>
                  </div>
                  <div className="field-note">高级入口：查看任务详情 / 手动逐步执行</div>
                </div>
              ) : null}
              {plugin.id === 'openpet.agent-awareness' ? (
                <div className="plugin-quick-entry" aria-label="Agent Awareness 详情入口">
                  <div>
                    <strong>Codex Awareness</strong>
                    <span>查看当前 Codex 会话和使用情况</span>
                  </div>
                  <button
                    type="button"
                    className="ghost"
                    disabled={!plugin.enabled || Boolean(plugin.blockStatus?.blocked) || openingDashboard === `${plugin.id}:main`}
                    onClick={() => onOpenDashboard(plugin.id, 'main', { query: { view: 'details' } })}
                  >
                    查看 Codex 详情
                  </button>
                </div>
              ) : null}
              <details className="plugin-management-disclosure">
                <summary>
                  <span className="plugin-disclosure-summary-copy">
                    <strong>管理与诊断</strong>
                    <span>{managementSummary.join(' · ') || '查看插件详细信息'}</span>
                  </span>
                </summary>
                <div className="plugin-management-body">
                  <div className="permission-line">
                    <strong>权限</strong>
                    <span>{(plugin.permissions || []).length === 0 ? '无权限' : plugin.permissions.join(' · ')}</span>
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
                          disabled={!plugin.enabled || !plugin.runnable || (plugin.requiresNativeExecution && !plugin.nativeExecutionApproved) || plugin.blockStatus?.blocked || runningCommand === commandKey}
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
                          disabled={!plugin.enabled || (plugin.requiresNativeExecution && !plugin.nativeExecutionApproved) || plugin.blockStatus?.blocked || running}
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
                    const healthMessage = typeof service.runtime?.health?.message === 'string' ? service.runtime.health.message : ''
                    const healthDetails = plugin.id === 'openpet.agent-awareness' && service.id === 'agent-awareness' && Array.isArray(service.runtime?.health?.details)
                      ? service.runtime.health.details.filter((detail) => typeof detail.label === 'string' && typeof detail.value === 'string')
                      : []
                    const healthNoteTone = healthStatus === 'healthy'
                      ? 'success'
                      : healthStatus === 'unhealthy'
                        ? 'danger'
                        : healthStatus === 'checking'
                          ? 'info'
                          : 'neutral'
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
                        {healthMessage ? <span className={`plugin-service-note plugin-service-note-${healthNoteTone}`}>Health note: {healthMessage}</span> : null}
                        {healthDetails.length ? (
                          <div className="agent-awareness-health-details" aria-label="Agent Awareness 原生详情">
                            <strong>Agent Awareness 原生详情</strong>
                            <dl>
                              {healthDetails.map((detail) => (
                                <div key={`${detail.label}:${detail.value}`}>
                                  <dt>{detail.label}</dt>
                                  <dd>{detail.value}</dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                        ) : null}
                        <button
                          type="button"
                          className="ghost"
                          disabled={!plugin.enabled || (plugin.requiresNativeExecution && !plugin.nativeExecutionApproved) || plugin.blockStatus?.blocked || changingService === serviceKey}
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
                        title={requiresServiceStart ? '点击后将自动启动 Creator Studio Service' : ''}
                      >
                        {openingDashboard === dashboardKey ? '打开中' : dashboard.title}
                      </button>
                    )
                  })}
                </div>
              ) : null}
              {plugin.id === IM_GATEWAY_PLUGIN_ID ? (
                <div className="plugin-config-panel" aria-label="IM Gateway 设置">
                  {(() => {
                    const imGatewayService = getPluginService(plugin, IM_GATEWAY_SERVICE_ID)
                    const onboardingNotes = getImGatewayOnboardingNotes(plugin, imGatewaySecretState)
                    const runtimeStatus = imGatewayService?.runtime?.status || 'stopped'
                    const healthStatus = imGatewayService?.runtime?.health?.status || 'unknown'
                    const runtimeActive = isImGatewayRuntimeActive(plugin)
                    return (
                      <>
                  <div className="plugin-config-header">
                    <strong>IM Gateway</strong>
                    <span className="field-note">
                      Telegram token: {imGatewaySecretState.hasTelegramBotToken ? 'saved' : 'not saved'}
                    </span>
                  </div>
                  <div className="field-note">Service: {runtimeStatus} · Health: {healthStatus}</div>
                  {runtimeActive ? (
                    <div className="field-note">Stop IM Gateway Service before changing Telegram credentials or routing policy.</div>
                  ) : null}
                  <div className="plugin-config-field">
                    <span>Telegram</span>
                    <small>Telegram: {String(plugin.config?.telegramMode || 'polling')}</small>
                  </div>
                  <div aria-label="IM Gateway onboarding">
                    <div className="plugin-config-header">
                      <strong>Telegram onboarding</strong>
                    </div>
                    <div className="field-note">
                      在 Telegram 私聊机器人发送 <code>/openpet whoami</code> 获取 user id。
                    </div>
                    <div className="field-note">
                      在目标群消息下回复 <code>/openpet chatid</code> 获取当前 chat id。
                    </div>
                    {onboardingNotes.map((note) => (
                      <div className="field-note" key={note}>{note}</div>
                    ))}
                  </div>
                  <label className="plugin-config-field" htmlFor="im-gateway-telegram-bot-token">
                    <span>Telegram Bot Token</span>
                    <input
                      id="im-gateway-telegram-bot-token"
                      className="text-input"
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      value={imGatewayTelegramTokenDraft}
                      disabled={runtimeActive}
                      onChange={(event) => onChangeImGatewayTelegramTokenDraft(event.target.value)}
                    />
                  </label>
                  <div className="plugin-commands">
                    <button
                      type="button"
                      className="primary"
                      disabled={runtimeActive || !imGatewayTelegramTokenDraft.trim() || savingImGatewayTelegramToken}
                      onClick={onSaveImGatewayTelegramBotToken}
                    >
                      {savingImGatewayTelegramToken ? 'Saving Telegram Token' : 'Save Telegram Token'}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      disabled={runtimeActive || !imGatewaySecretState.hasTelegramBotToken || clearingImGatewayTelegramToken}
                      onClick={onClearImGatewayTelegramBotToken}
                    >
                      {clearingImGatewayTelegramToken ? 'Clearing Telegram Token' : 'Clear Telegram Token'}
                    </button>
                  </div>
                      </>
                    )
                  })()}
                </div>
              ) : null}
              {plugin.id === 'openpet.creator-studio' && plugin.entries?.dashboards?.length ? (
                <div className="field-note">Creator Studio Dashboard 需要详情服务；点击后会自动启动并等待健康检查。</div>
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
                      disabled={isImGatewayRuntimeActive(plugin) || savingConfig === plugin.id}
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
                              disabled={isImGatewayRuntimeActive(plugin)}
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
                            <Toggle ariaLabel={field.title || field.key} checked={Boolean(value)} disabled={isImGatewayRuntimeActive(plugin)} onChange={(nextValue) => onChangeConfig(plugin.id, field.key, nextValue)} />
                          ) : (
                            <input
                              className="text-input"
                              type={field.type === 'number' ? 'number' : 'text'}
                              value={inputValue}
                              disabled={isImGatewayRuntimeActive(plugin)}
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
              </details>
            </div>
          </article>
          )
        })}
      </div>

      {status ? <div className="status-line">{status}</div> : null}

      <details className="plugin-log-disclosure">
        <summary>
          <span className="plugin-disclosure-summary-copy">
            <strong>运行日志</strong>
            <span>第 {logsPage.page} / {logsPage.totalPages} 页 · 共 {logsPage.total} 条</span>
          </span>
        </summary>
        <div className="plugin-log-panel">
          <div className="plugin-log-header">
            <span>按插件、级别或关键词筛选日志</span>
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
              <option value="warn">Warning</option>
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
              <div className={`plugin-log-row ${getPluginLogLevelClass(log.level)}`} key={log.id}>
                <span>{formatPluginLogTime(log.timestamp)}</span>
                <strong>{formatPluginLogLevel(log.level)}</strong>
                <div>
                  <span>{log.pluginId || 'plugin'}</span>
                  {log.commandId ? <span>/{log.commandId}</span> : null}
                </div>
                <p>{log.message}</p>
              </div>
            ))}
          </div>
          <div className="log-pagination">
            <button type="button" className="ghost" onClick={onPrevLogsPage} disabled={!onPrevLogsPage}>上一页</button>
            <span>当前 {logs.length} 条 / 每页 {logsPage.pageSize} 条</span>
            <button type="button" className="ghost" onClick={onNextLogsPage} disabled={!onNextLogsPage}>下一页</button>
          </div>
        </div>
      </details>
    </section>
  )
}
