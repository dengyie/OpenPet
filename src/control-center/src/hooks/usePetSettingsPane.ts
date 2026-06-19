import { useEffect, useRef, useState } from 'react'
import { controlCenterAPI as api } from '../api/control-center-api'
import { cloneCustomCursor, cloneSettings, defaultSettings } from '../lib/defaults'
import { messageFromError } from '../lib/errors'
import type { ControlCenterSettings } from '../../../shared/openpet-contracts'
import type { PetPaneProps } from '../panes/PetPane'

export function usePetSettingsPane() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<ControlCenterSettings>(defaultSettings)
  const [originalSettings, setOriginalSettings] = useState<ControlCenterSettings>(defaultSettings)
  const [status, setStatus] = useState('')
  const originalRef = useRef<ControlCenterSettings>(defaultSettings)

  useEffect(() => {
    let mounted = true
    api.getSettings().then((loadedSettings) => {
      if (!mounted) return
      const nextSettings = cloneSettings(loadedSettings)
      originalRef.current = nextSettings
      setSettings(nextSettings)
      setOriginalSettings(nextSettings)
      setLoading(false)
    }).catch((error) => {
      if (!mounted) return
      setStatus(messageFromError(error, '宠物设置加载失败'))
      setLoading(false)
    })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    const restorePreview = () => api.previewScale(originalRef.current.scale)
    window.addEventListener('beforeunload', restorePreview)
    return () => window.removeEventListener('beforeunload', restorePreview)
  }, [])

  const onChange = (partial: Partial<ControlCenterSettings>, previewScale = false) => {
    const nextSettings = { ...settings, ...partial }
    setSettings(nextSettings)
    if (status) setStatus('')
    if (previewScale) api.previewScale(nextSettings.scale)
    if (partial.customCursor) {
      void persistSettings(
        nextSettings,
        partial.customCursor.enabled ? '自定义鼠标指针已启用' : '自定义鼠标指针已关闭',
        '鼠标指针设置保存失败'
      )
    }
  }

  const persistSettings = async (nextSettings: ControlCenterSettings, successMessage: string, errorFallback: string) => {
    setSaving(true)
    try {
      const savedSettings = cloneSettings(await api.saveSettings(nextSettings))
      originalRef.current = savedSettings
      setOriginalSettings(savedSettings)
      setSettings(savedSettings)
      setStatus(successMessage)
    } catch (error) {
      setStatus(messageFromError(error, errorFallback))
    } finally {
      setSaving(false)
    }
  }

  const onSave = () => persistSettings(settings, '', '宠物设置保存失败')

  const onReset = () => {
    const restoredSettings = cloneSettings(originalRef.current)
    setSettings(restoredSettings)
    setStatus('')
    api.previewScale(restoredSettings.scale)
  }

  const onImportCursor = async () => {
    try {
      const result = await api.importCursor()
      if (result.canceled || !result.cursor) return
      const customCursor = cloneCustomCursor(result.cursor)
      const nextSettings = { ...settings, customCursor }
      setSettings(nextSettings)
      await persistSettings(
        nextSettings,
        `已选择并启用鼠标指针：${customCursor.fileName || '自定义图片'}`,
        '鼠标指针图片保存失败'
      )
    } catch (error) {
      setStatus(messageFromError(error, '鼠标指针图片选择失败'))
    }
  }

  const onClearCursor = () => {
    const nextSettings = { ...settings, customCursor: defaultSettings.customCursor }
    setSettings(nextSettings)
    void persistSettings(nextSettings, '自定义鼠标指针已清除', '鼠标指针设置保存失败')
  }

  const paneProps = {
    settings,
    originalSettings,
    status,
    saving,
    onChange,
    onImportCursor,
    onClearCursor,
    onSave,
    onReset
  } satisfies PetPaneProps

  return { loading, paneProps }
}
