import type { AboutInfoViewState, UpdateCheckViewState } from '../../../shared/openpet-contracts'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { ReadonlyRow } from '../components/Field'
import { StatusLine } from '../components/Feedback'
import { PaneScaffold } from '../components/PaneScaffold'

export interface AboutPaneProps {
  aboutInfo: AboutInfoViewState
  updateCheck: UpdateCheckViewState
  status: string
  checking: boolean
  onCheckUpdates: () => void | Promise<void>
}

const formatCheckedAt = (timestamp: string) => {
  if (!timestamp) return '尚未检查'
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp
  return date.toLocaleString()
}

export function AboutPane({ aboutInfo, updateCheck, status, checking, onCheckUpdates }: AboutPaneProps) {
  const update = aboutInfo.update || {}
  const rows = [
    { label: '应用名称', value: aboutInfo.productName || aboutInfo.name },
    { label: '当前版本', value: aboutInfo.version },
    { label: '运行模式', value: aboutInfo.packaged ? '已打包' : '开发模式' },
    { label: '平台', value: `${aboutInfo.platform || '-'} ${aboutInfo.arch || ''}`.trim() },
    { label: '更新源', value: update.configured ? `${update.provider}/${update.owner}/${update.repo}` : '未配置' },
    { label: '发布通道', value: update.channel || '-' }
  ]
  const updateSummary = updateCheck.status === 'idle'
    ? '尚未检查'
    : `${updateCheck.message || updateCheck.status}${updateCheck.latestVersion ? ` · ${updateCheck.latestVersion}` : ''}`

  return (
    <PaneScaffold
      title="About"
      description="版本与发布信息"
      actions={
        <Button variant="primary" onClick={onCheckUpdates} disabled={checking}>
          {checking ? '检查中' : '检查更新'}
        </Button>
      }
    >
      <Card compact>
        {rows.map((row) => (
          <ReadonlyRow key={row.label} label={row.label} value={row.value} />
        ))}
      </Card>

      <Card compact>
        <ReadonlyRow label="更新状态" value={updateSummary} />
        <ReadonlyRow label="上次检查" value={formatCheckedAt(updateCheck.checkedAt)} />
        <ReadonlyRow label="安装包" value={updateCheck.assets?.length ? updateCheck.assets.map((asset) => asset.name).join(', ') : '-'} />
        <ReadonlyRow label="Release" value={updateCheck.releaseUrl || '-'} mono />
      </Card>
      <StatusLine>{status}</StatusLine>
    </PaneScaffold>
  )
}
