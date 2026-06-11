import { useEffect, useState } from 'react'
import { controlCenterAPI as api } from '../api/control-center-api.js'
import { downloadTextFile } from '../lib/download.js'

export function usePluginsPane() {
  const [loading, setLoading] = useState(true)
  const [plugins, setPlugins] = useState([])
  const [logs, setLogs] = useState([])
  const [filters, setFilters] = useState({ pluginId: '', level: '', query: '' })
  const [status, setStatus] = useState('')
  const [runningCommand, setRunningCommand] = useState('')
  const [savingConfig, setSavingConfig] = useState('')
  const [clearingStorage, setClearingStorage] = useState('')
  const [pluginReview, setPluginReview] = useState(null)
  const [inspectingPlugin, setInspectingPlugin] = useState(false)
  const [installingPlugin, setInstallingPlugin] = useState(false)
  const [uninstallingPlugin, setUninstallingPlugin] = useState('')

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
    })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    let mounted = true
    api.getPluginLogs(filters).then((loadedLogs) => {
      if (mounted) setLogs(Array.isArray(loadedLogs) ? loadedLogs : [])
    }).catch((error) => {
      if (mounted) setStatus(error.message || '日志加载失败')
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
      setStatus(error.message || '插件包检查失败')
    } finally {
      setInspectingPlugin(false)
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
      setStatus(error.message || '插件安装失败')
      await refreshPlugins()
    } finally {
      setInstallingPlugin(false)
    }
  }

  const onUninstallPlugin = async (pluginId) => {
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
      setStatus(error.message || '插件卸载失败')
      await refreshPlugins()
    } finally {
      setUninstallingPlugin('')
    }
  }

  const onToggle = async (pluginId, enabled) => {
    setStatus('')
    try {
      const updatedPlugin = await api.setPluginEnabled(pluginId, enabled)
      setPlugins(plugins.map((plugin) => (
        plugin.id === pluginId ? { ...plugin, ...updatedPlugin } : plugin
      )))
      await refreshLogs()
      setStatus(enabled ? '插件已启用' : '插件已停用')
    } catch (error) {
      setStatus(error.message || '插件状态更新失败')
      await refreshLogs()
    }
  }

  const onSaveConfig = async (pluginId) => {
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
      setStatus(error.message || '插件配置保存失败')
      await refreshLogs()
    } finally {
      setSavingConfig('')
    }
  }

  const onRun = async (pluginId, commandId) => {
    const commandKey = `${pluginId}:${commandId}`
    setRunningCommand(commandKey)
    setStatus('')
    try {
      await api.runPluginCommand(pluginId, commandId)
      await refreshLogs()
      setStatus('命令已运行')
    } catch (error) {
      setStatus(error.message || '命令运行失败')
      await refreshLogs()
    } finally {
      setRunningCommand('')
    }
  }

  const onExportLogs = async (format) => {
    setStatus('')
    try {
      const content = await api.exportPluginLogs({ ...filters, format })
      const extension = format === 'csv' ? 'csv' : 'json'
      const type = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8'
      downloadTextFile(`ibot-plugin-logs.${extension}`, content, type)
      setStatus('日志已导出')
    } catch (error) {
      setStatus(error.message || '日志导出失败')
    }
  }

  const onClearLogs = async () => {
    setStatus('')
    try {
      setLogs(await api.clearPluginLogs())
    } catch (error) {
      setStatus(error.message || '日志清空失败')
    }
  }

  const onClearStorage = async (pluginId) => {
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
      setStatus(error.message || '插件存储清理失败')
      await refreshLogs()
    } finally {
      setClearingStorage('')
    }
  }

  const onChangeConfig = (pluginId, key, value) => {
    setPlugins(plugins.map((plugin) => (
      plugin.id === pluginId
        ? { ...plugin, config: { ...(plugin.config || {}), [key]: value } }
        : plugin
    )))
  }

  return {
    loading,
    paneProps: {
      plugins,
      logs,
      filters,
      status,
      runningCommand,
      savingConfig,
      clearingStorage,
      pluginReview,
      inspectingPlugin,
      installingPlugin,
      uninstallingPlugin,
      onToggle,
      onInspectPluginPackage,
      onClearPluginReview,
      onInstallReviewedPlugin,
      onUninstallPlugin,
      onChangeConfig,
      onSaveConfig,
      onRun,
      onChangeFilters: setFilters,
      onExportLogs,
      onClearLogs,
      onClearStorage
    }
  }
}
