import { useEffect, useState } from 'react'
import { controlCenterAPI as api } from '../api/control-center-api'
import { downloadTextFile } from '../lib/download'
import { messageFromError } from '../lib/errors'
import { toCommandResultPreview } from '../lib/plugin-command-result.mjs'
import type {
  JsonObject,
  JsonValue,
  PluginLogEntry,
  PluginLogFilters,
  PluginPackageReviewViewState,
  PluginViewState
} from '../../../shared/openpet-contracts'
import type { PluginsPaneProps } from '../panes/PluginsPane'

type ExportFormat = 'json' | 'csv'

type PluginCommandResultPreview = ReturnType<typeof toCommandResultPreview>

const parseCommandPayload = (draft: string): JsonObject | undefined => {
  const trimmed = String(draft || '').trim()
  if (!trimmed) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (_) {
    throw new Error('命令 Payload 必须是合法 JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('命令 Payload 必须是 JSON 对象')
  }
  return parsed as JsonObject
}

const CREATOR_STUDIO_PLUGIN_ID = 'openpet.creator-studio'
const CREATOR_STUDIO_SERVICE_ID = 'studio'

const findPluginById = (plugins: PluginViewState[], pluginId: string) => (
  plugins.find((plugin) => plugin.id === pluginId) || null
)

const getPluginServiceRuntimeStatus = (plugin: PluginViewState | null, serviceId: string) => (
  plugin?.entries?.services?.find((service) => service.id === serviceId)?.runtime?.status || 'stopped'
)

export function usePluginsPane() {
  const [loading, setLoading] = useState(true)
  const [plugins, setPlugins] = useState<PluginViewState[]>([])
  const [logs, setLogs] = useState<PluginLogEntry[]>([])
  const [filters, setFilters] = useState<PluginLogFilters>({ pluginId: '', level: '', query: '' })
  const [status, setStatus] = useState('')
  const [runningCommand, setRunningCommand] = useState('')
  const [creatorStudioPromptDraft, setCreatorStudioPromptDraft] = useState('')
  const [creatorStudioLastRunId, setCreatorStudioLastRunId] = useState('')
  const [runningCreatorStudioDefaultFlow, setRunningCreatorStudioDefaultFlow] = useState(false)
  const [lastCommandResult, setLastCommandResult] = useState<PluginCommandResultPreview | null>(null)
  const [commandPayloadDrafts, setCommandPayloadDrafts] = useState<Record<string, string>>({})
  const [runningSetup, setRunningSetup] = useState('')
  const [openingDashboard, setOpeningDashboard] = useState('')
  const [changingService, setChangingService] = useState('')
  const [checkingServiceHealth, setCheckingServiceHealth] = useState('')
  const [savingServiceHealthPolicy, setSavingServiceHealthPolicy] = useState('')
  const [savingConfig, setSavingConfig] = useState('')
  const [clearingStorage, setClearingStorage] = useState('')
  const [pluginReview, setPluginReview] = useState<PluginPackageReviewViewState | null>(null)
  const [inspectingPlugin, setInspectingPlugin] = useState(false)
  const [installingPlugin, setInstallingPlugin] = useState(false)
  const [uninstallingPlugin, setUninstallingPlugin] = useState('')
  const [githubRepositoryUrl, setGithubRepositoryUrl] = useState('')
  const [inspectingGithubPlugin, setInspectingGithubPlugin] = useState(false)

  useEffect(() => {
    let mounted = true
    Promise.all([
      api.getPlugins(),
      api.getPluginLogs(filters)
    ]).then(([loadedPlugins, loadedLogs]) => {
      if (!mounted) return
      setPlugins(loadedPlugins)
      setLogs(Array.isArray(loadedLogs) ? loadedLogs : [])
      setLoading(false)
    }).catch((error) => {
      if (!mounted) return
      setStatus(messageFromError(error, '插件列表加载失败'))
      setLoading(false)
    })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    let mounted = true
    api.getPluginLogs(filters).then((loadedLogs) => {
      if (mounted) setLogs(Array.isArray(loadedLogs) ? loadedLogs : [])
    }).catch((error) => {
      if (mounted) setStatus(messageFromError(error, '日志加载失败'))
    })
    return () => { mounted = false }
  }, [filters])

  const refreshLogs = async () => {
    setLogs(await api.getPluginLogs(filters))
  }

  const refreshPlugins = async () => {
    setPlugins(await api.getPlugins())
  }

  const onInspectPluginPackage = async () => {
    setInspectingPlugin(true)
    setStatus('')
    try {
      const result = await api.inspectPluginPackage()
      if (result.canceled) return
      setPluginReview(result)
      setStatus(result.installMode === 'update' ? '已读取插件更新包' : '已读取插件安装包')
    } catch (error) {
      setStatus(messageFromError(error, '插件包检查失败'))
    } finally {
      setInspectingPlugin(false)
    }
  }

  const onInspectGithubPluginRepository = async () => {
    setInspectingGithubPlugin(true)
    setStatus('')
    try {
      const result = await api.inspectPluginGithubRepository(githubRepositoryUrl)
      if (result.canceled) return
      setPluginReview(result)
      setStatus(result.installMode === 'update' ? '已读取 GitHub 插件更新包' : '已读取 GitHub 插件安装包')
    } catch (error) {
      setStatus(messageFromError(error, 'GitHub 插件导入失败'))
    } finally {
      setInspectingGithubPlugin(false)
    }
  }

  const onClearPluginReview = async () => {
    try {
      if (pluginReview?.selectionId) await api.clearPluginSelection(pluginReview.selectionId)
    } catch (_) {}
    setPluginReview(null)
  }

  const onInstallReviewedPlugin = async () => {
    if (!pluginReview?.selectionId) return
    setInstallingPlugin(true)
    setStatus('')
    try {
      const result = pluginReview.installMode === 'update'
        ? await api.updatePlugin(pluginReview.selectionId)
        : await api.installPlugin(pluginReview.selectionId)
      setPlugins(result.plugins || await api.getPlugins())
      setPluginReview(null)
      await refreshLogs()
      setStatus(pluginReview.installMode === 'update' ? '插件已更新，默认保持停用' : '插件已安装，默认保持停用')
    } catch (error) {
      setStatus(messageFromError(error, '插件安装失败'))
      await refreshPlugins()
    } finally {
      setInstallingPlugin(false)
    }
  }

  const onUninstallPlugin = async (pluginId: string) => {
    if (!window.confirm(`卸载插件 ${pluginId}？插件文件和配置会被移除。`)) return
    const removeStorage = window.confirm('同时删除这个插件的私有存储？')
    setUninstallingPlugin(pluginId)
    setStatus('')
    try {
      const result = await api.uninstallPlugin(pluginId, { removeStorage })
      setPlugins(result.plugins || await api.getPlugins())
      await refreshLogs()
      setStatus(removeStorage ? '插件已卸载，私有存储已删除' : '插件已卸载，私有存储已保留')
    } catch (error) {
      setStatus(messageFromError(error, '插件卸载失败'))
      await refreshPlugins()
    } finally {
      setUninstallingPlugin('')
    }
  }

  const onToggle = async (pluginId: string, enabled: boolean) => {
    setStatus('')
    try {
      const updatedPlugin = await api.setPluginEnabled(pluginId, enabled)
      setPlugins(plugins.map((plugin) => (
        plugin.id === pluginId ? { ...plugin, ...updatedPlugin } : plugin
      )))
      await refreshLogs()
      setStatus(enabled ? '插件已启用' : '插件已停用')
    } catch (error) {
      setStatus(messageFromError(error, '插件状态更新失败'))
      await refreshLogs()
    }
  }

  const onSaveConfig = async (pluginId: string) => {
    const plugin = plugins.find((candidate) => candidate.id === pluginId)
    if (!plugin) return
    setSavingConfig(pluginId)
    setStatus('')
    try {
      const updatedPlugin = await api.savePluginConfig(pluginId, plugin.config || {})
      setPlugins(plugins.map((candidate) => (
        candidate.id === pluginId ? { ...candidate, ...updatedPlugin } : candidate
      )))
      await refreshLogs()
      setStatus('插件配置已保存')
    } catch (error) {
      setStatus(messageFromError(error, '插件配置保存失败'))
      await refreshLogs()
    } finally {
      setSavingConfig('')
    }
  }

  const onRun = async (pluginId: string, commandId: string) => {
    let payload: JsonObject | undefined
    try {
      payload = parseCommandPayload(commandPayloadDrafts[pluginId] || '')
    } catch (error) {
      setStatus(messageFromError(error, '命令 Payload 无效'))
      return
    }
    const commandKey = `${pluginId}:${commandId}`
    setRunningCommand(commandKey)
    setStatus('')
    try {
      const result = await api.runPluginCommand(pluginId, commandId, payload)
      const preview = toCommandResultPreview(result)
      setLastCommandResult(preview)
      await refreshLogs()
      setStatus(preview.message || '命令执行成功')
    } catch (error) {
      setLastCommandResult(null)
      setStatus(messageFromError(error, '命令运行失败'))
      await refreshLogs()
    } finally {
      setRunningCommand('')
    }
  }

  const onRunCreatorStudioDefaultFlow = async () => {
    const plugin = findPluginById(plugins, CREATOR_STUDIO_PLUGIN_ID)
    if (!plugin) {
      setStatus('未找到 Creator Studio 插件')
      return
    }
    if (!plugin.enabled || !plugin.runnable || plugin.blockStatus?.blocked) {
      setStatus('请先启用 Creator Studio 插件')
      return
    }
    const runtimeStatus = getPluginServiceRuntimeStatus(plugin, CREATOR_STUDIO_SERVICE_ID)
    if (runtimeStatus !== 'running') {
      setStatus('请先启动 Creator Studio Service，再使用生成并导入')
      return
    }
    const prompt = String(creatorStudioPromptDraft || '').trim()
    if (!prompt) {
      setStatus('请先输入 Creator Studio 请求')
      return
    }

    setRunningCreatorStudioDefaultFlow(true)
    setStatus('')
    try {
      const result = await api.runCreatorStudioDefaultFlow(prompt)
      setCreatorStudioLastRunId(String(result.runId || '').trim())
      setLastCommandResult(result.lastCommandResult ? toCommandResultPreview(result.lastCommandResult) : null)
      await refreshLogs()
      setStatus(result.message || '生成并导入已完成')
      if (result.state === 'completed') setCreatorStudioPromptDraft('')
    } catch (error) {
      setLastCommandResult(null)
      setStatus(messageFromError(error, '生成并导入启动失败'))
      await refreshLogs()
    } finally {
      setRunningCreatorStudioDefaultFlow(false)
    }
  }

  const onRunSetup = async (pluginId: string, setupId: string) => {
    const setupKey = `${pluginId}:${setupId}`
    setRunningSetup(setupKey)
    setStatus('')
    try {
      const result = await api.runPluginSetup(pluginId, setupId)
      setPlugins((currentPlugins) => currentPlugins.map((plugin) => (
        plugin.id === pluginId
          ? {
              ...plugin,
              entries: {
                ...plugin.entries,
                setup: (plugin.entries?.setup || []).map((setup) => (
                  setup.id === setupId ? { ...setup, runtime: result.runtime } : setup
                ))
              }
            }
          : plugin
      )))
      await refreshLogs()
      setStatus(result.runtime?.status === 'failed' ? 'Setup failed' : 'Setup completed')
    } catch (error) {
      setStatus(messageFromError(error, 'Setup failed'))
      await refreshPlugins()
      await refreshLogs()
    } finally {
      setRunningSetup('')
    }
  }

  const onOpenDashboard = async (pluginId: string, dashboardId: string) => {
    if (pluginId === CREATOR_STUDIO_PLUGIN_ID) {
      const plugin = findPluginById(plugins, pluginId)
      const runtimeStatus = getPluginServiceRuntimeStatus(plugin, CREATOR_STUDIO_SERVICE_ID)
      if (runtimeStatus !== 'running') {
        setStatus('请先启动 Creator Studio Service，再打开 Creator Studio Dashboard')
        return
      }
    }
    const dashboardKey = `${pluginId}:${dashboardId}`
    setOpeningDashboard(dashboardKey)
    setStatus('')
    try {
      const shouldOpenCreatorStudioRun = pluginId === CREATOR_STUDIO_PLUGIN_ID &&
        dashboardId === 'main' &&
        Boolean(creatorStudioLastRunId)
      await api.openPluginDashboard(
        pluginId,
        dashboardId,
        shouldOpenCreatorStudioRun ? { query: { runId: creatorStudioLastRunId } } : undefined
      )
      await refreshLogs()
      setStatus(shouldOpenCreatorStudioRun ? `Dashboard 已打开 · run ${creatorStudioLastRunId}` : 'Dashboard 已打开')
    } catch (error) {
      setStatus(messageFromError(error, 'Dashboard 打开失败'))
      await refreshLogs()
    } finally {
      setOpeningDashboard('')
    }
  }

  const onStartService = async (pluginId: string, serviceId: string) => {
    const serviceKey = `${pluginId}:${serviceId}`
    setChangingService(serviceKey)
    setStatus('')
    try {
      await api.startPluginService(pluginId, serviceId)
      await refreshPlugins()
      await refreshLogs()
      setStatus('Service 已启动')
    } catch (error) {
      setStatus(messageFromError(error, 'Service 启动失败'))
      await refreshPlugins()
      await refreshLogs()
    } finally {
      setChangingService('')
    }
  }

  const onStopService = async (pluginId: string, serviceId: string) => {
    const serviceKey = `${pluginId}:${serviceId}`
    setChangingService(serviceKey)
    setStatus('')
    try {
      await api.stopPluginService(pluginId, serviceId)
      await refreshPlugins()
      await refreshLogs()
      setStatus('Service 已停止')
    } catch (error) {
      setStatus(messageFromError(error, 'Service 停止失败'))
      await refreshPlugins()
      await refreshLogs()
    } finally {
      setChangingService('')
    }
  }

  const onCheckServiceHealth = async (pluginId: string, serviceId: string) => {
    const serviceKey = `${pluginId}:${serviceId}`
    setCheckingServiceHealth(serviceKey)
    setStatus('')
    try {
      const result = await api.checkPluginServiceHealth(pluginId, serviceId)
      await refreshPlugins()
      await refreshLogs()
      setStatus(result.health?.status === 'healthy' ? 'Service health healthy' : 'Service health unhealthy')
    } catch (error) {
      setStatus(messageFromError(error, 'Service health check failed'))
      await refreshPlugins()
      await refreshLogs()
    } finally {
      setCheckingServiceHealth('')
    }
  }

  const onSaveServiceHealthPolicy = async (pluginId: string, serviceId: string, enabled: boolean, intervalMs: number) => {
    const serviceKey = `${pluginId}:${serviceId}`
    setSavingServiceHealthPolicy(serviceKey)
    setStatus('')
    try {
      const updatedPlugin = await api.savePluginServiceHealthPolicy(pluginId, serviceId, { enabled, intervalMs })
      setPlugins((currentPlugins) => currentPlugins.map((plugin) => (
        plugin.id === pluginId ? { ...plugin, ...updatedPlugin } : plugin
      )))
      await refreshLogs()
      setStatus(enabled ? 'Periodic health 已启用' : 'Periodic health 已关闭')
    } catch (error) {
      setStatus(messageFromError(error, 'Periodic health 保存失败'))
      await refreshPlugins()
      await refreshLogs()
    } finally {
      setSavingServiceHealthPolicy('')
    }
  }

  const onExportLogs = async (format: ExportFormat) => {
    setStatus('')
    try {
      const content = await api.exportPluginLogs({ ...filters, format })
      const extension = format === 'csv' ? 'csv' : 'json'
      const type = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8'
      downloadTextFile(`openpet-plugin-logs.${extension}`, content, type)
      setStatus('日志已导出')
    } catch (error) {
      setStatus(messageFromError(error, '日志导出失败'))
    }
  }

  const onClearLogs = async () => {
    setStatus('')
    try {
      setLogs(await api.clearPluginLogs())
    } catch (error) {
      setStatus(messageFromError(error, '日志清空失败'))
    }
  }

  const onClearStorage = async (pluginId: string) => {
    if (!window.confirm(`清理插件 ${pluginId} 的私有存储？`)) return
    setClearingStorage(pluginId)
    setStatus('')
    try {
      const updatedPlugin = await api.clearPluginStorage(pluginId)
      setPlugins(plugins.map((plugin) => (
        plugin.id === pluginId ? { ...plugin, ...updatedPlugin } : plugin
      )))
      await refreshLogs()
      setStatus('插件存储已清理')
    } catch (error) {
      setStatus(messageFromError(error, '插件存储清理失败'))
      await refreshLogs()
    } finally {
      setClearingStorage('')
    }
  }

  const onChangeConfig = (pluginId: string, key: string, value: JsonValue) => {
    setPlugins(plugins.map((plugin) => (
      plugin.id === pluginId
        ? { ...plugin, config: { ...(plugin.config || {}), [key]: value } }
        : plugin
    )))
  }

  const onChangeCommandPayload = (pluginId: string, value: string) => {
    setCommandPayloadDrafts((current) => ({
      ...current,
      [pluginId]: value
    }))
  }

  const paneProps = {
    plugins,
    logs,
    filters,
    status,
    runningCommand,
    creatorStudioPromptDraft,
    runningCreatorStudioDefaultFlow,
    lastCommandResult,
    commandPayloadDrafts,
    runningSetup,
    openingDashboard,
    changingService,
    checkingServiceHealth,
    savingServiceHealthPolicy,
    savingConfig,
    clearingStorage,
    pluginReview,
    inspectingPlugin,
    githubRepositoryUrl,
    inspectingGithubPlugin,
    installingPlugin,
    uninstallingPlugin,
    onToggle,
    onInspectPluginPackage,
    onInspectGithubPluginRepository,
    onClearPluginReview,
    onInstallReviewedPlugin,
    onUninstallPlugin,
    onChangeConfig,
    onChangeCommandPayload,
    onChangeCreatorStudioPromptDraft: setCreatorStudioPromptDraft,
    onChangeGithubRepositoryUrl: setGithubRepositoryUrl,
    onSaveConfig,
    onRun,
    onRunCreatorStudioDefaultFlow,
    onRunSetup,
    onOpenDashboard,
    onStartService,
    onStopService,
    onCheckServiceHealth,
    onSaveServiceHealthPolicy,
    onChangeFilters: setFilters,
    onExportLogs,
    onClearLogs,
    onClearStorage
  } satisfies PluginsPaneProps

  return { loading, paneProps }
}
