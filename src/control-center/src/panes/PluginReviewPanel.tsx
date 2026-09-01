import type { PluginPackageReviewViewState } from '../../../shared/openpet-contracts'
import { PluginEntryDetails } from '../components/PluginEntryDetails'
import { formatBytes } from '../lib/format'

export function PluginReviewPanel({ review, installingPlugin, onInstallReviewedPlugin, onClearPluginReview }: {
  review: PluginPackageReviewViewState | null
  installingPlugin: boolean
  onInstallReviewedPlugin: () => void | Promise<void>
  onClearPluginReview: () => void | Promise<void>
}) {
  if (!review) return null
  const plugin = review.plugin || {}
  const diff = (value?: { added?: string[], removed?: string[], unchanged?: string[] }) => {
    const parts = [value?.added?.length ? `新增 ${value.added.join(', ')}` : '', value?.removed?.length ? `移除 ${value.removed.join(', ')}` : '', value?.unchanged?.length ? `保留 ${value.unchanged.join(', ')}` : '']
    return parts.filter(Boolean).join(' · ') || '无变化'
  }
  return <div className={review.riskLevel === 'review' ? 'plugin-review-panel warning' : 'plugin-review-panel'}>
    <div className="plugin-review-header"><div><h2>{plugin.name || plugin.id}</h2><span>{review.installMode === 'update' ? `更新 ${review.existingVersion} → ${plugin.version}` : `安装 ${plugin.version}`}</span></div><div className="plugin-log-actions"><button type="button" className="ghost" disabled={installingPlugin} onClick={onClearPluginReview}>取消</button><button type="button" className="primary" disabled={installingPlugin || Boolean(review.signature?.errors?.length)} onClick={onInstallReviewedPlugin}>{installingPlugin ? '处理中' : review.installMode === 'update' ? '确认更新' : '安装插件'}</button></div></div>
    <div className="plugin-review-grid"><div><strong>权限</strong><span>{diff(review.permissionDiff?.permissions)}</span></div><div><strong>网络</strong><span>{diff(review.permissionDiff?.networkAllowlist)}</span></div><div><strong>签名</strong><span>{review.signature?.label || 'Unknown'}{review.signature?.signer ? ` · ${review.signature.signer}` : ''}</span></div><div><strong>包摘要</strong><span>{review.fileCount} files · {formatBytes(review.byteSize || 0)} · {review.packageHash?.slice(0, 16)}</span></div></div>
    {review.signature?.errors?.length ? <div className="inspection-block error">{review.signature.errors.map((error) => <span key={error}>{error}</span>)}</div> : null}
    <div className="permission-line">{plugin.commands?.length ? `命令：${plugin.commands.map((command) => command.id).join(' · ')}` : '无命令'}</div><PluginEntryDetails source={plugin} />
  </div>
}
