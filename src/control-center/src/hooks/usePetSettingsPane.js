import { useEffect, useRef, useState } from 'react'
import { controlCenterAPI as api } from '../api/control-center-api.js'
import { cloneSettings, defaultSettings } from '../lib/defaults.js'

export function usePetSettingsPane() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState(defaultSettings)
  const [originalSettings, setOriginalSettings] = useState(defaultSettings)
  const originalRef = useRef(defaultSettings)

  useEffect(() => {
    let mounted = true
    api.getSettings().then((loadedSettings) => {
      if (!mounted) return
      const nextSettings = cloneSettings(loadedSettings)
      originalRef.current = nextSettings
      setSettings(nextSettings)
      setOriginalSettings(nextSettings)
      setLoading(false)
    })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    const restorePreview = () => api.previewScale(originalRef.current.scale)
    window.addEventListener('beforeunload', restorePreview)
    return () => window.removeEventListener('beforeunload', restorePreview)
  }, [])

  const onChange = (partial, previewScale) => {
    const nextSettings = { ...settings, ...partial }
    setSettings(nextSettings)
    if (previewScale) api.previewScale(nextSettings.scale)
  }

  const onSave = async () => {
    setSaving(true)
    try {
      const savedSettings = cloneSettings(await api.saveSettings(settings))
      originalRef.current = savedSettings
      setOriginalSettings(savedSettings)
      setSettings(savedSettings)
    } finally {
      setSaving(false)
    }
  }

  const onReset = () => {
    const restoredSettings = cloneSettings(originalRef.current)
    setSettings(restoredSettings)
    api.previewScale(restoredSettings.scale)
  }

  return {
    loading,
    paneProps: {
      settings,
      originalSettings,
      saving,
      onChange,
      onSave,
      onReset
    }
  }
}
