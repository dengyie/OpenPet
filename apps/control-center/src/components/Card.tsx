import type { ReactNode } from 'react'

interface CardProps {
  compact?: boolean
  className?: string
  children: ReactNode
}

/** 通用卡片容器，对应旧 .section */
export function Card({ compact = false, className, children }: CardProps) {
  const cls = ['section', compact ? 'compact' : '', className].filter(Boolean).join(' ')
  return <div className={cls}>{children}</div>
}

interface CardHeaderProps {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}

/** 卡片头部：标题 + 可选说明 + 右侧动作 */
export function CardHeader({ title, description, actions }: CardHeaderProps) {
  return (
    <div className="card-header">
      <div className="card-header-copy">
        <h2 className="card-title">{title}</h2>
        {description ? <p className="card-description">{description}</p> : null}
      </div>
      {actions ? <div className="card-header-actions">{actions}</div> : null}
    </div>
  )
}
