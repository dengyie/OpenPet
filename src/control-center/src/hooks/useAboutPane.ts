import { useEffect, useState } from 'react'
import { controlCenterAPI as api } from '../api/control-center-api'
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

  useEffect(() => {
    let mounted = true
    api.getAboutInfo().then((info) => {
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

  const onCheckUpdates = async () => {
    setChecking(true)
    setStatus('')
    try {
      const result = cloneUpdateCheck(await api.checkForUpdates())
      setUpdateCheck(result)
      if (result.status === 'ok') {
        setStatus(result.updateAvailable ? '发现新版本' : '当前已是最新版本')
      } else {
        setStatus(result.message || '更新检查不可用')
      }
    } catch (error) {
      setStatus(messageFromError(error, '更新检查失败'))
    } finally {
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
