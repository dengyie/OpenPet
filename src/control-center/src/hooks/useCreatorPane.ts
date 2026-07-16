import { useEffect, useRef, useState } from 'react'
import { controlCenterAPI as api } from '../api/control-center-api'
import { cloneCreatorState, defaultCreatorState } from '../lib/defaults'
import { messageFromError } from '../lib/errors'
import type {
  CreatorStateViewState,
  CreatorWorkflowResult
} from '../../../shared/openpet-contracts'
import type { CreatorPaneProps, CreatorPaneMode } from '../panes/CreatorPane'

interface SelectedReferenceDraft {
  referenceImageToken: string
  referenceFileName: string
}

interface NewCharacterDraft extends SelectedReferenceDraft {
  characterName: string
  stylePrompt: string
}

interface ExistingActionDraft extends SelectedReferenceDraft {
  actionName: string
  motionPrompt: string
}

const createEmptyNewCharacterDraft = (): NewCharacterDraft => ({
  characterName: '',
  stylePrompt: '',
  referenceImageToken: '',
  referenceFileName: ''
})

const createEmptyExistingActionDraft = (): ExistingActionDraft => ({
  actionName: '',
  motionPrompt: '',
  referenceImageToken: '',
  referenceFileName: ''
})

const createInFlightResult = (mode: CreatorPaneMode): CreatorWorkflowResult => ({
  ok: true,
  state: 'generating',
  code: 'generating',
  message: mode === 'new-character' ? '正在生成角色，请稍候' : '正在生成动作，请稍候',
  run: {
    state: 'generating',
    mode: mode === 'new-character' ? 'full-pet' : 'single-action',
    runId: '',
    commandId: '',
    message: mode === 'new-character' ? '正在生成角色，请稍候' : '正在生成动作，请稍候',
    importedActionId: '',
    importedPackId: '',
    activatedPackId: ''
  },
  reference: null,
  activePet: null,
  importedAction: null,
  clickAction: '',
  clickActionChange: null,
  basicActions: null,
  diagnostics: null
})

const resolvePreviewActionId = (result: CreatorWorkflowResult | null): string => {
  if (!result || result.state !== 'completed') return ''
  return String(
    result.clickAction ||
    result.importedAction?.actionId ||
    result.activePet?.clickAction ||
    result.activePet?.defaultAction ||
    ''
  ).trim()
}

