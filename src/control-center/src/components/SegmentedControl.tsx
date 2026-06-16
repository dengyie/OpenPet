interface SegmentedOption {
  label: string
  value: number
}

interface SegmentedControlProps {
  label: string
  value: number
  options: SegmentedOption[]
  onChange: (value: number) => void
}

export function SegmentedControl({ label, value, options, onChange }: SegmentedControlProps) {
  return (
    <div className="field-row">
      <div className="field-label">{label}</div>
      <div className="segmented" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={value === option.value ? 'active' : ''}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
