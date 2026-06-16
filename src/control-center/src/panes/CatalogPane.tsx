import type {
  CatalogBlocklistEntry,
  CatalogInstallSelection,
  CatalogItemKind,
  CatalogPetPackEntry,
  CatalogPluginEntry,
  CatalogReviewState,
  CatalogState,
  PermissionDiffState
} from '../../../shared/openpet-contracts'
import { formatBytes } from '../lib/format'

export interface CatalogPaneProps {
  catalog: CatalogState
  status: string
  preparing: string
  installing: boolean
  selection: CatalogInstallSelection | null
  blocklistDraft: CatalogBlocklistEntry
  onPrepareInstall: (kind: CatalogItemKind, itemId: string) => void | Promise<void>
  onClearSelection: () => void | Promise<void>
  onInstallSelection: () => void | Promise<void>
  onChangeBlocklistDraft: (draft: CatalogBlocklistEntry) => void
  onAddBlocklistEntry: () => void | Promise<void>
  onRemoveBlocklistEntry: (type: CatalogBlocklistEntry['type'], value: string) => void | Promise<void>
  onRefreshCatalog: () => CatalogState | Promise<CatalogState>
}

const formatBlockStatus = (status?: CatalogReviewState) => status?.blocked ? `Blocked · ${status.reasons.join(', ')}` : 'Allowed'

const formatInstallState = (item: CatalogPluginEntry | CatalogPetPackEntry) => {
  if (item.blockStatus?.blocked) return 'Blocked'
  if (!item.downloadable) return item.installed ? 'Bundled' : 'Metadata only'
  if (item.updateAvailable) return `Update ${item.installedVersion} → ${item.version}`
  if (item.installed) return `Installed ${item.installedVersion}`
  return 'Available'
}

const formatDiff = (diff?: PermissionDiffState) => {
  const added = diff?.added?.length ? `新增 ${diff.added.join(', ')}` : ''
  const removed = diff?.removed?.length ? `移除 ${diff.removed.join(', ')}` : ''
  const unchanged = diff?.unchanged?.length ? `保留 ${diff.unchanged.join(', ')}` : ''
  return [added, removed, unchanged].filter(Boolean).join(' · ') || '无变化'
}

function CatalogPluginReview({
  selection,
  installing,
  onInstallSelection,
  onClearSelection
}: {
  selection: Extract<CatalogInstallSelection, { kind: 'plugin' }> | null
  installing: boolean
  onInstallSelection: () => void | Promise<void>
  onClearSelection: () => void | Promise<void>
}) {
  const review = selection?.pluginReview
  if (!review) return null
  const plugin = review.plugin || {}
  return (
    <div className={review.riskLevel === 'review' ? 'plugin-review-panel warning' : 'plugin-review-panel'}>
      <div className="plugin-review-header">
        <div>
          <h2>{plugin.name || plugin.id}</h2>
          <span>{review.installMode === 'update' ? `更新 ${review.existingVersion} → ${plugin.version}` : `安装 ${plugin.version}`}</span>
        </div>
        <div className="plugin-log-actions">
          <button type="button" className="ghost" disabled={installing} onClick={onClearSelection}>取消</button>
          <button type="button" className="primary" disabled={installing || Boolean(review.signature?.errors?.length) || Boolean(review.blockStatus?.blocked)} onClick={onInstallSelection}>
            {installing ? '处理中' : '确认安装'}
          </button>
        </div>
      </div>
      <div className="plugin-review-grid">
        <div>
          <strong>权限</strong>
          <span>{formatDiff(review.permissionDiff?.permissions)}</span>
        </div>
        <div>
          <strong>网络</strong>
          <span>{formatDiff(review.permissionDiff?.networkAllowlist)}</span>
        </div>
        <div>
          <strong>签名</strong>
          <span>{review.signature?.label || 'Unknown'}</span>
        </div>
        <div>
          <strong>包摘要</strong>
          <span>{review.fileCount} files · {formatBytes(review.byteSize || 0)} · {review.packageHash?.slice(0, 16)}</span>
        </div>
      </div>
      {review.blockStatus?.blocked ? <div className="inspection-block error"><span>{formatBlockStatus(review.blockStatus)}</span></div> : null}
      {review.signature?.errors?.length ? (
        <div className="inspection-block error">
          {review.signature.errors.map((error) => <span key={error}>{error}</span>)}
        </div>
      ) : null}
    </div>
  )
}

