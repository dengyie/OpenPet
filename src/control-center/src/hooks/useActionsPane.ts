import { useEffect, useState } from 'react'
import { controlCenterAPI as api } from '../api/control-center-api'
import { cloneActionsConfig, clonePetPacks, defaultActionsConfig, defaultPetPacks } from '../lib/defaults'
import { messageFromError } from '../lib/errors'
import type {
  ActionTriggerProposalAcceptanceResult,
  ActionTriggerProposalType,
  ActionsConfigViewState,
  CompletedActionFrameInspectionResult,
  PetPackInspectionResult,
  PetPacksViewState
} from '../../../shared/openpet-contracts'
import type { ActionImportDraft, ActionsPaneProps } from '../panes/ActionsPane'

export function useActionsPane() {
  const [loading, setLoading] = useState(true)
  const [actionsConfig, setActionsConfig] = useState<ActionsConfigViewState>(defaultActionsConfig)
  const [petPacks, setPetPacks] = useState<PetPacksViewState>(defaultPetPacks)
  const [petPackInspection, setPetPackInspection] = useState<PetPackInspectionResult | null>(null)
  const [selectedActionId, setSelectedActionId] = useState('')
  const [importDraft, setImportDraft] = useState<ActionImportDraft>({ actionId: '', label: '' })
  const [importInspection, setImportInspection] = useState<CompletedActionFrameInspectionResult | null>(null)
  const [triggerProposalType, setTriggerProposalType] = useState<ActionTriggerProposalType>('click')
  const [triggerProposalNotes, setTriggerProposalNotes] = useState('')
  const [lastTriggerProposalResult, setLastTriggerProposalResult] = useState<ActionTriggerProposalAcceptanceResult | null>(null)
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
    }).catch((error) => {
      if (!mounted) return
      setStatus(messageFromError(error, '动作与 Pet pack 加载失败'))
      setLoading(false)
    })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (actionsConfig.actions.some((action) => action.id === selectedActionId)) return
    setSelectedActionId(actionsConfig.defaultAction || actionsConfig.actions[0]?.id || '')
  }, [actionsConfig, selectedActionId])

  const onChangeImportDraft = (partial: Partial<ActionImportDraft>, clearInspection = false) => {
    setImportDraft({ ...importDraft, ...partial })
    if (status) setStatus('')
    if (clearInspection && importInspection?.selectionId) {
      api.clearActionFrameSelection({ selectionId: importInspection.selectionId }).catch(() => {})
      setImportInspection(null)
    }
  }

  const onSelectAction = (actionId: string) => {
    setSelectedActionId(actionId)
    setLastTriggerProposalResult(null)
  }

  const onChangeTriggerProposalType = (value: ActionTriggerProposalType) => {
    setTriggerProposalType(value)
    setLastTriggerProposalResult(null)
  }

  const onChangeTriggerProposalNotes = (value: string) => {
    setTriggerProposalNotes(value)
    setLastTriggerProposalResult(null)
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
      setStatus(messageFromError(error, '保存失败'))
    } finally {
      setWorking(false)
    }
  }

  const onApplyTriggerProposal = async () => {
    const actionId = selectedActionId || actionsConfig.defaultAction || actionsConfig.actions[0]?.id || ''
    if (!actionId) {
      setStatus('请先选择一个动作')
      return
    }
    setWorking(true)
    setStatus('')
    setLastTriggerProposalResult(null)
    try {
      const response = await api.saveActionsConfig({
        triggerProposal: {
          actionId,
          type: triggerProposalType,
          binding: triggerProposalType === 'click' ? 'clickAction' : undefined,
          notes: triggerProposalNotes.trim() || undefined
        }
      })
      setActionsConfig(cloneActionsConfig(response.animations))
      const triggerProposal = response.triggerProposal
      setLastTriggerProposalResult(triggerProposal || null)
      setStatus(triggerProposal
        ? `${triggerProposal.applied ? '已应用' : '已确认'} 触发建议：${triggerProposal.message}`
        : '触发建议已保存')
    } catch (error) {
      setStatus(messageFromError(error, '应用触发建议失败'))
    } finally {
      setWorking(false)
    }
  }

  const onAcceptTriggerProposal = async (proposalId: string) => {
    if (!proposalId) return
    setWorking(true)
    setStatus('')
    setLastTriggerProposalResult(null)
    try {
      const response = await api.acceptActionTriggerProposal(proposalId)
      setActionsConfig(cloneActionsConfig(response.animations))
      setLastTriggerProposalResult(response.triggerProposal || null)
      const proposal = response.proposal
      const actionLabel = proposal?.actionId || proposalId
      const outcome = proposal?.status === 'applied'
        ? '已应用'
        : (proposal?.status === 'pending-host-rule' ? '已标记待规则' : '已接受')
      setStatus(`${outcome}触发提案：${actionLabel}`)
    } catch (error) {
      setStatus(messageFromError(error, '接受触发提案失败'))
    } finally {
      setWorking(false)
    }
  }

  const onRejectTriggerProposal = async (proposalId: string) => {
    if (!proposalId) return
    const reason = window.prompt('拒绝原因（可选）', '') || ''
    setWorking(true)
    setStatus('')
    try {
      const response = await api.rejectActionTriggerProposal(proposalId, reason.trim())
      setActionsConfig(cloneActionsConfig(response.animations))
      setStatus(`已拒绝触发提案：${response.proposal?.actionId || proposalId}`)
    } catch (error) {
      setStatus(messageFromError(error, '拒绝触发提案失败'))
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
      setStatus(messageFromError(error, '检查失败'))
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
      if (response.canceled) {
        setImportInspection(null)
        setStatus('已取消选择')
        return
      }
      setImportInspection(response)
      setStatus(response.inspection.valid ? '帧文件夹检查通过' : '帧文件夹需要修正')
    } catch (error) {
      setImportInspection(null)
      setStatus(messageFromError(error, '重新检查失败'))
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
        setImportInspection(response.inspectionResult && !response.inspectionResult.canceled ? response.inspectionResult : null)
        setStatus('帧文件夹需要修正')
      } else if (response.canceled) {
        setStatus('已取消导入')
      } else if (response.animations && response.result) {
        setActionsConfig(cloneActionsConfig(response.animations))
        if (response.result.importedAction?.id) setSelectedActionId(response.result.importedAction.id)
        setImportInspection(null)
        setStatus(`已导入 ${response.result.importedAction?.label || importDraft.actionId}`)
      } else {
        setStatus('导入返回结果不完整')
      }
    } catch (error) {
      setStatus(messageFromError(error, '导入失败'))
    } finally {
      setWorking(false)
    }
  }

  const onDelete = async (actionId: string) => {
    if (!window.confirm(`删除动作 ${actionId}？`)) return
    setWorking(true)
    setStatus('')
    try {
      const response = await api.deleteAction(actionId)
      setActionsConfig(cloneActionsConfig(response.animations))
      setStatus(`已删除 ${actionId}`)
    } catch (error) {
      setStatus(messageFromError(error, '删除失败'))
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
      setStatus(messageFromError(error, 'Pet pack 检查失败'))
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
      setStatus(messageFromError(error, 'Pet pack 导入失败'))
    } finally {
      setWorking(false)
    }
  }

  const onExportPetPack = async (packId: string) => {
    setWorking(true)
    setStatus('')
    try {
      const response = await api.exportPetPack(packId)
      if (response.canceled) {
        setStatus('已取消导出')
      } else {
        setStatus(`已导出 ${response.fileName || packId}`)
      }
    } catch (error) {
      setStatus(messageFromError(error, 'Pet pack 导出失败'))
    } finally {
      setWorking(false)
    }
  }

  const onSetActivePetPack = async (packId: string) => {
    setWorking(true)
    setStatus('')
    try {
      const response = await api.setActivePetPack(packId)
      setPetPacks(clonePetPacks(response.petPacks))
      setActionsConfig(cloneActionsConfig(response.animations))
      setStatus(`已启用 ${response.pack?.displayName || packId}`)
    } catch (error) {
      setStatus(messageFromError(error, 'Pet pack 启用失败'))
    } finally {
      setWorking(false)
    }
  }

  const onRemovePetPack = async (packId: string) => {
    if (!window.confirm(`删除 Pet pack ${packId}？`)) return
    setWorking(true)
    setStatus('')
    try {
      const response = await api.removePetPack(packId)
      setPetPacks(clonePetPacks(response.petPacks))
      setStatus(`已删除 ${packId}`)
    } catch (error) {
      setStatus(messageFromError(error, 'Pet pack 删除失败'))
    } finally {
      setWorking(false)
    }
  }

  const paneProps = {
    actionsConfig,
    petPacks,
    selectedActionId,
    importDraft,
    importInspection,
    petPackInspection,
    status,
    working,
    onSelectAction,
    onChangeImportDraft,
    onChangeConfig: (partial: Partial<ActionsConfigViewState>) => setActionsConfig({ ...actionsConfig, ...partial }),
    onSaveConfig,
    onInspect,
    onReinspect,
    onClearInspection,
    onImport,
    onDelete,
    onInspectPetPack,
    onClearPetPackInspection,
    onImportPetPack,
    onExportPetPack,
    onSetActivePetPack,
    onRemovePetPack,
    onApplyTriggerProposal,
    onAcceptTriggerProposal,
    onRejectTriggerProposal,
    triggerProposalType,
    setTriggerProposalType: onChangeTriggerProposalType,
    triggerProposalNotes,
    setTriggerProposalNotes: onChangeTriggerProposalNotes,
    lastTriggerProposalResult
  } satisfies ActionsPaneProps

  return { loading, paneProps }
}
