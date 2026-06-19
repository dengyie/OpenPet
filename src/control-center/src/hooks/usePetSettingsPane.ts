import { useEffect, useMemo, useRef, useState } from 'react'
import { controlCenterAPI as api } from '../api/control-center-api'
import { cloneSettings, defaultSettings } from '../lib/defaults'
import { messageFromError } from '../lib/errors'
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
  const [manageMode, setManageMode] = useState(false)
  const [editingCursorId, setEditingCursorId] = useState('')
  const [editingCursorName, setEditingCursorName] = useState('')
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
    setManageMode(false)
    setEditingCursorId('')
    setEditingCursorName('')
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

  const onToggleManageMode = () => {
    setManageMode((value) => !value)
    if (editingCursorId) {
      setEditingCursorId('')
      setEditingCursorName('')
    }
  }

  const onStartEditCursor = (cursorId: string) => {
    const target = settings.customCursors.find((cursor) => cursor.id === cursorId)
    if (!target) return
    setManageMode(true)
    setEditingCursorId(cursorId)
    setEditingCursorName(target.name)
  }

  const onCancelEditCursor = () => {
    setEditingCursorId('')
    setEditingCursorName('')
  }

  const onSaveEditedCursor = async (cursorId: string) => {
    const nextName = editingCursorName.trim()
    if (!nextName) {
      setStatus('指针名称不能为空')
      return
    }
    const nextCustomCursors = normalizeCustomCursorRecords(
      settings.customCursors.map((cursor) => (
        cursor.id === cursorId ? { ...cursor, name: nextName } : cursor
      ))
    )
    const nextSettings = applyCursorState(settings, { customCursors: nextCustomCursors })
    setSettings(nextSettings)
    setEditingCursorId('')
    setEditingCursorName('')
    await persistSettings(nextSettings, '指针名称已更新', '指针名称保存失败')
  }

  const onReplaceCustomCursor = async (cursorId: string) => {
    const current = settings.customCursors.find((cursor) => cursor.id === cursorId)
    if (!current) return
    try {
      const result = await api.importCursor()
      if (result.canceled || !result.cursor) return
      const nextCustomCursors = normalizeCustomCursorRecords(
        settings.customCursors.map((cursor) => (
          cursor.id === cursorId
            ? {
                ...result.cursor,
                id: cursor.id,
                name: editingCursorId === cursorId && editingCursorName.trim() ? editingCursorName.trim() : cursor.name,
                createdAt: cursor.createdAt
              }
            : cursor
        ))
      )
      const nextSettings = applyCursorState(settings, { customCursors: nextCustomCursors })
      setSettings(nextSettings)
      await persistSettings(nextSettings, '指针图片已替换', '指针图片替换失败')
    } catch (error) {
      setStatus(messageFromError(error, '指针图片替换失败'))
    }
  }

  const onDeleteCustomCursor = async (cursorId: string) => {
    const target = settings.customCursors.find((cursor) => cursor.id === cursorId)
    if (!target) return
    if (!window.confirm(`确认删除指针「${target.name}」吗？`)) return
    const nextCustomCursors = settings.customCursors.filter((cursor) => cursor.id !== cursorId)
    const nextSettings = applyCursorState(settings, {
      selectedCursorId: settings.selectedCursorId === cursorId ? SYSTEM_CURSOR_ID : settings.selectedCursorId,
      customCursors: nextCustomCursors
    })
    setSettings(nextSettings)
    if (editingCursorId === cursorId) {
      setEditingCursorId('')
      setEditingCursorName('')
    }
    await persistSettings(
      nextSettings,
      settings.selectedCursorId === cursorId ? '指针已删除，并切回系统默认' : '指针已删除',
      '删除自定义指针失败'
    )
  }

  const paneProps = {
    settings,
    originalSettings,
    status,
    saving,
    cursorOptions,
    manageMode,
    editingCursorId,
    editingCursorName,
    onChange,
    onSelectCursor,
    onImportCursor,
    onToggleManageMode,
    onStartEditCursor,
    onChangeEditingCursorName: setEditingCursorName,
    onCancelEditCursor,
    onSaveEditedCursor,
    onReplaceCustomCursor,
    onDeleteCustomCursor,
    onSave,
    onReset
  } satisfies PetPaneProps

  return { loading, paneProps }
}
