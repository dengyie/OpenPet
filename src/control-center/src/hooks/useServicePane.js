import { useEffect, useState } from 'react'
import { controlCenterAPI as api } from '../api/control-center-api.js'
import { cloneServiceLogs, cloneServiceStatus, defaultServiceStatus } from '../lib/defaults.js'
import { downloadTextFile } from '../lib/download.js'

export function useServicePane() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [serviceStatus, setServiceStatus] = useState(defaultServiceStatus)
  const [logs, setLogs] = useState([])
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
      setStatus(error.message || '服务配置保存失败')
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
      setStatus(error.message || '令牌轮换失败')
    } finally {
      setSaving(false)
    }
  }

  const onRefreshLogs = async () => {
    setStatus('')
    try {
      setLogs(cloneServiceLogs(await api.getServiceLogs()))
    } catch (error) {
      setStatus(error.message || '日志加载失败')
    }
  }

  const onExportLogs = async (format) => {
    setStatus('')
    try {
      const content = await api.exportServiceLogs({ format })
      const extension = format === 'csv' ? 'csv' : 'json'
      const type = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8'
      downloadTextFile(`ibot-service-logs.${extension}`, content, type)
      setStatus('访问日志已导出')
    } catch (error) {
      setStatus(error.message || '日志导出失败')
    }
  }

  const onClearLogs = async () => {
    setStatus('')
    try {
      setLogs(cloneServiceLogs(await api.clearServiceLogs()))
    } catch (error) {
      setStatus(error.message || '日志清空失败')
    }
  }

  return {
    loading,
    paneProps: {
      serviceStatus,
      logs,
      status,
      saving,
      onChange: (partial) => {
        setServiceStatus({
          ...serviceStatus,
          config: { ...serviceStatus.config, ...partial }
        })
      },
      onSave,
      onRotateToken,
      onRefreshLogs,
      onExportLogs,
      onClearLogs
    }
  }
}
