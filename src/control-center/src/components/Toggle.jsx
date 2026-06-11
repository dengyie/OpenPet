import React from 'react'

export function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      className={checked ? 'toggle on' : 'toggle'}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  )
}
