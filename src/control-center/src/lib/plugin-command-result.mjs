/**
 * @typedef {import('../../../shared/openpet-contracts').PluginCommandRunResultViewState} PluginCommandRunResultViewState
 */

/**
 * @typedef {{
 *   pluginId: string,
 *   commandId: string,
 *   exitCode: number | null,
 *   message: string,
 *   stdout: string,
 *   stderr: string,
 *   resultText: string
 * }} PluginCommandResultPreview
 */

const truncatePreview = (value, maxLength = 160) => {
  const text = String(value || '')
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

/**
 * @param {PluginCommandRunResultViewState} result
 * @returns {PluginCommandResultPreview}
 */
export const toCommandResultPreview = (result) => {
  const candidate = result?.result
  const resultRecord = candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    ? candidate
    : null
  const messageCandidate = typeof resultRecord?.message === 'string'
    ? resultRecord.message
    : typeof resultRecord?.petSay === 'string'
      ? resultRecord.petSay
      : result?.exitCode === 0
        ? '命令执行成功'
        : `命令退出码 ${result?.exitCode ?? 'unknown'}`
  return {
    pluginId: String(result?.pluginId || ''),
    commandId: String(result?.commandId || ''),
    exitCode: Number.isFinite(Number(result?.exitCode)) ? Number(result.exitCode) : null,
    message: truncatePreview(String(messageCandidate || '')),
    stdout: truncatePreview(String(result?.stdout || '')),
    stderr: truncatePreview(String(result?.stderr || '')),
    resultText: truncatePreview(result?.result == null ? '' : JSON.stringify(result.result))
  }
}
