import { useCallback, useEffect, useState } from 'react'
import { aboutApi, resolveAboutUpdateJob } from '../features/about/api.ts'
import { useJob } from './useJob.ts'
import { cloneAboutInfo, cloneUpdateCheck, defaultAboutInfo, defaultUpdateCheck } from '../lib/defaults'
import { messageFromError } from '../lib/errors'
import type { AboutInfoViewState, UpdateCheckViewState } from '../../../shared/openpet-contracts'
import type { AboutPaneProps } from '../panes/AboutPane'

export function useAboutPane() {
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [aboutInfo, setAboutInfo] = useState<AboutInfoViewState>(defaultAboutInfo)
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckViewState>(defaultUpdateCheck)
  const [status, setStatus] = useState('')
  const [updateJobId, setUpdateJobId] = useState<string | null>(null)
  const { job: updateJob } = useJob(updateJobId)

  const applyUpdateResult = useCallback((raw: UpdateCheckViewState) => {
    const result = cloneUpdateCheck(raw)
    setUpdateCheck(result)
    if (result.status === 'ok') {
      setStatus(result.updateAvailable ? '发现新版本' : '当前已是最新版本')
    } else {
      setStatus(result.message || '更新检查不可用')
    }
  }, [])

  useEffect(() => {
    let mounted = true
    aboutApi.info().then((info) => {
      if (!mounted) return
      setAboutInfo(cloneAboutInfo(info))
      setLoading(false)
    }).catch((error: unknown) => {
      if (!mounted) return
      setStatus(messageFromError(error, 'About 信息加载失败'))
      setLoading(false)
    })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!checking || !updateJobId || !updateJob || updateJob.jobId !== updateJobId) return
    const resolved = resolveAboutUpdateJob(updateJob)
    if (resolved.kind === 'pending') return
    if (resolved.kind === 'succeeded') applyUpdateResult(resolved.result)
    else setStatus(resolved.message)
    setChecking(false)
    setUpdateJobId(null)
  }, [applyUpdateResult, checking, updateJob, updateJobId])

  const onCheckUpdates = async () => {
    setChecking(true)
    setStatus('')
    setUpdateJobId(null)
    try {
      const started = await aboutApi.checkUpdates()
      if ('result' in started) {
        applyUpdateResult(started.result)
        setChecking(false)
      } else {
        setUpdateJobId(started.jobId)
      }
    } catch (error) {
      setStatus(messageFromError(error, '更新检查失败'))
      setChecking(false)
    }
  }

  const paneProps = {
    aboutInfo,
    updateCheck,
    status,
    checking,
    onCheckUpdates
  } satisfies AboutPaneProps

  return { loading, paneProps }
}
