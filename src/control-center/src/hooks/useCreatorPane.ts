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
  if (!result) return ''
  // Preview only makes sense for imported/playable actions.
  if (!(result.state === 'completed' || result.importedAction || result.activePet)) return ''
  return String(
    result.clickAction ||
    result.importedAction?.actionId ||
    result.activePet?.clickAction ||
    result.activePet?.defaultAction ||
    ''
  ).trim()
}

const formatWorkflowStateFallback = (state: CreatorWorkflowResult['state'] | string) => {
  if (state === 'completed') return '已完成'
  if (state === 'generating') return '进行中'
  if (state === 'provider-not-ready') return 'Provider 未就绪'
  if (state === 'review-required') return '需要复查'
  if (state === 'preview-ready') return '预览就绪'
  if (state === 'import-failed') return '导入失败'
  if (state === 'missing-input') return '缺少输入'
  return String(state || '未知状态')
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
  const [copiedPromptKey, setCopiedPromptKey] = useState('')
  const previewCacheRef = useRef(new Map<string, string>())
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

  useEffect(() => {
    if (!active || !running) return undefined
    let canceled = false
    const tick = async () => {
      try {
        const nextState = await refreshCreatorState()
        if (canceled) return
        const lastRun = nextState.lastRun
        if (!lastRun) return
        if (lastRun.message) setStatus(lastRun.message)
        setResult((current) => {
          if (!current || current.state !== 'generating') return current
          return {
            ...current,
            message: lastRun.message || current.message,
            run: {
              ...(current.run || lastRun),
              ...lastRun,
              state: 'generating'
            },
            diagnostics: lastRun.diagnostics || current.diagnostics || null
          }
        })
      } catch (error) {
        if (!canceled) setStatus(messageFromError(error, '生成进度刷新失败'))
      }
    }
    void tick()
    const timer = window.setInterval(() => { void tick() }, 2000)
    return () => {
      canceled = true
      window.clearInterval(timer)
    }
  }, [active, running])

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
    if (dashboard.serviceStatus !== 'running') {
      setStatus(dashboard.reason || '请先启动 Creator Studio Service（Plugins），再打开详情页。当前详情服务未运行。')
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
    if (previewing) return
    if (!result) {
      setStatus('还没有可预览的生成结果')
      return
    }
    if (!(result.state === 'completed' || result.importedAction || result.activePet)) {
      const phase = result.diagnostics?.progress?.phaseLabel || formatWorkflowStateFallback(result.state)
      setStatus(`当前状态不可预览（${phase}）。预览仅支持已导入动作，请先导入可用动作。`)
      return
    }
    const actionId = resolvePreviewActionId(result)
    if (!actionId) {
      setStatus('当前结果没有可预览的动作。预览只播放已导入动作，请先完成导入。')
      return
    }
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

  const onImportAvailableActions = async () => {
    const runId = String(result?.run?.runId || creatorState.lastRun?.runId || '').trim()
    if (!runId || running) return
    setRunning(true)
    setStatus('正在导入可用动作…')
    try {
      const nextResult = await api.importCreatorAvailableActions({ runId, activate: true })
      await syncAfterWorkflow(nextResult)
    } catch (error) {
      setStatus(messageFromError(error, '可用动作导入失败'))
    } finally {
      setRunning(false)
    }
  }

  const onCopyText = async (value: string, label = '内容', key = '') => {
    const textValue = String(value || '')
    if (!textValue) {
      setStatus(`${label}为空，无法复制`)
      return
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(textValue)
      } else {
        const area = document.createElement('textarea')
        area.value = textValue
        area.setAttribute('readonly', 'true')
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        document.execCommand('copy')
        document.body.removeChild(area)
      }
      setStatus(`已复制${label}`)
      if (key) setCopiedPromptKey(key)
      else setCopiedPromptKey(label)
    } catch (error) {
      setStatus(messageFromError(error, `复制${label}失败`))
    }
  }

  const onLoadAssetPreview = async (relativePath: string) => {
    const safePath = String(relativePath || '').trim()
    if (!safePath) {
      setStatus('资源路径为空，无法加载预览')
      return ''
    }
    const cached = previewCacheRef.current.get(safePath)
    if (cached) return cached
    const runId = String(result?.run?.runId || creatorState.lastRun?.runId || '').trim()
    if (!runId) {
      setStatus('当前没有 run，无法加载资源预览')
      return ''
    }
    try {
      const preview = await api.getCreatorAssetPreview({ runId, relativePath: safePath })
      if (!preview?.ok || !preview.previewDataUrl) {
        setStatus(preview?.message || '资源预览加载失败')
        return ''
      }
      previewCacheRef.current.set(safePath, preview.previewDataUrl)
      return preview.previewDataUrl
    } catch (error) {
      setStatus(messageFromError(error, '资源预览加载失败'))
      return ''
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
    onImportAvailableActions,
    onOpenCreatorStudioDetails,
    onCopyText,
    onLoadAssetPreview,
    copiedPromptKey
  } satisfies CreatorPaneProps

  return {
    loading,
    paneProps
  }
}
