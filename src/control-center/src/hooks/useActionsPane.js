import { useEffect, useState } from 'react'
import { controlCenterAPI as api } from '../api/control-center-api.js'
import { cloneActionsConfig, clonePetPacks, defaultActionsConfig, defaultPetPacks } from '../lib/defaults'

export function useActionsPane() {
  const [loading, setLoading] = useState(true)
  const [actionsConfig, setActionsConfig] = useState(defaultActionsConfig)
  const [petPacks, setPetPacks] = useState(defaultPetPacks)
  const [petPackInspection, setPetPackInspection] = useState(null)
  const [selectedActionId, setSelectedActionId] = useState('')
  const [importDraft, setImportDraft] = useState({ actionId: '', label: '' })
  const [importInspection, setImportInspection] = useState(null)
  const [status, setStatus] = useState('')
  const [working, setWorking] = useState(false)

  useEffect(() => {
    let mounted = true
    Promise.all([
      api.getActions(),
      api.listPetPacks()
    ]).then(([loadedActions, loadedPetPacks]) => {
      if (!mounted) return
      setActionsConfig(cloneActionsConfig(loadedActions))
      setPetPacks(clonePetPacks(loadedPetPacks))
      setLoading(false)
    })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (actionsConfig.actions.some((action) => action.id === selectedActionId)) return
    setSelectedActionId(actionsConfig.defaultAction || actionsConfig.actions[0]?.id || '')
  }, [actionsConfig, selectedActionId])

  const onChangeImportDraft = (partial, clearInspection) => {
    setImportDraft({ ...importDraft, ...partial })
    if (status) setStatus('')
    if (clearInspection && importInspection?.selectionId) {
      api.clearActionFrameSelection({ selectionId: importInspection.selectionId }).catch(() => {})
      setImportInspection(null)
    }
  }

  const onSaveConfig = async () => {
    setWorking(true)
    setStatus('')
    try {
      const response = await api.saveActionsConfig({
        defaultAction: actionsConfig.defaultAction,
        clickAction: actionsConfig.clickAction
      })
      setActionsConfig(cloneActionsConfig(response.animations))
      setStatus('动作配置已保存')
    } catch (error) {
      setStatus(error.message || '保存失败')
    } finally {
      setWorking(false)
    }
  }

  const onInspect = async () => {
    setWorking(true)
    setStatus('')
    try {
      const response = await api.inspectActionFrames({ actionId: importDraft.actionId.trim() })
      if (response.canceled) {
        setStatus('已取消选择')
      } else {
        setImportInspection(response)
        setStatus(response.inspection.valid ? '帧文件夹检查通过' : '帧文件夹需要修正')
      }
    } catch (error) {
      setImportInspection(null)
      setStatus(error.message || '检查失败')
    } finally {
      setWorking(false)
    }
  }

  const onReinspect = async () => {
    if (!importInspection?.selectionId) return
    setWorking(true)
    setStatus('')
    try {
      const response = await api.reinspectActionFrames({
        selectionId: importInspection.selectionId,
        actionId: importDraft.actionId.trim()
      })
      setImportInspection(response)
      setStatus(response.inspection.valid ? '帧文件夹检查通过' : '帧文件夹需要修正')
    } catch (error) {
      setImportInspection(null)
      setStatus(error.message || '重新检查失败')
    } finally {
      setWorking(false)
    }
  }

  const onClearInspection = async () => {
    const selectionId = importInspection?.selectionId
    setImportInspection(null)
    setStatus('已清除选择')
    if (!selectionId) return
    try {
      await api.clearActionFrameSelection({ selectionId })
    } catch (_) {}
  }

  const onImport = async () => {
    setWorking(true)
    setStatus('')
    try {
      const response = await api.importActionFrames({
        selectionId: importInspection?.selectionId,
        actionId: importDraft.actionId.trim(),
        label: importDraft.label
      })
      if (response.ok === false) {
        setImportInspection(response.inspectionResult)
        setStatus('帧文件夹需要修正')
      } else if (response.canceled) {
        setStatus('已取消导入')
      } else {
        setActionsConfig(cloneActionsConfig(response.animations))
        if (response.result.importedAction?.id) setSelectedActionId(response.result.importedAction.id)
        setImportInspection(null)
        setStatus(`已导入 ${response.result.importedAction?.label || importDraft.actionId}`)
      }
    } catch (error) {
      setStatus(error.message || '导入失败')
    } finally {
      setWorking(false)
    }
  }

  const onDelete = async (actionId) => {
    if (!window.confirm(`删除动作 ${actionId}？`)) return
    setWorking(true)
    setStatus('')
    try {
      const response = await api.deleteAction(actionId)
      setActionsConfig(cloneActionsConfig(response.animations))
      setStatus(`已删除 ${actionId}`)
    } catch (error) {
      setStatus(error.message || '删除失败')
    } finally {
      setWorking(false)
    }
  }

  const onInspectPetPack = async () => {
    setWorking(true)
    setStatus('')
    try {
      const response = await api.inspectPetPackDirectory()
      if (response.canceled) {
        setStatus('已取消选择')
      } else {
        setPetPackInspection(response)
        setStatus(response.valid ? 'Pet pack 检查通过' : 'Pet pack 需要修正')
      }
    } catch (error) {
      setPetPackInspection(null)
      setStatus(error.message || 'Pet pack 检查失败')
    } finally {
      setWorking(false)
    }
  }

  const onClearPetPackInspection = async () => {
    const selectionId = petPackInspection?.selectionId
    setPetPackInspection(null)
    setStatus('已清除 Pet pack 选择')
    if (!selectionId) return
    try {
      await api.clearPetPackSelection(selectionId)
    } catch (_) {}
  }

  const onImportPetPack = async () => {
    if (!petPackInspection?.selectionId) return
    setWorking(true)
    setStatus('')
    try {
      const response = await api.importPetPack(petPackInspection.selectionId)
      setPetPacks(clonePetPacks(response.petPacks))
      setPetPackInspection(null)
      setStatus(`已导入 ${response.pack?.displayName || response.pack?.id || 'Pet pack'}`)
    } catch (error) {
      setStatus(error.message || 'Pet pack 导入失败')
    } finally {
      setWorking(false)
    }
  }

  const onSetActivePetPack = async (packId) => {
    setWorking(true)
    setStatus('')
    try {
      const response = await api.setActivePetPack(packId)
      setPetPacks(clonePetPacks(response.petPacks))
      setActionsConfig(cloneActionsConfig(response.animations))
      setStatus(`已启用 ${response.pack?.displayName || packId}`)
    } catch (error) {
      setStatus(error.message || 'Pet pack 启用失败')
    } finally {
      setWorking(false)
    }
  }

  const onRemovePetPack = async (packId) => {
    if (!window.confirm(`删除 Pet pack ${packId}？`)) return
    setWorking(true)
    setStatus('')
    try {
      const response = await api.removePetPack(packId)
      setPetPacks(clonePetPacks(response.petPacks))
      setStatus(`已删除 ${packId}`)
    } catch (error) {
      setStatus(error.message || 'Pet pack 删除失败')
    } finally {
      setWorking(false)
    }
  }

  return {
    loading,
    paneProps: {
      actionsConfig,
      petPacks,
      selectedActionId,
      importDraft,
      importInspection,
      petPackInspection,
      status,
      working,
      onSelectAction: setSelectedActionId,
      onChangeImportDraft,
      onChangeConfig: (partial) => setActionsConfig({ ...actionsConfig, ...partial }),
      onSaveConfig,
      onInspect,
      onReinspect,
      onClearInspection,
      onImport,
      onDelete,
      onInspectPetPack,
      onClearPetPackInspection,
      onImportPetPack,
      onSetActivePetPack,
      onRemovePetPack
    }
  }
}
