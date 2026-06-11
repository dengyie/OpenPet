import React from 'react'
import { Toggle } from '../components/Toggle.jsx'
import { formatBytes, formatPluginLogTime } from '../lib/format.js'

export function PluginsPane({ plugins, logs, filters, status, runningCommand, savingConfig, clearingStorage, onToggle, onChangeConfig, onSaveConfig, onRun, onChangeFilters, onExportLogs, onClearLogs, onClearStorage }) {
  return (
    <section className="pane">
      <header className="pane-header">
        <div>
          <h1>Plugins</h1>
          <p>插件权限与官方命令</p>
        </div>
      </header>

      <div className="plugin-list">
        {plugins.length === 0 ? (
          <div className="empty-chat">暂无插件</div>
        ) : plugins.map((plugin) => (
          <div className="plugin-row" key={plugin.id}>
            <div className="plugin-main">
              <div className="plugin-title">
                <strong>{plugin.name}</strong>
                <span>{plugin.source}</span>
              </div>
              <div className="plugin-meta">
                <span>{plugin.id}</span>
                <span>{plugin.version}</span>
                <span>{plugin.runnable ? '可运行' : '仅展示'}</span>
              </div>
              <div className="permission-line">
                {(plugin.permissions || []).length === 0 ? '无权限' : plugin.permissions.join(' · ')}
              </div>
              <div className="plugin-storage-line">
                <span>{plugin.storage?.valid === false ? '存储数据无效' : `存储 ${plugin.storage?.keyCount || 0} 项 / ${formatBytes(plugin.storage?.byteSize || 2)}`}</span>
                <button
                  type="button"
                  className="ghost"
                  disabled={plugin.storage?.valid !== false && ((plugin.storage?.keyCount || 0) === 0 || clearingStorage === plugin.id)}
                  onClick={() => onClearStorage(plugin.id)}
                >
                  {clearingStorage === plugin.id ? '清理中' : '清理存储'}
                </button>
              </div>
              {plugin.commands?.length ? (
                <div className="plugin-commands">
                  {plugin.commands.map((command) => {
                    const commandKey = `${plugin.id}:${command.id}`
                    return (
                      <button
                        type="button"
                        className="ghost"
                        key={command.id}
                        disabled={!plugin.enabled || !plugin.runnable || runningCommand === commandKey}
                        onClick={() => onRun(plugin.id, command.id)}
                      >
                        {runningCommand === commandKey ? '运行中' : command.title}
                      </button>
                    )
                  })}
                </div>
              ) : null}
              {plugin.configSchema?.properties?.length ? (
                <div className="plugin-config-panel">
                  <div className="plugin-config-header">
                    <strong>{plugin.configSchema.title || '配置'}</strong>
                    <button
                      type="button"
                      className="ghost"
                      disabled={savingConfig === plugin.id}
                      onClick={() => onSaveConfig(plugin.id)}
                    >
                      {savingConfig === plugin.id ? '保存中' : '保存配置'}
                    </button>
                  </div>
                  {plugin.configSchema.description ? (
                    <div className="field-note">{plugin.configSchema.description}</div>
                  ) : null}
                  <div className="plugin-config-grid">
                    {plugin.configSchema.properties.map((field) => {
                      const value = plugin.config?.[field.key]
                      const selectedEnumIndex = field.enum?.findIndex((option) => option === value)
                      return (
                        <label className="plugin-config-field" key={field.key}>
                          <span>
                            {field.title || field.key}
                            {field.required ? <em>必填</em> : null}
                          </span>
                          {field.enum?.length ? (
                            <select
                              className="text-input"
                              value={selectedEnumIndex >= 0 ? selectedEnumIndex : ''}
                              onChange={(event) => onChangeConfig(plugin.id, field.key, field.enum[Number(event.target.value)])}
                            >
                              {field.enum.map((option, index) => (
                                <option value={index} key={String(option)}>{String(option)}</option>
                              ))}
                            </select>
                          ) : field.type === 'boolean' ? (
                            <Toggle checked={Boolean(value)} onChange={(nextValue) => onChangeConfig(plugin.id, field.key, nextValue)} />
                          ) : (
                            <input
                              className="text-input"
                              type={field.type === 'number' ? 'number' : 'text'}
                              value={value ?? ''}
                              onChange={(event) => onChangeConfig(plugin.id, field.key, event.target.value)}
                            />
                          )}
                          {field.description ? <small>{field.description}</small> : null}
                        </label>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            <Toggle checked={plugin.enabled} onChange={(enabled) => onToggle(plugin.id, enabled)} />
          </div>
        ))}
      </div>

      {status ? <div className="status-line">{status}</div> : null}

      <div className="plugin-log-panel">
        <div className="plugin-log-header">
          <div>
            <h2>运行日志</h2>
            <span>最近 {logs.length} 条事件</span>
          </div>
          <div className="plugin-log-actions">
            <button type="button" className="ghost" onClick={() => onExportLogs('json')} disabled={logs.length === 0}>JSON</button>
            <button type="button" className="ghost" onClick={() => onExportLogs('csv')} disabled={logs.length === 0}>CSV</button>
            <button type="button" className="ghost" onClick={onClearLogs} disabled={logs.length === 0}>清空</button>
          </div>
        </div>
        <div className="plugin-log-filters">
          <select className="text-input" value={filters.pluginId} onChange={(event) => onChangeFilters({ ...filters, pluginId: event.target.value })}>
            <option value="">全部插件</option>
            {plugins.map((plugin) => <option value={plugin.id} key={plugin.id}>{plugin.name}</option>)}
          </select>
          <select className="text-input" value={filters.level} onChange={(event) => onChangeFilters({ ...filters, level: event.target.value })}>
            <option value="">全部级别</option>
            <option value="info">Info</option>
            <option value="error">Error</option>
          </select>
          <input
            className="text-input"
            value={filters.query}
            placeholder="搜索日志"
            onChange={(event) => onChangeFilters({ ...filters, query: event.target.value })}
          />
        </div>
        <div className="plugin-log-list">
          {logs.length === 0 ? (
            <div className="empty-chat">暂无日志</div>
          ) : logs.map((log) => (
            <div className={log.level === 'error' ? 'plugin-log-row error' : 'plugin-log-row'} key={log.id}>
              <span>{formatPluginLogTime(log.timestamp)}</span>
              <strong>{log.level === 'error' ? 'Error' : 'Info'}</strong>
              <div>
                <span>{log.pluginId || 'plugin'}</span>
                {log.commandId ? <span>/{log.commandId}</span> : null}
              </div>
              <p>{log.message}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
