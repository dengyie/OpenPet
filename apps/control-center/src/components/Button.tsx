import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'ghost' | 'ghost-accent' | 'ghost-danger' | 'inline'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  icon?: ReactNode
  children: ReactNode
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'primary',
  ghost: 'ghost',
  'ghost-accent': 'ghost accent',
  'ghost-danger': 'ghost danger',
  inline: 'inline-action'
}

export function Button({ variant = 'ghost', icon, children, className, ...rest }: ButtonProps) {
  const cls = [variantClass[variant], className].filter(Boolean).join(' ')
  return (
    <button type="button" className={cls} {...rest}>
      {icon ? <span className="button-icon">{icon}</span> : null}
      {children}
    </button>
  )
}
