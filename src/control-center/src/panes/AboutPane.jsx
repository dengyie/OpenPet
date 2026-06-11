import React from 'react'

export function AboutPane({ title, rows }) {
  return (
    <section className="pane">
      <header className="pane-header">
        <div>
          <h1>{title}</h1>
          <p>待接入</p>
        </div>
      </header>
      <div className="section compact">
        {rows.map((row) => (
          <div className="readonly-row" key={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}