function CatalogPetPackReview({
  selection,
  installing,
  onInstallSelection,
  onClearSelection
}: {
  selection: Extract<CatalogInstallSelection, { kind: 'pet-pack' }> | null
  installing: boolean
  onInstallSelection: () => void | Promise<void>
  onClearSelection: () => void | Promise<void>
}) {
  const review = selection?.petPackReview
  if (!review?.pack) return null
  const pack = review.pack
  return (
    <div className="plugin-review-panel">
      <div className="plugin-review-header">
        <div>
          <h2>{pack.displayName}</h2>
          <span>{pack.id} · {pack.version} · {pack.actionCount} actions</span>
        </div>
        <div className="plugin-log-actions">
          <button type="button" className="ghost" disabled={installing} onClick={onClearSelection}>取消</button>
          <button type="button" className="primary" disabled={installing || pack.blockStatus?.blocked} onClick={onInstallSelection}>
            {installing ? '处理中' : '安装 Pet Pack'}
          </button>
        </div>
      </div>
      <div className="plugin-review-grid">
        <div>
          <strong>默认动作</strong>
          <span>{pack.defaultAction}</span>
        </div>
        <div>
          <strong>点击动作</strong>
          <span>{pack.clickAction}</span>
        </div>
        <div>
          <strong>包摘要</strong>
          <span>{pack.packageHash?.slice(0, 16)}</span>
        </div>
        <div>
          <strong>治理状态</strong>
          <span>{formatBlockStatus(pack.blockStatus)}</span>
        </div>
      </div>
    </div>
  )
}

function CatalogItem({
  item,
  kind,
  preparing,
  onPrepareInstall
}: {
  item: CatalogPluginEntry | CatalogPetPackEntry
  kind: CatalogItemKind
  preparing: string
  onPrepareInstall: (kind: CatalogItemKind, itemId: string) => void | Promise<void>
}) {
  const key = `${kind}:${item.id}`
  const title = kind === 'plugin' ? (item as CatalogPluginEntry).name : (item as CatalogPetPackEntry).displayName
  const meta = kind === 'plugin'
    ? [item.id, item.version, item.author, (item as CatalogPluginEntry).openpetApiVersion].filter(Boolean).join(' · ')
    : [item.id, item.version, item.author, `${(item as CatalogPetPackEntry).actionCount || 0} actions`].filter(Boolean).join(' · ')
  return (
    <div className={item.blockStatus?.blocked ? 'catalog-item blocked' : 'catalog-item'}>
      {kind === 'pet-pack' && (item as CatalogPetPackEntry).previewImage ? <img className="catalog-preview" src={(item as CatalogPetPackEntry).previewImage} alt="" /> : null}
      <div className="catalog-item-main">
        <div className="plugin-title">
          <strong>{title}</strong>
          <span>{formatInstallState(item)}</span>
        </div>
        <div className="plugin-meta">
          <span>{meta}</span>
          <span>{formatBlockStatus(item.blockStatus)}</span>
          {item.sha256 ? <span>{item.sha256.slice(0, 16)}</span> : null}
        </div>
        {item.description ? <div className="permission-line">{item.description}</div> : null}
        {kind === 'plugin' && (item as CatalogPluginEntry).permissions?.length ? <div className="permission-line">权限：{(item as CatalogPluginEntry).permissions?.join(' · ')}</div> : null}
        {item.reportUrl ? <div className="permission-line">Report：{item.reportUrl}</div> : null}
      </div>
      <button
        type="button"
        className="primary"
        disabled={!item.downloadable || item.blockStatus?.blocked || preparing === key}
        onClick={() => onPrepareInstall(kind, item.id)}
      >
        {preparing === key ? '下载中' : item.updateAvailable ? 'Update' : 'Install'}
      </button>
    </div>
  )
}

