import { useEffect, useMemo, useRef, useState } from 'react'
import { controlCenterAPI as api } from '../api/control-center-api'
import { cloneSettings, defaultSettings } from '../lib/defaults'
import { messageFromError } from '../lib/errors'
import { shouldRestoreScalePreview } from '../lib/pet-scale-preview.mjs'
import {
  CUSTOM_CURSOR_MAX_SIZE_PERCENT,
  CUSTOM_CURSOR_MIN_SIZE_PERCENT,
  SYSTEM_CURSOR_ID,
  createPersistedCursorRecord,
  createDefaultRuntimeCursor,
  getBuiltinCursorById,
  listCursorOptions,
  normalizeCustomCursorScope,
  normalizeCursorSettingsState,
  normalizeCustomCursorCollection,
  resizeCustomCursorRecord
} from '../../../shared/cursor-library.ts'
import type { ControlCenterSettings, CursorOption, CustomCursorRecord } from '../../../shared/openpet-contracts'
import type { PetPaneProps } from '../panes/PetPane'

const normalizeCursorState = (settings: Partial<ControlCenterSettings>) => (
  normalizeCursorSettingsState(settings) as Pick<ControlCenterSettings, 'selectedCursorId' | 'customCursor' | 'customCursors' | 'hiddenCursorIds' | 'customCursorScope'>
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
      customCursor: partial.customCursor ?? settings.customCursor,
      hiddenCursorIds: partial.hiddenCursorIds ?? settings.hiddenCursorIds,
      customCursorScope: partial.customCursorScope ?? settings.customCursorScope
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

  useEffect(() => api.onSettingsChanged((nextSettings) => {
    const normalized = cloneSettings(nextSettings)
    const previousScope = originalRef.current.customCursorScope
    originalRef.current = normalized
    setOriginalSettings(normalized)
    setSettings(normalized)
    if (previousScope === 'system' && normalized.customCursorScope === 'openpet') {
      setStatus('全电脑指针已停止，已恢复为仅 OpenPet')
    }
  }), [])

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
    () => listCursorOptions(settings.customCursors, settings.hiddenCursorIds) as CursorOption[],
    [settings.customCursors, settings.hiddenCursorIds]
  )

  const persistSettings = async (nextSettings: ControlCenterSettings, successMessage: string, errorFallback: string) => {
    setSaving(true)
    try {
      const savedSettings = cloneSettings(await api.saveSettings(nextSettings))
      originalRef.current = savedSettings
      setOriginalSettings(savedSettings)
      setSettings(savedSettings)
      if (successMessage) setStatus(successMessage)
      return savedSettings
    } catch (error) {
      setStatus(messageFromError(error, errorFallback))
      return null
    } finally {
      setSaving(false)
    }
  }

  const onChange = (partial: Partial<ControlCenterSettings>, previewScale = false) => {
    const nextSettings = applyCursorState(settings, {
      ...partial,
      customCursorScope: partial.customCursorScope === undefined
        ? settings.customCursorScope
        : normalizeCustomCursorScope(partial.customCursorScope)
    })
    setSettings(nextSettings)
    if (status) setStatus('')
    if (previewScale) api.previewScale(nextSettings.scale)
  }

  const onChangeCursorScope = async (scope: ControlCenterSettings['customCursorScope']) => {
    const nextScope = normalizeCustomCursorScope(scope)
    if (nextScope === 'system' && !settings.systemCursorStatus.supported) {
      setStatus('当前平台暂不支持全电脑指针，请继续使用仅 OpenPet')
      return
    }
    if (nextScope === 'system' && !settings.customCursor.enabled) {
      setStatus('请先选择一个自定义指针，再应用到整个电脑')
      return
    }
    const previousSettings = settings
    const nextSettings = applyCursorState(settings, { customCursorScope: nextScope })
    setSettings(nextSettings)
    const savedSettings = await persistSettings(
      nextSettings,
      nextScope === 'system' ? '已将自定义指针应用到整个电脑' : '已设置为仅 OpenPet 使用自定义指针',
      '指针作用范围保存失败'
    )
    if (!savedSettings) setSettings(previousSettings)
  }

  const onSave = async () => {
    await persistSettings(settings, '', '宠物设置保存失败')
  }

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
      cursorId === SYSTEM_CURSOR_ID
        ? '已切换为系统默认指针'
        : nextSettings.customCursorScope === 'system'
          ? '指针已立即应用到整个电脑'
          : '指针已立即应用到宠物交互区域',
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

  const onResizeCursor = async (cursorId: string, sizePercent: number) => {
    const targetCursor = settings.customCursors.find((cursor) => cursor.id === cursorId)
      || createPersistedCursorRecord(getBuiltinCursorById(cursorId))
    if (!targetCursor) {
      setStatus('未找到要调整的指针')
      return
    }
    const nextCursor = resizeCustomCursorRecord(targetCursor, sizePercent)
    if (!nextCursor) {
      setStatus('指针尺寸调整失败')
      return
    }
    if (nextCursor.sizePercent === targetCursor.sizePercent) return
    const nextCustomCursors = normalizeCustomCursorRecords([
      ...settings.customCursors.filter((cursor) => cursor.id !== cursorId),
      nextCursor
    ])
    const nextSettings = applyCursorState(settings, { customCursors: nextCustomCursors })
    setSettings(nextSettings)
    await persistSettings(
      nextSettings,
      `已将 ${targetCursor.name} 调整为 ${Math.min(CUSTOM_CURSOR_MAX_SIZE_PERCENT, Math.max(CUSTOM_CURSOR_MIN_SIZE_PERCENT, sizePercent))}%`,
      '指针尺寸保存失败'
    )
  }

  const onDeleteCursor = async (cursorId: string) => {
    const targetCursor = cursorOptions.find((cursor) => cursor.id === cursorId)
    if (!targetCursor || targetCursor.source !== 'uploaded' || targetCursor.canDelete !== true) {
      setStatus('未找到要删除的指针')
      return
    }
    if (!window.confirm(`确认删除指针“${targetCursor.name}”？\n\n删除后会从指针列表移除；如果它正在使用中，将自动切回系统默认。`)) {
      return
    }

    const deletingSelectedCursor = settings.selectedCursorId === cursorId
    const nextSettings = applyCursorState(settings, {
      selectedCursorId: deletingSelectedCursor ? SYSTEM_CURSOR_ID : settings.selectedCursorId,
      customCursor: createDefaultRuntimeCursor(),
      customCursors: normalizeCustomCursorRecords(
        settings.customCursors.filter((cursor) => cursor.id !== cursorId)
      )
    })
    setSettings(nextSettings)
    await persistSettings(
      nextSettings,
      deletingSelectedCursor
        ? `已删除指针：${targetCursor.name}，并切换为系统默认`
        : `已删除指针：${targetCursor.name}`,
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
    onChangeCursorScope,
    onSelectCursor,
    onImportCursor,
    onResizeCursor,
    onDeleteCursor,
    onSave,
    onReset
  } satisfies PetPaneProps

  return { loading, paneProps }
}
