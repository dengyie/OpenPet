import type { JsonObject, PluginEntriesViewState } from '../../../shared/openpet-contracts'

interface PluginEntryDetailsSource {
  entries?: PluginEntriesViewState
  config?: unknown
  configSchema?: unknown
  manifest?: JsonObject
  assets?: string[]
}

const hasEntries = (entries?: PluginEntriesViewState) => Boolean(
  entries?.commands?.length ||
  entries?.services?.length ||
  entries?.dashboards?.length
)

const formatManifest = (manifest?: JsonObject) => {
  if (!manifest || Object.keys(manifest).length === 0) return ''
  return JSON.stringify(manifest, null, 2)
}

export function PluginEntryDetails({ source, compact = false }: { source?: PluginEntryDetailsSource | null, compact?: boolean }) {
  const entries = source?.entries
  const configPath = typeof source?.config === 'string'
    ? source.config
    : typeof source?.configSchema === 'string'
      ? source.configSchema
      : ''
  const assets = Array.isArray(source?.assets) ? source.assets : []
  const manifestText = formatManifest(source?.manifest)

  if (!hasEntries(entries) && !configPath && !assets.length && !manifestText) return null

  return (
    <div className={compact ? 'plugin-entry-details compact' : 'plugin-entry-details'}>
      <strong>Entry declarations</strong>
      {entries?.commands?.length ? (
        <div className="plugin-entry-section">
          <span>Command entries</span>
          {entries.commands.map((command) => (
            <code key={command.id}>{command.id}{command.command ? ` · ${command.command}` : ''}</code>
          ))}
        </div>
      ) : null}
      {entries?.services?.length ? (
        <div className="plugin-entry-section">
          <span>Service entries</span>
          {entries.services.map((service) => (
            <code key={service.id}>{service.id}{service.command ? ` · ${service.command}` : ''}</code>
          ))}
        </div>
      ) : null}
      {entries?.dashboards?.length ? (
        <div className="plugin-entry-section">
          <span>Dashboard entries</span>
          {entries.dashboards.map((dashboard) => (
            <code key={dashboard.id}>{dashboard.id}{dashboard.url ? ` · ${dashboard.url}` : ''}</code>
          ))}
        </div>
      ) : null}
      {configPath ? (
        <div className="plugin-entry-section">
          <span>Config</span>
          <code>{configPath}</code>
        </div>
      ) : null}
      {assets.length ? (
        <div className="plugin-entry-section">
          <span>Assets</span>
          {assets.map((asset) => <code key={asset}>{asset}</code>)}
        </div>
      ) : null}
      {manifestText ? (
        <div className="plugin-entry-section">
          <span>Manifest</span>
          <pre>{manifestText}</pre>
        </div>
      ) : null}
      <small>These declarations are shown for review. Services are not started; dashboards open only through an explicit Control Center action.</small>
    </div>
  )
}
