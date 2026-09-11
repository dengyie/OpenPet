interface ToggleProps {
  ariaLabel?: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}

export function Toggle({ ariaLabel, checked, disabled = false, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      className={checked ? 'toggle on' : 'toggle'}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onChange(!checked)
      }}
    >
      <span />
    </button>
  )
}
