import { useEffect, useState } from 'react'
import { controlCenterAPI as api } from '../api/control-center-api'
import { cloneServiceLogs, cloneServiceStatus, defaultServiceStatus } from '../lib/defaults'
import { downloadTextFile } from '../lib/download'
import { messageFromError } from '../lib/errors'
import type {
  LocalHttpConfigViewState,
  PaginatedLogsViewState,
  ServiceLogEntry,
  ServiceStatusViewState
} from '../../../shared/openpet-contracts'
import type { ServicePaneProps } from '../panes/ServicePane'

type LogExportFormat = 'json' | 'csv'
const SERVICE_LOG_PAGE_SIZE = 50

export function useServicePane() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [serviceStatus, setServiceStatus] = useState<ServiceStatusViewState>(defaultServiceStatus)
  const [logs, setLogs] = useState<ServiceLogEntry[]>([])
  const [logsPage, setLogsPage] = useState<PaginatedLogsViewState<ServiceLogEntry>>({
    entries: [],
    page: 1,
    pageSize: SERVICE_LOG_PAGE_SIZE,
    total: 0,
    totalPages: 1
  })
  const [status, setStatus] = useState('')

  const loadLogsPage = async (page = 1) => {
    const nextPage = await api.getServiceLogs({ page, pageSize: SERVICE_LOG_PAGE_SIZE })
    setLogsPage(nextPage)
    setLogs(cloneServiceLogs(nextPage.entries))
    return nextPage
  }

  useEffect(() => {
    let mounted = true
    Promise.all([
      api.getServiceStatus(),
      api.getServiceLogs({ page: 1, pageSize: SERVICE_LOG_PAGE_SIZE })
    ]).then(([loadedStatus, loadedLogs]) => {
      if (!mounted) return
      setServiceStatus(cloneServiceStatus(loadedStatus))
      setLogsPage(loadedLogs)
      setLogs(cloneServiceLogs(loadedLogs.entries))
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
      await loadLogsPage(logsPage.page)
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
      await loadLogsPage(logsPage.page)
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
      await api.clearServiceLogs()
      await loadLogsPage(1)
    } catch (error) {
      setStatus(messageFromError(error, '日志清空失败'))
    }
  }

  const paneProps = {
    serviceStatus,
    logs,
    logsPage,
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
    onPrevLogsPage: logsPage.page > 1 ? async () => { await loadLogsPage(logsPage.page - 1) } : undefined,
    onNextLogsPage: logsPage.page < logsPage.totalPages ? async () => { await loadLogsPage(logsPage.page + 1) } : undefined,
    onExportLogs,
    onClearLogs
  } satisfies ServicePaneProps

  return { loading, paneProps }
}