export function useCreatorPane(active: boolean) {
  const [loading, setLoading] = useState(false)
  const [creatorState, setCreatorState] = useState<CreatorStateViewState>(defaultCreatorState)
  const [mode, setMode] = useState<CreatorPaneMode>('new-character')
  const [newCharacterDraft, setNewCharacterDraft] = useState<NewCharacterDraft>(createEmptyNewCharacterDraft())
  const [existingActionDraft, setExistingActionDraft] = useState<ExistingActionDraft>(createEmptyExistingActionDraft())
  const [status, setStatus] = useState('')
  const [running, setRunning] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [openingDashboard, setOpeningDashboard] = useState(false)
  const [result, setResult] = useState<CreatorWorkflowResult | null>(null)
  const hasLoadedRef = useRef(false)

  const refreshCreatorState = async () => {
    const nextState = cloneCreatorState(await api.getCreatorState())
    setCreatorState(nextState)
    return nextState
  }

  useEffect(() => {
    if (!active && hasLoadedRef.current) return undefined
    if (!active) return undefined
    let mounted = true
    setLoading(true)
    refreshCreatorState().catch((error) => {
      if (mounted) setStatus(messageFromError(error, '创建面板加载失败'))
    }).then(() => {
      if (mounted) hasLoadedRef.current = true
    }).finally(() => {
      if (mounted) setLoading(false)
    })
    return () => { mounted = false }
  }, [active])

  const syncAfterWorkflow = async (nextResult: CreatorWorkflowResult) => {
    setResult(nextResult)
    setStatus(nextResult.message || '')
    setCreatorState((current) => cloneCreatorState({
      ...current,
      lastRun: nextResult.run || current.lastRun
    }))
    try {
      await refreshCreatorState()
    } catch (error) {
      setStatus(nextResult.message || messageFromError(error, '创建状态刷新失败'))
    }
  }

  const onGenerateNewCharacter = async () => {
    if (running) return
    setRunning(true)
    setStatus('')
    setResult(createInFlightResult('new-character'))
    try {
      const nextResult = await api.generateCreatorNewCharacter({
        characterName: newCharacterDraft.characterName,
        stylePrompt: newCharacterDraft.stylePrompt,
        referenceImageToken: newCharacterDraft.referenceImageToken
      })
      await syncAfterWorkflow(nextResult)
    } catch (error) {
      setResult(null)
      setStatus(messageFromError(error, '角色生成失败'))
    } finally {
      setRunning(false)
    }
  }

  const onGenerateExistingAction = async () => {
    if (running) return
    setRunning(true)
    setStatus('')
    setResult(createInFlightResult('existing-character'))
    try {
      const nextResult = await api.generateCreatorExistingAction({
        actionName: existingActionDraft.actionName,
        motionPrompt: existingActionDraft.motionPrompt,
        referenceImageToken: existingActionDraft.referenceImageToken || undefined
      })
      await syncAfterWorkflow(nextResult)
    } catch (error) {
      setResult(null)
      setStatus(messageFromError(error, '动作生成失败'))
    } finally {
      setRunning(false)
    }
  }

  const onOpenCreatorStudioDetails = async () => {
    const dashboard = creatorState.dashboard
    const runId = result?.run?.runId || creatorState.lastRun?.runId || ''
    if (!dashboard.available) {
      setStatus(dashboard.reason || 'Creator Studio 不可用')
      return
    }
    setOpeningDashboard(true)
    try {
      await api.openPluginDashboard(
        dashboard.pluginId,
        dashboard.dashboardId,
        runId ? { query: { runId } } : undefined
      )
      setStatus(runId ? `已打开 Creator Studio · run ${runId}` : '已打开 Creator Studio')
    } catch (error) {
      setStatus(messageFromError(error, 'Creator Studio 打开失败'))
    } finally {
      setOpeningDashboard(false)
    }
  }

  const onPreviewResult = async () => {
    const actionId = resolvePreviewActionId(result)
    if (!actionId || previewing) return
    setPreviewing(true)
    try {
      await api.playPetAction(actionId)
      setStatus(`已预览动作 ${actionId}`)
    } catch (error) {
      setStatus(messageFromError(error, '动作预览失败'))
    } finally {
      setPreviewing(false)
    }
  }

  const onRestoreClickAction = async () => {
    const previousActionId = String(result?.clickActionChange?.previousActionId || '').trim()
    if (!previousActionId || previewing) return
    setPreviewing(true)
    try {
      await api.saveActionsConfig({ clickAction: previousActionId })
      setResult((current) => current
        ? {
            ...current,
            clickAction: previousActionId,
            clickActionChange: current.clickActionChange
              ? {
                  ...current.clickActionChange,
                  currentActionId: previousActionId,
                  canRestore: false
                }
              : null
          }
        : current)
      await refreshCreatorState()
      setStatus(`已恢复 clickAction 为 ${previousActionId}`)
    } catch (error) {
      setStatus(messageFromError(error, 'clickAction 恢复失败'))
    } finally {
      setPreviewing(false)
    }
  }

  const onRetryFullPetAction = async (actionId: string) => {
    const runId = String(result?.run?.runId || creatorState.lastRun?.runId || '').trim()
    if (!runId || !actionId || running) return
    setRunning(true)
    setStatus('')
    try {
      const nextResult = await api.retryCreatorAction({ runId, actionId })
      await syncAfterWorkflow(nextResult)
    } catch (error) {
      setStatus(messageFromError(error, `动作 ${actionId} 修复失败`))
    } finally {
      setRunning(false)
    }
  }

  const onRetryFullPetIdentity = async () => {
    const runId = String(result?.run?.runId || creatorState.lastRun?.runId || '').trim()
    if (!runId || running) return
    setRunning(true)
    setStatus('')
    try {
      const nextResult = await api.retryCreatorIdentity({ runId })
      await syncAfterWorkflow(nextResult)
    } catch (error) {
      setStatus(messageFromError(error, 'Canonical identity 修复失败'))
    } finally {
      setRunning(false)
    }
  }

  const hasStoredEditableReference = Boolean(creatorState.editableReference)
  const creatorStudioPluginReady = creatorState.dashboard.available
  const creatorStudioReady = creatorState.dashboard.available && creatorState.dashboard.serviceStatus === 'running'
  const creatorStudioMessage = creatorState.dashboard.reason || (
    creatorStudioPluginReady ? '' : '请先启用 Creator Studio 插件。'
  )
  const canGenerateNewCharacter = creatorState.provider.ready &&
    creatorStudioPluginReady &&
    !running &&
    newCharacterDraft.characterName.trim().length > 0 &&
    newCharacterDraft.referenceImageToken.trim().length > 0
  const canGenerateExistingAction = creatorState.provider.ready &&
    creatorStudioPluginReady &&
    !running &&
    existingActionDraft.actionName.trim().length > 0 &&
    existingActionDraft.motionPrompt.trim().length > 0 &&
    (
      existingActionDraft.referenceImageToken.trim().length > 0 ||
      hasStoredEditableReference
    )

  const selectReference = async (applyDraft: (draft: SelectedReferenceDraft) => void, errorFallback: string) => {
    try {
      const picked = await api.pickCreatorReferenceImage()
      if (picked.canceled) return
      applyDraft({
        referenceImageToken: String(picked.referenceToken || '').trim(),
        referenceFileName: String(picked.fileName || '').trim() || 'reference-image'
      })
      setStatus('')
    } catch (error) {
      setStatus(messageFromError(error, errorFallback))
    }
  }

  const paneProps = {
    creatorState,
    mode,
    newCharacterDraft,
    existingActionDraft,
    status,
    running,
    previewing,
    openingDashboard,
    result,
    creatorStudioReady,
    creatorStudioMessage,
    canGenerateNewCharacter,
    canGenerateExistingAction,
    onChangeMode: setMode,
    onChangeNewCharacterDraft: (partial: Partial<NewCharacterDraft>) => {
      setNewCharacterDraft((current) => ({ ...current, ...partial }))
    },
    onChangeExistingActionDraft: (partial: Partial<ExistingActionDraft>) => {
      setExistingActionDraft((current) => ({ ...current, ...partial }))
    },
    onSelectNewCharacterReference: () => selectReference(
      (draft) => setNewCharacterDraft((current) => ({ ...current, ...draft })),
      '参考图片选择失败'
    ),
    onSelectExistingActionReference: () => selectReference(
      (draft) => setExistingActionDraft((current) => ({ ...current, ...draft })),
      '参考图片选择失败'
    ),
    onClearExistingActionReference: () => {
      setExistingActionDraft((current) => ({
        ...current,
        referenceImageToken: '',
        referenceFileName: ''
      }))
      setStatus('')
    },
    onGenerateNewCharacter,
    onGenerateExistingAction,
    onPreviewResult,
    onRestoreClickAction,
    onRetryFullPetAction,
    onRetryFullPetIdentity,
    onOpenCreatorStudioDetails
  } satisfies CreatorPaneProps

  return {
    loading,
    paneProps
  }
}
