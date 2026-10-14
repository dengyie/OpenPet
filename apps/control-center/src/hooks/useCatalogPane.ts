import { useCallback, useEffect, useRef, useState } from 'react'
import { catalogApi, resolveCatalogInstallJob } from '../features/catalog/api.ts'
import { cloneCatalog, defaultCatalog } from '../lib/defaults.ts'
import { messageFromError } from '../lib/errors.ts'
import { useJob } from './useJob.ts'
import { useSse } from './useSse.ts'
import type {
  CatalogBlocklistEntry,
  CatalogInstallSelection,
  CatalogItemKind,
  CatalogState
} from '@openpet/shared/src/openpet-contracts.ts'
import type { CatalogPaneProps } from '../panes/CatalogPane.tsx'

export function useCatalogPane() {
  const [loading, setLoading] = useState(true)
  const [catalog, setCatalog] = useState<CatalogState>(defaultCatalog)
  const [status, setStatus] = useState('')
  const [preparing, setPreparing] = useState('')
  const [installing, setInstalling] = useState(false)
  const [installJobId, setInstallJobId] = useState<string | null>(null)
  const [selection, setSelection] = useState<CatalogInstallSelection | null>(null)
  const [blocklistDraft, setBlocklistDraft] = useState<CatalogBlocklistEntry>({ type: 'pluginId', value: '' })
  const { job: installJob } = useJob(installJobId)
  const catalogEvents = useSse(['catalog'])
  const lastCatalogEventIdRef = useRef<string | null>(null)
  const catalogRefreshSequenceRef = useRef(0)

  const commitCatalog = useCallback((nextCatalog: CatalogState) => {
    catalogRefreshSequenceRef.current += 1
    setCatalog(cloneCatalog(nextCatalog))
  }, [])

  const refreshCatalog = useCallback(async () => {
    const sequence = ++catalogRefreshSequenceRef.current
    const nextCatalog = cloneCatalog(await catalogApi.list())
    if (sequence === catalogRefreshSequenceRef.current) setCatalog(nextCatalog)
    return nextCatalog
  }, [])

  useEffect(() => {
    let mounted = true
    refreshCatalog().then(() => {
      if (mounted) setLoading(false)
    }).catch((error) => {
      if (!mounted) return
      setStatus(messageFromError(error, 'Catalog 加载失败'))
      setLoading(false)
    })
    return () => { mounted = false }
  }, [refreshCatalog])

  useEffect(() => {
    if (catalogEvents.lastEventName !== 'catalog.refreshed' || !catalogEvents.lastEventId) return
    if (catalogEvents.lastEventId === lastCatalogEventIdRef.current) return
    lastCatalogEventIdRef.current = catalogEvents.lastEventId
    let mounted = true
    refreshCatalog().catch((error) => {
      if (mounted) setStatus(messageFromError(error, 'Catalog 事件刷新失败'))
    })
    return () => { mounted = false }
  }, [catalogEvents.lastEventId, catalogEvents.lastEventName, refreshCatalog])

  useEffect(() => {
    if (!installing || !installJobId || !installJob || installJob.jobId !== installJobId) return
    const resolved = resolveCatalogInstallJob(installJob)
    if (resolved.kind === 'pending') return
    if (resolved.kind === 'succeeded') {
      commitCatalog(resolved.result.catalog)
      setSelection(null)
      setStatus(selection?.kind === 'pet-pack' ? 'Pet pack 已安装' : '插件已安装，默认保持停用')
    } else {
      setStatus(resolved.message)
      void refreshCatalog().catch(() => {})
    }
    setInstalling(false)
    setInstallJobId(null)
  }, [commitCatalog, installJob, installJobId, installing, refreshCatalog, selection?.kind])

  const onPrepareInstall = async (kind: CatalogItemKind, itemId: string) => {
    if (installing || preparing) return
    const key = `${kind}:${itemId}`
    setPreparing(key)
    setStatus('')
    try {
      if (selection?.selectionId) await catalogApi.clearSelection(selection.selectionId)
      const nextSelection = await catalogApi.prepare({ kind, itemId })
      setSelection(nextSelection)
      setStatus(kind === 'plugin' ? '插件包已下载并进入安装审查' : 'Pet pack 已下载并通过检查')
    } catch (error) {
      setStatus(messageFromError(error, 'Catalog 安装准备失败'))
      await refreshCatalog().catch(() => {})
    } finally {
      setPreparing('')
    }
  }

  const onClearSelection = async () => {
    if (installing) return
    try {
      if (selection?.selectionId) await catalogApi.clearSelection(selection.selectionId)
    } catch (_) {}
    setSelection(null)
  }

  const onInstallSelection = async () => {
    if (!selection?.selectionId) return
    const selected = selection
    setInstalling(true)
    setInstallJobId(null)
    setStatus('')
    try {
      const started = await catalogApi.install(selected.selectionId)
      if ('result' in started) {
        commitCatalog(started.result.catalog)
        setSelection(null)
        setStatus(selected.kind === 'plugin' ? '插件已安装，默认保持停用' : 'Pet pack 已安装')
        setInstalling(false)
      } else {
        setInstallJobId(started.jobId)
        setStatus('Catalog 安装任务已提交')
      }
    } catch (error) {
      setStatus(messageFromError(error, 'Catalog 安装失败'))
      await refreshCatalog().catch(() => {})
      setInstalling(false)
    }
  }

  const onAddBlocklistEntry = async () => {
    if (installing || preparing) return
    setStatus('')
    try {
      const result = await catalogApi.addBlocklistEntry(blocklistDraft)
      commitCatalog(result.catalog)
      setBlocklistDraft({ ...blocklistDraft, value: '' })
      setStatus('Blocklist 已更新')
    } catch (error) {
      setStatus(messageFromError(error, 'Blocklist 更新失败'))
    }
  }

  const onRemoveBlocklistEntry = async (type: CatalogBlocklistEntry['type'], value: string) => {
    if (installing || preparing) return
    setStatus('')
    try {
      const result = await catalogApi.removeBlocklistEntry({ type, value })
      commitCatalog(result.catalog)
      setStatus('Blocklist 已移除')
    } catch (error) {
      setStatus(messageFromError(error, 'Blocklist 移除失败'))
    }
  }

  const paneProps = {
    catalog,
    status,
    preparing,
    installing,
    selection,
    blocklistDraft,
    onPrepareInstall,
    onClearSelection,
    onInstallSelection,
    onChangeBlocklistDraft: setBlocklistDraft,
    onAddBlocklistEntry,
    onRemoveBlocklistEntry,
    onRefreshCatalog: refreshCatalog
  } satisfies CatalogPaneProps

  return { loading, paneProps }
}
