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
 *   resultText: string,
 *   details: Array<{ label: string, value: string }>
 * }} PluginCommandResultPreview
 */

const truncatePreview = (value, maxLength = 160) => {
  const text = String(value || '')
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const addDetail = (details, label, value) => {
  const text = String(value || '').trim()
  if (text) details.push({ label, value: truncatePreview(text, 240) })
}

const extractCreatorStudioDetails = (resultRecord) => {
  if (!isRecord(resultRecord)) return []
  const run = isRecord(resultRecord.run) ? resultRecord.run : null
  const artifacts = isRecord(run?.artifacts) ? run.artifacts : {}
  const imported = isRecord(resultRecord.imported) ? resultRecord.imported : null
  const importedPack = isRecord(imported?.pack) ? imported.pack : null
  const bundle = isRecord(resultRecord.bundle) ? resultRecord.bundle : null
  const details = []

  addDetail(details, 'Run', run?.runId)
  addDetail(details, '状态', run?.status)
  addDetail(details, '步骤', run?.currentStep)
  addDetail(details, '已导入 Pack', run?.importedPackId || importedPack?.id)
  addDetail(details, '输出目录', artifacts.outputDir || resultRecord.outputDir)
  addDetail(details, '导出包', artifacts.bundle || bundle?.path)
  return details
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
    resultText: truncatePreview(result?.result == null ? '' : JSON.stringify(result.result)),
    details: String(result?.pluginId || '') === 'openpet.creator-studio'
      ? extractCreatorStudioDetails(resultRecord)
      : []
  }
}
