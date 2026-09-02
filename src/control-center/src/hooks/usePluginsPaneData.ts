import { useEffect, useState } from 'react'
import { controlCenterAPI as api } from '../api/control-center-api'
import { pluginHttpApi, shouldUsePluginDemoApi } from '../features/plugins/api'
import type { ImGatewaySecretState, PaginatedLogsViewState, PluginLogEntry, PluginLogFilters, PluginViewState } from '../../../shared/openpet-contracts'

export const LOG_PAGE_SIZE = 50
export const EMPTY_SECRET: ImGatewaySecretState = { hasTelegramBotToken: false, hasQqOfficialAppId: false, hasQqOfficialClientSecret: false, hasQqOfficialCredentials: false, hasWecomCredentials: false }

export function usePluginsPaneData() {
  const [loading, setLoading] = useState(true)
  const [plugins, setPlugins] = useState<PluginViewState[]>([])
  const [logs, setLogs] = useState<PluginLogEntry[]>([])
  const [logsPage, setLogsPage] = useState<PaginatedLogsViewState<PluginLogEntry>>({ entries: [], page: 1, pageSize: LOG_PAGE_SIZE, total: 0, totalPages: 1 })
  const [filters, setFilters] = useState<PluginLogFilters>({ pluginId: '', level: '', query: '' })
  const [status, setStatus] = useState('')
  const [commandPayloadDrafts, setCommandPayloadDrafts] = useState<Record<string, string>>({})
  const [creatorStudioPromptDraft, setCreatorStudioPromptDraft] = useState('')
  const [creatorStudioLastRunId, setCreatorStudioLastRunId] = useState('')
  const [lastCommandResult, setLastCommandResult] = useState<any>(null)
  const [imGatewaySecretState, setImGatewaySecretState] = useState<ImGatewaySecretState>(EMPTY_SECRET)
  const [imGatewayTelegramTokenDraft, setImGatewayTelegramTokenDraft] = useState('')
  const [imGatewayQqAppIdDraft, setImGatewayQqAppIdDraft] = useState('')
  const [imGatewayQqClientSecretDraft, setImGatewayQqClientSecretDraft] = useState('')
  const [imGatewayWecomCredentialsDraft, setImGatewayWecomCredentialsDraft] = useState({ corpSecret: '', token: '', encodingAesKey: '' })
  const [busy, setBusy] = useState({ runningCommand: '', runningSetup: '', openingDashboard: '', changingService: '', checkingServiceHealth: '', savingServiceHealthPolicy: '', savingConfig: '', clearingStorage: '', inspectingPlugin: false, installingPlugin: false, uninstallingPlugin: '', inspectingGithubPlugin: false, runningCreatorStudioDefaultFlow: false, savingImGatewayTelegramToken: false, clearingImGatewayTelegramToken: false, savingImGatewayQqCredentials: false, clearingImGatewayQqCredentials: false, savingImGatewayWecomCredentials: false, clearingImGatewayWecomCredentials: false })
  const [pluginReview, setPluginReview] = useState<any>(null)
  const [githubRepositoryUrl, setGithubRepositoryUrl] = useState('')

  const useDemoApi = () => shouldUsePluginDemoApi(import.meta.env?.DEV === true, Boolean((globalThis as any).openpetBackend))
  const getPlugins = async () => (await (useDemoApi() ? api.getPlugins() : pluginHttpApi.list())) as PluginViewState[]
  const loadLogsPage = async (nextFilters = filters, page = 1) => {
    const loaded = plugins.length ? plugins : await getPlugins()
    const responses = await Promise.all(loaded.map((plugin) => useDemoApi()
      ? api.getPluginLogs({ ...nextFilters, pluginId: plugin.id, page: 1, pageSize: 1000 })
      : pluginHttpApi.logs(plugin.id, { ...nextFilters, page: 1, pageSize: 1000 })))
    const entries = responses.flatMap((result: any) => result?.items || result?.entries || [])
    const result = { entries: entries.slice((page - 1) * LOG_PAGE_SIZE, page * LOG_PAGE_SIZE), total: entries.length, page, pageSize: LOG_PAGE_SIZE, totalPages: Math.max(1, Math.ceil(entries.length / LOG_PAGE_SIZE)) }
    setLogsPage(result); setLogs(result.entries); return result
  }
  const refreshPlugins = async () => setPlugins(await getPlugins())
  const refreshLogs = async () => { await loadLogsPage(filters, logsPage.page) }

  useEffect(() => { let active = true; Promise.all([getPlugins(), useDemoApi() ? api.getImGatewaySecretState() : pluginHttpApi.imSecret('state')]).then(([items, secret]) => { if (!active) return; setPlugins(items); setImGatewaySecretState(secret || EMPTY_SECRET); setLoading(false) }).catch((error) => { if (active) { setStatus(error?.message || '插件列表加载失败'); setLoading(false) } }); return () => { active = false } }, [])
  useEffect(() => { let active = true; loadLogsPage(filters, 1).then((result) => { if (active) { setLogsPage(result); setLogs(result.entries) } }).catch((error) => { if (active) setStatus(error?.message || '日志加载失败') }); return () => { active = false } }, [filters])
  return { loading, plugins, setPlugins, logs, setLogs, logsPage, setLogsPage, filters, setFilters, status, setStatus, commandPayloadDrafts, setCommandPayloadDrafts, creatorStudioPromptDraft, setCreatorStudioPromptDraft, creatorStudioLastRunId, setCreatorStudioLastRunId, lastCommandResult, setLastCommandResult, imGatewaySecretState, setImGatewaySecretState, imGatewayTelegramTokenDraft, setImGatewayTelegramTokenDraft, imGatewayQqAppIdDraft, setImGatewayQqAppIdDraft, imGatewayQqClientSecretDraft, setImGatewayQqClientSecretDraft, imGatewayWecomCredentialsDraft, setImGatewayWecomCredentialsDraft, busy, setBusy, pluginReview, setPluginReview, githubRepositoryUrl, setGithubRepositoryUrl, getPlugins, loadLogsPage, refreshPlugins, refreshLogs }
}