function BlocklistList({
  title,
  type,
  values,
  onRemoveBlocklistEntry
}: {
  title: string
  type: CatalogBlocklistEntry['type']
  values: string[]
  onRemoveBlocklistEntry: (type: CatalogBlocklistEntry['type'], value: string) => void | Promise<void>
}) {
  return (
    <div className="blocklist-column">
      <strong>{title}</strong>
      {values.length === 0 ? <span>暂无</span> : values.map((value) => (
        <button type="button" className="ghost blocklist-token" key={value} onClick={() => onRemoveBlocklistEntry(type, value)}>
          {value}
        </button>
      ))}
    </div>
  )
}

export function CatalogPane({ catalog, status, preparing, installing, selection, blocklistDraft, onPrepareInstall, onClearSelection, onInstallSelection, onChangeBlocklistDraft, onAddBlocklistEntry, onRemoveBlocklistEntry, onRefreshCatalog }: CatalogPaneProps) {
  return (
    <section className="pane">
      <header className="pane-header">
        <div>
          <h1>Catalog</h1>
          <p>插件与 Pet Pack 目录</p>
        </div>
        <div className="header-actions">
          <button type="button" className="ghost" onClick={onRefreshCatalog}>刷新</button>
        </div>
      </header>

      <CatalogPluginReview
        selection={selection?.kind === 'plugin' ? selection : null}
        installing={installing}
        onInstallSelection={onInstallSelection}
        onClearSelection={onClearSelection}
      />
      <CatalogPetPackReview
        selection={selection?.kind === 'pet-pack' ? selection : null}
        installing={installing}
        onInstallSelection={onInstallSelection}
        onClearSelection={onClearSelection}
      />

      <div className="catalog-section">
        <div className="plugin-log-header">
          <div>
            <h2>Plugins</h2>
            <span>{catalog.plugins.length} entries</span>
          </div>
        </div>
        <div className="catalog-list">
          {catalog.plugins.length === 0 ? <div className="empty-chat">暂无插件目录项</div> : catalog.plugins.map((item) => (
            <CatalogItem item={item} kind="plugin" preparing={preparing} onPrepareInstall={onPrepareInstall} key={item.id} />
          ))}
        </div>
      </div>

      <div className="catalog-section">
        <div className="plugin-log-header">
          <div>
            <h2>Pet Packs</h2>
            <span>{catalog.petPacks.length} entries</span>
          </div>
        </div>
        <div className="catalog-list">
          {catalog.petPacks.length === 0 ? <div className="empty-chat">暂无 Pet Pack 目录项</div> : catalog.petPacks.map((item) => (
            <CatalogItem item={item} kind="pet-pack" preparing={preparing} onPrepareInstall={onPrepareInstall} key={item.id} />
          ))}
        </div>
      </div>

      <div className="catalog-section">
        <div className="plugin-log-header">
          <div>
            <h2>Blocklist</h2>
            <span>本地治理规则</span>
          </div>
        </div>
        <div className="blocklist-add-row">
          <select className="text-input" value={blocklistDraft.type} onChange={(event) => onChangeBlocklistDraft({ ...blocklistDraft, type: event.target.value as CatalogBlocklistEntry['type'] })}>
            <option value="pluginId">Plugin ID</option>
            <option value="packId">Pack ID</option>
            <option value="sha256">SHA256</option>
          </select>
          <input className="text-input" value={blocklistDraft.value} onChange={(event) => onChangeBlocklistDraft({ ...blocklistDraft, value: event.target.value })} />
          <button type="button" className="primary" disabled={!blocklistDraft.value.trim()} onClick={onAddBlocklistEntry}>添加</button>
        </div>
        <div className="blocklist-grid">
          <BlocklistList title="Plugin IDs" type="pluginId" values={catalog.localBlocklist.pluginIds} onRemoveBlocklistEntry={onRemoveBlocklistEntry} />
          <BlocklistList title="Pack IDs" type="packId" values={catalog.localBlocklist.packIds} onRemoveBlocklistEntry={onRemoveBlocklistEntry} />
          <BlocklistList title="SHA256" type="sha256" values={catalog.localBlocklist.sha256} onRemoveBlocklistEntry={onRemoveBlocklistEntry} />
        </div>
      </div>

      {status ? <div className="status-line">{status}</div> : null}
    </section>
  )
}
