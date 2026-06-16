import { useEffect, useState } from 'react'
import { controlCenterAPI as api } from '../api/control-center-api'
import { cloneServiceLogs, cloneServiceStatus, defaultServiceStatus } from '../lib/defaults'
import { downloadTextFile } from '../lib/download'
import { messageFromError } from '../lib/errors'
import type {
  LocalHttpConfigViewState,
  ServiceLogEntry,
  ServiceStatusViewState
} from '../../../shared/openpet-contracts'
import type { ServicePaneProps } from '../panes/ServicePane'

type LogExportFormat = 'json' | 'csv'

export function useServicePane() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [serviceStatus, setServiceStatus] = useState<ServiceStatusViewState>(defaultServiceStatus)
  const [logs, setLogs] = useState<ServiceLogEntry[]>([])
  const [status, setStatus] = useState('')

  useEffect(() => {
    let mounted = true
    Promise.all([
      api.getServiceStatus(),
      api.getServiceLogs()
    ]).then(([loadedStatus, loadedLogs]) => {
      if (!mounted) return
      setServiceStatus(cloneServiceStatus(loadedStatus))
      setLogs(cloneServiceLogs(loadedLogs))
      setLoading(false)
    }).catch((error) => {
      if (!mounted) return
      setStatus(messageFromError(error, '本地服务状态加载失败'))
      setLoading(false)
    })
    return () => { mounted = false }
  }, [])

  const onSave = async () => {
    setSaving(true)
    setStatus('')
    try {
      const nextStatus = cloneServiceStatus(await api.saveServiceConfig(serviceStatus.config))
      setServiceStatus(nextStatus)
      setLogs(cloneServiceLogs(await api.getServiceLogs()))
      setStatus(nextStatus.runtime.enabled ? '本地服务已启动' : '本地服务已停止')
    } catch (error) {
      setStatus(messageFromError(error, '服务配置保存失败'))
    } finally {
      setSaving(false)
    }
  }

  const onRotateToken = async () => {
    setSaving(true)
    setStatus('')
    try {
      const nextStatus = cloneServiceStatus(await api.rotateServiceToken())
      setServiceStatus(nextStatus)
      setStatus('访问令牌已轮换')
    } catch (error) {
      setStatus(messageFromError(error, '令牌轮换失败'))
    } finally {
      setSaving(false)
    }
  }

  const onRevokeMcpSessions = async () => {
    setSaving(true)
    setStatus('')
    try {
      const nextStatus = cloneServiceStatus(await api.revokeMcpSessions())
      setServiceStatus(nextStatus)
      setStatus('MCP sessions 已撤销')
    } catch (error) {
      setStatus(messageFromError(error, 'MCP sessions 撤销失败'))
    } finally {
      setSaving(false)
    }
  }

  const onRefreshLogs = async () => {
    setStatus('')
    try {
      setLogs(cloneServiceLogs(await api.getServiceLogs()))
    } catch (error) {
      setStatus(messageFromError(error, '日志加载失败'))
    }
  }

  const onExportLogs = async (format: LogExportFormat) => {
    setStatus('')
    try {
      const content = await api.exportServiceLogs({ format })
      const extension = format === 'csv' ? 'csv' : 'json'
      const type = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8'
      downloadTextFile(`openpet-service-logs.${extension}`, content, type)
      setStatus('访问日志已导出')
    } catch (error) {
      setStatus(messageFromError(error, '日志导出失败'))
    }
  }

  const onClearLogs = async () => {
    setStatus('')
    try {
      setLogs(cloneServiceLogs(await api.clearServiceLogs()))
    } catch (error) {
      setStatus(messageFromError(error, '日志清空失败'))
    }
  }

  const paneProps = {
    serviceStatus,
    logs,
    status,
    saving,
    onChange: (partial: Partial<LocalHttpConfigViewState>) => {
      setServiceStatus({
        ...serviceStatus,
        config: { ...serviceStatus.config, ...partial }
      })
    },
    onSave,
    onRotateToken,
    onRevokeMcpSessions,
    onRefreshLogs,
    onExportLogs,
    onClearLogs
  } satisfies ServicePaneProps

  return { loading, paneProps }
}
