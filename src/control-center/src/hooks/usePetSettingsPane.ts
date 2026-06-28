import { useEffect, useMemo, useRef, useState } from 'react'
import { controlCenterAPI as api } from '../api/control-center-api'
import { cloneSettings, defaultSettings } from '../lib/defaults'
import { messageFromError } from '../lib/errors'
import { shouldRestoreScalePreview } from '../lib/pet-scale-preview.mjs'
import {
  SYSTEM_CURSOR_ID,
  listCursorOptions,
  normalizeCursorSettingsState,
  normalizeCustomCursorCollection
} from '../../../shared/cursor-library.ts'
import type { ControlCenterSettings, CursorOption, CustomCursorRecord } from '../../../shared/openpet-contracts'
import type { PetPaneProps } from '../panes/PetPane'

const normalizeCursorState = (settings: Partial<ControlCenterSettings>) => (
  normalizeCursorSettingsState(settings) as Pick<ControlCenterSettings, 'selectedCursorId' | 'customCursor' | 'customCursors'>
)

const normalizeCustomCursorRecords = (cursors: Partial<CustomCursorRecord>[] | null | undefined) => (
  normalizeCustomCursorCollection(cursors) as CustomCursorRecord[]
)

const applyCursorState = (settings: ControlCenterSettings, partial: Partial<ControlCenterSettings>): ControlCenterSettings => {
  const mergedSettings = {
    ...settings,
    ...partial
  }
  return cloneSettings({
    ...mergedSettings,
    ...normalizeCursorState({
      selectedCursorId: partial.selectedCursorId ?? settings.selectedCursorId,
      customCursors: partial.customCursors ?? settings.customCursors,
      customCursor: partial.customCursor ?? settings.customCursor
    })
  })
}

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
    const restorePreview = () => {
      if (!shouldRestoreScalePreview({
        currentScale: settings.scale,
        originalScale: originalRef.current.scale
      })) return
      api.previewScale(originalRef.current.scale)
    }
    window.addEventListener('beforeunload', restorePreview)
    return () => window.removeEventListener('beforeunload', restorePreview)
  }, [settings.scale])

  const cursorOptions = useMemo<CursorOption[]>(
    () => listCursorOptions(settings.customCursors) as CursorOption[],
    [settings.customCursors]
  )

  const persistSettings = async (nextSettings: ControlCenterSettings, successMessage: string, errorFallback: string) => {
    setSaving(true)
    try {
      const savedSettings = cloneSettings(await api.saveSettings(nextSettings))
      originalRef.current = savedSettings
      setOriginalSettings(savedSettings)
      setSettings(savedSettings)
      if (successMessage) setStatus(successMessage)
    } catch (error) {
      setStatus(messageFromError(error, errorFallback))
    } finally {
      setSaving(false)
    }
  }

  const onChange = (partial: Partial<ControlCenterSettings>, previewScale = false) => {
    const nextSettings = cloneSettings({ ...settings, ...partial })
    setSettings(nextSettings)
    if (status) setStatus('')
    if (previewScale) api.previewScale(nextSettings.scale)
  }

  const onSave = () => persistSettings(settings, '', '宠物设置保存失败')

  const onReset = () => {
    const restoredSettings = cloneSettings(originalRef.current)
    setSettings(restoredSettings)
    setStatus('')
    api.previewScale(restoredSettings.scale)
  }

  const onSelectCursor = async (cursorId: string) => {
    const nextSettings = applyCursorState(settings, { selectedCursorId: cursorId || SYSTEM_CURSOR_ID })
    setSettings(nextSettings)
    await persistSettings(
      nextSettings,
      cursorId === SYSTEM_CURSOR_ID ? '已切换为系统默认指针' : '指针已立即应用到宠物交互区域',
      '鼠标指针设置保存失败'
    )
  }

  const onImportCursor = async () => {
    try {
      const result = await api.importCursor()
      if (result.canceled || !result.cursor) return
      const nextCustomCursors = normalizeCustomCursorRecords([
        ...settings.customCursors.filter((cursor) => cursor.id !== result.cursor?.id),
        result.cursor
      ])
      const nextSettings = applyCursorState(settings, {
        selectedCursorId: result.cursor.id,
        customCursors: nextCustomCursors
      })
      setSettings(nextSettings)
      await persistSettings(
        nextSettings,
        `已添加并启用指针：${result.cursor.name}`,
        '鼠标指针图片保存失败'
      )
    } catch (error) {
      setStatus(messageFromError(error, '鼠标指针图片选择失败'))
    }
  }

  const onRenameCursor = async (cursorId: string, nextName: string) => {
    const normalizedName = nextName.trim()
    if (!normalizedName) {
      setStatus('指针名称不能为空')
      return
    }
    const targetCursor = settings.customCursors.find((cursor) => cursor.id === cursorId)
    if (!targetCursor) {
      setStatus('未找到要编辑的自定义指针')
      return
    }
    const nextCustomCursors = normalizeCustomCursorRecords(settings.customCursors.map((cursor) => (
      cursor.id === cursorId ? { ...cursor, name: normalizedName } : cursor
    )))
    const nextSettings = applyCursorState(settings, { customCursors: nextCustomCursors })
    setSettings(nextSettings)
    await persistSettings(nextSettings, `已更新指针名称：${normalizedName}`, '自定义指针名称保存失败')
  }

  const onDeleteCursor = async (cursorId: string) => {
    const targetCursor = settings.customCursors.find((cursor) => cursor.id === cursorId)
    if (!targetCursor) {
      setStatus('未找到要删除的自定义指针')
      return
    }
    const nextCustomCursors = normalizeCustomCursorRecords(settings.customCursors.filter((cursor) => cursor.id !== cursorId))
    const nextSettings = applyCursorState(settings, {
      selectedCursorId: settings.selectedCursorId === cursorId ? SYSTEM_CURSOR_ID : settings.selectedCursorId,
      customCursors: nextCustomCursors
    })
    setSettings(nextSettings)
    await persistSettings(
      nextSettings,
      settings.selectedCursorId === cursorId ? '已删除当前指针，并切回系统默认' : `已删除指针：${targetCursor.name}`,
      '自定义指针删除失败'
    )
  }

  const paneProps = {
    settings,
    originalSettings,
    status,
    saving,
    cursorOptions,
    onChange,
    onSelectCursor,
    onImportCursor,
    onRenameCursor,
    onDeleteCursor,
    onSave,
    onReset
  } satisfies PetPaneProps

  return { loading, paneProps }
}
