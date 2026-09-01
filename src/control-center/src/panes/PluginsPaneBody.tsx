import type { PluginsPaneProps } from './PluginsPaneTypes'
import { PluginReviewPanel } from './PluginReviewPanel'
import { PluginRow } from './PluginRow'
import { PluginLogs } from './PluginLogs'

export type { PluginsPaneProps } from './PluginsPaneTypes'

export function PluginsPane(props: PluginsPaneProps) {
  const enabled = props.plugins.filter((plugin) => plugin.enabled).length
  const attention = props.plugins.filter((plugin) => Boolean(plugin.blockStatus?.blocked) || (plugin.enabled && plugin.requiresNativeExecution && !plugin.nativeExecutionApproved)).length
  return <section className="pane">
    <header className="pane-header"><div><h1>Plugins</h1><p>查看状态、打开常用入口，需要时再展开高级管理</p></div><div className="header-actions"><button type="button" className="primary" disabled={props.inspectingPlugin} onClick={props.onInspectPluginPackage}>{props.inspectingPlugin ? '读取中' : 'Install plugin'}</button></div></header>
    <div className="plugins-overview" aria-label="插件概览"><div><strong>{props.plugins.length}</strong><span>已安装</span></div><div><strong>{enabled}</strong><span>已启用</span></div><div className={attention ? 'attention' : ''}><strong>{attention}</strong><span>需要处理</span></div></div>
    <details className="plugin-install-disclosure"><summary><span className="plugin-disclosure-summary-copy"><strong>从 GitHub 导入</strong><span>适合仓库根目录包含 plugin.json 的插件</span></span></summary><div className="plugin-install-disclosure-body"><label className="field-label" htmlFor="plugin-github-repository-url">GitHub repository URL</label><div className="inline-form"><input id="plugin-github-repository-url" className="text-input" type="url" value={props.githubRepositoryUrl} placeholder="https://github.com/owner/repo" onChange={(event) => props.onChangeGithubRepositoryUrl(event.target.value)} /><button type="button" className="ghost" disabled={props.inspectingGithubPlugin || !props.githubRepositoryUrl.trim()} onClick={props.onInspectGithubPluginRepository}>{props.inspectingGithubPlugin ? '读取中' : 'Import from GitHub'}</button></div></div></details>
    <PluginReviewPanel review={props.pluginReview} installingPlugin={props.installingPlugin} onInstallReviewedPlugin={props.onInstallReviewedPlugin} onClearPluginReview={props.onClearPluginReview} />
    <div className="plugin-list">{props.plugins.length === 0 ? <div className="empty-chat">暂无插件</div> : props.plugins.map((plugin) => <PluginRow key={plugin.id} plugin={plugin} {...props} />)}</div>
    {props.status ? <div className="status-line">{props.status}</div> : null}<PluginLogs {...props} />
  </section>
}
