import { useEffect, useState } from 'react'
import { controlCenterAPI as api } from '../api/control-center-api'
import { cloneCatalog, defaultCatalog } from '../lib/defaults'
import { messageFromError } from '../lib/errors'
import type {
  CatalogBlocklistEntry,
  CatalogInstallSelection,
  CatalogItemKind,
  CatalogState
} from '../../../shared/openpet-contracts'
import type { CatalogPaneProps } from '../panes/CatalogPane'

export function useCatalogPane() {
  const [loading, setLoading] = useState(true)
  const [catalog, setCatalog] = useState<CatalogState>(defaultCatalog)
  const [status, setStatus] = useState('')
  const [preparing, setPreparing] = useState('')
  const [installing, setInstalling] = useState(false)
  const [selection, setSelection] = useState<CatalogInstallSelection | null>(null)
  const [blocklistDraft, setBlocklistDraft] = useState<CatalogBlocklistEntry>({ type: 'pluginId', value: '' })

  const refreshCatalog = async () => {
    const nextCatalog = cloneCatalog(await api.getCatalog())
    setCatalog(nextCatalog)
    return nextCatalog
  }

  useEffect(() => {
    let mounted = true
    api.getCatalog().then((loadedCatalog) => {
      if (!mounted) return
      setCatalog(cloneCatalog(loadedCatalog))
      setLoading(false)
    }).catch((error) => {
      if (!mounted) return
      setStatus(messageFromError(error, 'Catalog 加载失败'))
      setLoading(false)
    })
    return () => { mounted = false }
  }, [])

  const onPrepareInstall = async (kind: CatalogItemKind, itemId: string) => {
    const key = `${kind}:${itemId}`
    setPreparing(key)
    setStatus('')
    try {
      if (selection?.selectionId) await api.clearCatalogSelection(selection.selectionId)
      const nextSelection = await api.prepareCatalogInstall({ kind, itemId })
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
    try {
      if (selection?.selectionId) await api.clearCatalogSelection(selection.selectionId)
    } catch (_) {}
    setSelection(null)
  }

  const onInstallSelection = async () => {
    if (!selection?.selectionId) return
    setInstalling(true)
    setStatus('')
    try {
      const result = await api.installCatalogSelection(selection.selectionId)
      setCatalog(cloneCatalog(result.catalog || await api.getCatalog()))
      setSelection(null)
      setStatus(selection.kind === 'plugin' ? '插件已安装，默认保持停用' : 'Pet pack 已安装')
    } catch (error) {
      setStatus(messageFromError(error, 'Catalog 安装失败'))
      await refreshCatalog().catch(() => {})
    } finally {
      setInstalling(false)
    }
  }

  const onAddBlocklistEntry = async () => {
    setStatus('')
    try {
      const result = await api.addCatalogBlocklistEntry(blocklistDraft)
      setCatalog(cloneCatalog(result.catalog || await api.getCatalog()))
      setBlocklistDraft({ ...blocklistDraft, value: '' })
      setStatus('Blocklist 已更新')
    } catch (error) {
      setStatus(messageFromError(error, 'Blocklist 更新失败'))
    }
  }

  const onRemoveBlocklistEntry = async (type: CatalogBlocklistEntry['type'], value: string) => {
    setStatus('')
    try {
      const result = await api.removeCatalogBlocklistEntry({ type, value })
      setCatalog(cloneCatalog(result.catalog || await api.getCatalog()))
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
