import type { ReactNode } from 'react'

interface DisclosureProps {
  title: ReactNode
  description?: ReactNode
  defaultOpen?: boolean
  className?: string
  children: ReactNode
}

/**
 * 可折叠区块（包 <details>），对应 provider-disclosure / ai-section /
 * plugin-*-disclosure 等重复模式。
 */
export function Disclosure({ title, description, defaultOpen = false, className, children }: DisclosureProps) {
  return (
    <details className={className || 'disclosure'} open={defaultOpen || undefined}>
      <summary className="disclosure-summary">
        <div className="disclosure-summary-copy">
          <span className="disclosure-title">{title}</span>
          {description ? <span className="disclosure-description">{description}</span> : null}
        </div>
        <span className="disclosure-caret" aria-hidden="true" />
      </summary>
      <div className="disclosure-body">{children}</div>
    </details>
  )
}
