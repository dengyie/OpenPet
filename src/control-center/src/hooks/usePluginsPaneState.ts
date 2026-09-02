import { usePluginsPaneActions } from './usePluginsPaneActions'
import { usePluginsPaneData } from './usePluginsPaneData'
import type { JsonValue, PluginLogFilters } from '../../../shared/openpet-contracts'
import type { PluginsPaneProps } from '../panes/PluginsPaneTypes'

export function usePluginsPane() {
  const data = usePluginsPaneData()
  const actions = usePluginsPaneActions(data)
  const { busy, setCommandPayloadDrafts, setCreatorStudioPromptDraft, setGithubRepositoryUrl, setFilters, setImGatewayTelegramTokenDraft, setImGatewayQqAppIdDraft, setImGatewayQqClientSecretDraft, setImGatewayWecomCredentialsDraft, setPlugins, logsPage, filters, plugins, loadLogsPage } = data
  const paneProps: PluginsPaneProps = {
    plugins, logs: data.logs, logsPage, filters, status: data.status,
    runningCommand: busy.runningCommand, creatorStudioPromptDraft: data.creatorStudioPromptDraft,
    runningCreatorStudioDefaultFlow: busy.runningCreatorStudioDefaultFlow, lastCommandResult: data.lastCommandResult,
    commandPayloadDrafts: data.commandPayloadDrafts, runningSetup: busy.runningSetup, openingDashboard: busy.openingDashboard,
    changingService: busy.changingService, checkingServiceHealth: busy.checkingServiceHealth,
    savingServiceHealthPolicy: busy.savingServiceHealthPolicy, savingConfig: busy.savingConfig, clearingStorage: busy.clearingStorage,
    pluginReview: data.pluginReview, inspectingPlugin: busy.inspectingPlugin, githubRepositoryUrl: data.githubRepositoryUrl,
    inspectingGithubPlugin: busy.inspectingGithubPlugin, installingPlugin: busy.installingPlugin, uninstallingPlugin: busy.uninstallingPlugin,
    imGatewaySecretState: data.imGatewaySecretState, imGatewayTelegramTokenDraft: data.imGatewayTelegramTokenDraft,
    imGatewayQqAppIdDraft: data.imGatewayQqAppIdDraft, imGatewayQqClientSecretDraft: data.imGatewayQqClientSecretDraft,
    savingImGatewayQqCredentials: busy.savingImGatewayQqCredentials, clearingImGatewayQqCredentials: busy.clearingImGatewayQqCredentials,
    imGatewayWecomCredentialsDraft: data.imGatewayWecomCredentialsDraft,
    savingImGatewayTelegramToken: busy.savingImGatewayTelegramToken, clearingImGatewayTelegramToken: busy.clearingImGatewayTelegramToken,
    savingImGatewayWecomCredentials: busy.savingImGatewayWecomCredentials, clearingImGatewayWecomCredentials: busy.clearingImGatewayWecomCredentials,
    ...actions,
    onClearPluginReview: () => data.setPluginReview(null),
    onChangeConfig: (pluginId: string, key: string, value: JsonValue) => setPlugins((items) => items.map((plugin) => plugin.id === pluginId ? { ...plugin, config: { ...(plugin.config || {}), [key]: value } } : plugin)),
    onChangeCommandPayload: (pluginId: string, value: string) => setCommandPayloadDrafts((current) => ({ ...current, [pluginId]: value })),
    onChangeImGatewayTelegramTokenDraft: setImGatewayTelegramTokenDraft,
    onChangeImGatewayQqAppIdDraft: data.setImGatewayQqAppIdDraft, onChangeImGatewayQqClientSecretDraft: data.setImGatewayQqClientSecretDraft,
    onChangeImGatewayWecomCredentialsDraft: (key, value) => setImGatewayWecomCredentialsDraft((current) => ({ ...current, [key]: value })),
    onChangeCreatorStudioPromptDraft: setCreatorStudioPromptDraft,
    onChangeGithubRepositoryUrl: setGithubRepositoryUrl,
    onChangeFilters: (next: PluginLogFilters) => setFilters(next),
    onPrevLogsPage: logsPage.page > 1 ? async () => { await loadLogsPage(filters, logsPage.page - 1) } : undefined,
    onNextLogsPage: logsPage.page < logsPage.totalPages ? async () => { await loadLogsPage(filters, logsPage.page + 1) } : undefined,
  }
  return { loading: data.loading, paneProps }
}
