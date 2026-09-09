import type { ReactNode } from 'react'

interface PaneScaffoldProps {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  paneClass?: string
  children: ReactNode
}

/**
 * Pane 骨架：统一的 pane-header（标题 + 说明 + 右侧动作）+ 内容区。
 * 所有 8 个 tab 共用，替代每个 pane 里重复的 header 样板。
 */
export function PaneScaffold({ title, description, actions, paneClass, children }: PaneScaffoldProps) {
  const cls = ['pane', paneClass].filter(Boolean).join(' ')
  return (
    <section className={cls}>
      <header className="pane-header">
        <div>
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="header-actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  )
}
