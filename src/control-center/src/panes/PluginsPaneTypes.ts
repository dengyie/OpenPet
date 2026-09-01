import type {
  ImGatewaySecretState,
  JsonValue,
  PaginatedLogsViewState,
  PluginDashboardOpenOptions,
  PluginLogEntry,
  PluginLogFilters,
  PluginPackageReviewViewState,
  PluginViewState
} from '../../../shared/openpet-contracts'
import type { ReturnTypeOfCommandPreview } from '../lib/plugin-command-result-types'

export type ExportFormat = 'json' | 'csv'
export type PluginCommandResultPreview = ReturnTypeOfCommandPreview

export interface PluginsPaneProps {
  plugins: PluginViewState[]
  logs: PluginLogEntry[]
  logsPage: PaginatedLogsViewState<PluginLogEntry>
  filters: PluginLogFilters
  status: string
  runningCommand: string
  creatorStudioPromptDraft: string
  runningCreatorStudioDefaultFlow: boolean
  lastCommandResult: PluginCommandResultPreview | null
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
