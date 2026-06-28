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

const sanitizeCreatorStudioErrorText = (value = '') => {
  let sanitized = String(value || '')
  sanitized = sanitized.replace(/\bsk-[A-Za-z0-9_-]+\b/g, '[redacted-secret]')
  sanitized = sanitized.replace(/\b[A-Za-z0-9_-]*token[A-Za-z0-9_-]*\b/gi, '[redacted-token]')
  sanitized = sanitized.replace(/\[redacted-token\]\s*[:=]\s*[^\s,，。)]+/gi, '[redacted-token]=[redacted-secret]')
  sanitized = sanitized.replace(/https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/[^\s]*)?/gi, '[redacted-local-url]')
  sanitized = sanitized.replace(/\b(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/[^\s]*)?/gi, '[redacted-local-url]')
  sanitized = sanitized.replace(/\[::1\](?::\d+)?(?:\/[^\s]*)?/gi, '[redacted-local-url]')
  sanitized = sanitized.replace(/(?:\/Users|\/var|\/tmp|\/private|\/Volumes)\/[^\s,，。)]+/g, '[redacted-path]')
  sanitized = sanitized.replace(/[A-Za-z]:\\[^\s,，。)]+/g, '[redacted-path]')
  return sanitized.trim()
}

const addDetail = (details, label, value) => {
  const text = String(value || '').trim()
  if (text) details.push({ label, value: truncatePreview(text, 240) })
}

const sanitizeCreatorStudioResult = (resultRecord) => {
  if (!isRecord(resultRecord)) return resultRecord
  const triggerProposalSubmission = isRecord(resultRecord.triggerProposalSubmission)
    ? {
        ...resultRecord.triggerProposalSubmission,
        ...(typeof resultRecord.triggerProposalSubmission.error === 'string'
          ? { error: sanitizeCreatorStudioErrorText(resultRecord.triggerProposalSubmission.error) }
          : {})
      }
    : resultRecord.triggerProposalSubmission
  return {
    ...resultRecord,
    ...(triggerProposalSubmission !== undefined ? { triggerProposalSubmission } : {})
  }
}

const addCreatorStudioErrorDetail = (details, label, value) => {
  const text = sanitizeCreatorStudioErrorText(value)
  if (text) details.push({ label, value: truncatePreview(text, 240) })
}

const extractCreatorStudioDetails = (resultRecord, commandId = '') => {
  if (!isRecord(resultRecord)) return []
  const run = isRecord(resultRecord.run) ? resultRecord.run : null
  const artifacts = isRecord(run?.artifacts) ? run.artifacts : {}
  const actionFrames = isRecord(artifacts.actionFrames) ? artifacts.actionFrames : null
  const imported = isRecord(resultRecord.imported) ? resultRecord.imported : null
  const importedPack = isRecord(imported?.pack) ? imported.pack : null
  const importedResult = isRecord(imported?.result) ? imported.result : null
  const importedAction = isRecord(importedResult?.importedAction) ? importedResult.importedAction : null
  const bundle = isRecord(resultRecord.bundle) ? resultRecord.bundle : null
  const triggerProposalSubmission = isRecord(resultRecord.triggerProposalSubmission) ? resultRecord.triggerProposalSubmission : null
  const triggerProposal = isRecord(triggerProposalSubmission?.proposal) ? triggerProposalSubmission.proposal : null
  const details = []

  addDetail(details, 'Run', run?.runId)
  addDetail(details, '状态', run?.status)
  addDetail(details, '步骤', run?.currentStep)
  addDetail(details, '已导入 Pack', run?.importedPackId || importedPack?.id)
  addDetail(details, '已导入动作', run?.importedActionId || importedAction?.id)
  addDetail(details, '动作目录', actionFrames?.framesDir)
  if (triggerProposalSubmission) {
    const triggerProposalValue = triggerProposalSubmission.ok === true
      ? `已提交${triggerProposal?.id ? ` · ${triggerProposal.id}` : ''}`
      : `提交失败${triggerProposalSubmission.error ? ` · ${triggerProposalSubmission.error}` : ''}`
    if (triggerProposalSubmission.ok === true) {
      addDetail(details, '触发建议', triggerProposalValue)
    } else {
      addCreatorStudioErrorDetail(details, '触发建议', triggerProposalValue)
    }
  } else if (commandId === 'import-approved-action' && (run?.importedActionId || importedAction?.id || actionFrames?.actionId)) {
    addDetail(details, '触发建议', '未保存交接记录 · no trigger proposal handoff record was saved')
  }
  addDetail(details, '输出目录', artifacts.outputDir || resultRecord.outputDir)
  addDetail(details, '导出包', artifacts.bundle || bundle?.path)
  return details
}

/**
 * @param {PluginCommandRunResultViewState} result
 * @returns {PluginCommandResultPreview}
 */
export const toCommandResultPreview = (result) => {
  const pluginId = String(result?.pluginId || '')
  const isCreatorStudio = pluginId === 'openpet.creator-studio'
  const candidate = result?.result
  const resultRecord = candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    ? candidate
    : null
  const safeCreatorStudioResult = isCreatorStudio ? sanitizeCreatorStudioResult(resultRecord) : resultRecord
  const messageCandidate = typeof resultRecord?.message === 'string'
    ? resultRecord.message
    : typeof resultRecord?.petSay === 'string'
      ? resultRecord.petSay
      : result?.exitCode === 0
        ? '命令执行成功'
        : `命令退出码 ${result?.exitCode ?? 'unknown'}`
  return {
    pluginId,
    commandId: String(result?.commandId || ''),
    exitCode: Number.isFinite(Number(result?.exitCode)) ? Number(result.exitCode) : null,
    message: truncatePreview(String(messageCandidate || '')),
    stdout: truncatePreview(isCreatorStudio ? sanitizeCreatorStudioErrorText(result?.stdout) : String(result?.stdout || '')),
    stderr: truncatePreview(isCreatorStudio ? sanitizeCreatorStudioErrorText(result?.stderr) : String(result?.stderr || '')),
    resultText: truncatePreview(isCreatorStudio
      ? (safeCreatorStudioResult == null ? '' : JSON.stringify(safeCreatorStudioResult))
      : (result?.result == null ? '' : JSON.stringify(result.result))),
    details: isCreatorStudio
      ? extractCreatorStudioDetails(resultRecord, String(result?.commandId || ''))
      : []
  }
}
