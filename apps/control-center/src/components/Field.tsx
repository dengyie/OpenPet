import type { ReactNode } from 'react'

interface FieldRowProps {
  label: ReactNode
  note?: ReactNode
  tall?: boolean
  children: ReactNode
}

/** 标签 + 控件的表单行（旧 .field-row 模式） */
export function FieldRow({ label, note, tall = false, children }: FieldRowProps) {
  return (
    <div className={tall ? 'field-row tall' : 'field-row'}>
      <div>
        <div className="field-label">{label}</div>
        {note ? <div className="field-note">{note}</div> : null}
      </div>
      {children}
    </div>
  )
}

interface ReadonlyRowProps {
  label: ReactNode
  value: ReactNode
  mono?: boolean
}

/** 只读键值行（旧 .readonly-row 模式） */
export function ReadonlyRow({ label, value, mono = false }: ReadonlyRowProps) {
  return (
    <div className="readonly-row">
      <span>{label}</span>
      {mono ? <code className="endpoint-text">{value}</code> : <strong className="endpoint-text">{value}</strong>}
    </div>
  )
}

interface FieldLabelProps {
  children: ReactNode
}

export function FieldLabel({ children }: FieldLabelProps) {
  return <div className="field-label">{children}</div>
}

interface FieldNoteProps {
  children: ReactNode
}

export function FieldNote({ children }: FieldNoteProps) {
  return <div className="field-note">{children}</div>
}
