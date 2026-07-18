import type { ReactNode } from 'react'

type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

interface BadgeProps {
  tone?: BadgeTone
  children: ReactNode
}

export function Badge({ tone = 'neutral', children }: BadgeProps) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

interface StatusLineProps {
  children: ReactNode
}

/** 页面底部状态行 */
export function StatusLine({ children }: StatusLineProps) {
  if (!children) return null
  return <div className="status-line">{children}</div>
}

interface EmptyStateProps {
  children: ReactNode
}

/** 空列表/空数据占位 */
export function EmptyState({ children }: EmptyStateProps) {
  return <div className="empty-chat">{children}</div>
}

type FeedbackTone = 'ok' | 'error' | 'warning' | 'info'

interface FeedbackProps {
  tone?: FeedbackTone
  children: ReactNode
}

/** 内联操作反馈（保存结果、连接测试等） */
export function Feedback({ tone = 'info', children }: FeedbackProps) {
  if (!children) return null
  return <div className={`provider-feedback ${tone}`}>{children}</div>
}
