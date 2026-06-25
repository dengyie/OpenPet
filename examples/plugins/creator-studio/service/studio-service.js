const http = require('http')
const fs = require('fs')
const path = require('path')
const { appendRunLog, listRuns, readRun, readRunLogs, updateRunStatus } = require('../lib/run-store')
const { runGenerationStep } = require('../lib/backend-runner')
const { repairActionFrameFromGeneratedImage } = require('../lib/action-frame-builder')
const { assertRunActionFrameQaPassed } = require('../lib/action-frame-qa')
const { sanitizeCreativeBrief } = require('../lib/openpet-prompt-builder')
const { answerTaskQuestion, confirmTaskRun, draftTaskRun } = require('../lib/task-workflow')

const SAFE_FRAME_FILE_PATTERN = /^\d{4}\.png$/

const sendJson = (response, statusCode, body) => {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}

const sendPng = (response, filePath) => {
  response.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' })
  fs.createReadStream(filePath).pipe(response)
}

const sendHtml = (response, dashboardPath) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(fs.readFileSync(dashboardPath, 'utf-8'))
}

const readJsonBody = (request, maxBytes = 64 * 1024) => new Promise((resolve, reject) => {
  let body = ''
  request.on('data', (chunk) => {
    body += chunk
    if (Buffer.byteLength(body) > maxBytes) {
      reject(new Error('Request body is too large'))
      request.destroy()
    }
  })
  request.on('end', () => {
    if (!body.trim()) {
      resolve({})
      return
    }
    try {
      resolve(JSON.parse(body))
    } catch (_) {
      reject(new Error('Request body must be valid JSON'))
    }
  })
  request.on('error', reject)
})

const sendError = (response, error, { dataDir } = {}) => {
  const statusCode = /valid JSON|too large|invalid|remaining questions|not pending|required|requires|must/i.test(error.message || '')
    ? 400
    : 500
  sendJson(response, statusCode, {
    ok: false,
    error: createPublicText({ dataDir, value: error.message || 'Creator Studio service failed' }),
    ...(error.run ? {
      run: createPublicRun({ dataDir, run: error.run }),
      actionReview: createActionReview({ dataDir, run: error.run })
    } : {})
  })
}

const assertPathInsideDataDir = ({ dataDir, targetPath, label }) => {
  const root = path.resolve(String(dataDir || ''))
  const target = path.resolve(String(targetPath || ''))
  const relative = path.relative(root, target)
  if (!root || !relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} must stay inside the Creator Studio data directory`)
  }
  const realRoot = fs.realpathSync.native(root)
  const realTarget = fs.realpathSync.native(fs.existsSync(target) ? target : path.dirname(target))
  const realRelative = path.relative(realRoot, realTarget)
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    throw new Error(`${label} must stay inside the Creator Studio data directory`)
  }
  return target
}

const toDataRelativePath = ({ dataDir, targetPath }) => {
  if (!dataDir || !targetPath) return ''
  const root = path.resolve(String(dataDir))
  const rawTarget = String(targetPath)
  const target = path.isAbsolute(rawTarget) ? path.resolve(rawTarget) : path.resolve(root, rawTarget)
  const relative = path.relative(root, target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return ''
  return relative.split(path.sep).join('/')
}

const toPublicLogString = ({ dataDir, value }) => {
  const text = String(value || '')
  if (!dataDir || !text) return text
  if (path.isAbsolute(text)) {
    const relative = toDataRelativePath({ dataDir, targetPath: text })
    if (relative) return relative
  }
  const normalizedRoot = path.resolve(String(dataDir)).split(path.sep).join('/')
  const normalizedText = text.replace(/\\/g, '/')
  return normalizedText.includes(normalizedRoot)
    ? normalizedText.split(normalizedRoot).join('OPENPET_DATA_DIR')
    : text
}

const createPublicText = ({ dataDir, value }) => sanitizeCreativeBrief(toPublicLogString({ dataDir, value }))

const createPublicLogValue = ({ dataDir, value }) => {
  if (typeof value === 'string') return createPublicText({ dataDir, value })
  if (Array.isArray(value)) return value.map((entry) => createPublicLogValue({ dataDir, value: entry }))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      createPublicLogValue({ dataDir, value: entry })
    ]))
  }
  return value
}

const createPublicLogEntry = ({ dataDir, entry }) => createPublicLogValue({ dataDir, value: entry })

const createPublicPromptPreview = ({ dataDir, promptPreview = {} }) => {
  const text = createPublicText({ dataDir, value: promptPreview.text || '' })
  return {
    text,
    truncated: Boolean(promptPreview.truncated),
    maxLength: Number(promptPreview.maxLength || text.length)
  }
}

const createPublicPromptBuilder = ({ dataDir, promptBuilder = {} }) => {
  const sections = Array.isArray(promptBuilder.sections)
    ? promptBuilder.sections.map((section) => createPublicText({ dataDir, value: section }))
    : []
  const warnings = Array.isArray(promptBuilder.warnings)
    ? promptBuilder.warnings.map((warning) => createPublicText({ dataDir, value: warning }))
    : []
  return {
    version: Number(promptBuilder.version || promptBuilder.promptBuilderVersion || 0),
    mode: createPublicText({ dataDir, value: promptBuilder.mode || '' }),
    actionId: createPublicText({ dataDir, value: promptBuilder.actionId || '' }),
    sections,
    warnings,
    promptPreview: createPublicPromptPreview({ dataDir, promptPreview: promptBuilder.promptPreview })
  }
}

const createPublicModelSnapshot = ({ dataDir, modelSnapshot = {} }) => {
  if (!modelSnapshot || typeof modelSnapshot !== 'object') return undefined
  return createPublicLogValue({ dataDir, value: modelSnapshot })
}

const createDeveloperPrompt = ({ dataDir, run }) => {
  const generatedImage = run.artifacts?.generatedImage || null
  const promptBuilder = generatedImage?.promptBuilder || null
  if (!promptBuilder) {
    return {
      available: false,
      source: 'host-model-bridge',
      message: 'Prompt provenance appears after a host-generated run completes.'
    }
  }
  return {
    available: true,
    source: 'host-model-bridge',
    modelSnapshot: createPublicModelSnapshot({ dataDir, modelSnapshot: generatedImage.modelSnapshot || run.modelSnapshot }),
    promptBuilder: createPublicPromptBuilder({ dataDir, promptBuilder }),
    promptPreview: createPublicPromptPreview({ dataDir, promptPreview: promptBuilder.promptPreview || {} })
  }
}

const createPublicRecovery = ({ dataDir, run }) => {
  const backendStatus = run.backendStatus || {}
  const canRetryGeneration = run.status === 'failed' && run.taskStatus === 'confirmed' && run.currentStep === 'generate'
  return {
    canRetryGeneration,
    actionLabel: canRetryGeneration ? 'Retry generation' : 'Generate action',
    backend: createPublicLogValue({ dataDir, value: backendStatus }),
    failureReason: createPublicText({ dataDir, value: run.error || backendStatus.message || '' })
  }
}

const WIZARD_STEPS = [
  { key: 'draft', label: 'Draft' },
  { key: 'follow-up', label: 'Follow-up' },
  { key: 'confirm', label: 'Confirm' },
  { key: 'generate', label: 'Generate' },
  { key: 'review', label: 'Review' },
  { key: 'import', label: 'Import' }
]

const createWizardSteps = (phase) => {
  const statusByKey = {
    draft: 'upcoming',
    'follow-up': 'upcoming',
    confirm: 'upcoming',
    generate: 'upcoming',
    review: 'upcoming',
    import: 'upcoming'
  }

  if (phase === 'draft') {
    statusByKey.draft = 'current'
  } else if (phase === 'needs-input') {
    statusByKey.draft = 'complete'
    statusByKey['follow-up'] = 'current'
  } else if (phase === 'ready-for-confirmation') {
    statusByKey.draft = 'complete'
    statusByKey['follow-up'] = 'complete'
    statusByKey.confirm = 'current'
  } else if (phase === 'ready-to-generate') {
    statusByKey.draft = 'complete'
    statusByKey['follow-up'] = 'complete'
    statusByKey.confirm = 'complete'
    statusByKey.generate = 'current'
  } else if (phase === 'failed') {
    statusByKey.draft = 'complete'
    statusByKey['follow-up'] = 'complete'
    statusByKey.confirm = 'complete'
    statusByKey.generate = 'blocked'
  } else if (phase === 'ready-for-review') {
    statusByKey.draft = 'complete'
    statusByKey['follow-up'] = 'complete'
    statusByKey.confirm = 'complete'
    statusByKey.generate = 'complete'
    statusByKey.review = 'current'
  } else if (phase === 'approved') {
    statusByKey.draft = 'complete'
    statusByKey['follow-up'] = 'complete'
    statusByKey.confirm = 'complete'
    statusByKey.generate = 'complete'
    statusByKey.review = 'complete'
    statusByKey.import = 'blocked'
  } else if (phase === 'imported') {
    statusByKey.draft = 'complete'
    statusByKey['follow-up'] = 'complete'
    statusByKey.confirm = 'complete'
    statusByKey.generate = 'complete'
    statusByKey.review = 'complete'
    statusByKey.import = 'complete'
  }

  return WIZARD_STEPS.map((step) => ({
    ...step,
    status: statusByKey[step.key] || 'upcoming'
  }))
}

const createWizardState = ({ dataDir, run }) => {
  const backend = String(run.backend || run.input?.backend || 'fixture')
  const prompt = run.input?.originalPrompt || run.input?.prompt || ''
  const taskStatus = String(run.taskStatus || '')
  const status = String(run.status || 'draft')
  let phase = 'draft'
  let summary = 'Draft a task to create a run snapshot.'
  let nextStepLabel = 'Draft task'
  let nextStepReason = 'Start from a natural-language action prompt to draft a Creator Studio task.'
  let nextStepBlocked = false

  if (taskStatus === 'needs_input') {
    phase = 'needs-input'
    summary = 'Answer the pending follow-up question to unlock task confirmation.'
    nextStepLabel = 'Answer follow-up'
    nextStepReason = 'Choose one of the pending follow-up answers in the dashboard.'
  } else if (taskStatus === 'ready_for_confirmation') {
    phase = 'ready-for-confirmation'
    summary = 'Confirm the drafted task before generation.'
    nextStepLabel = 'Confirm task'
    nextStepReason = 'The task is drafted. Confirm it to unlock generation.'
  } else if (status === 'failed') {
    phase = 'failed'
    summary = 'Retry generation on this same run after reviewing the failure details.'
    nextStepLabel = 'Retry generation'
    nextStepReason = 'Use the same run to retry generation after checking the failure details.'
  } else if (status === 'ready_for_review') {
    phase = 'ready-for-review'
    summary = 'Review QA artifacts and approve the run for host-owned import.'
    nextStepLabel = 'Approve run'
    nextStepReason = 'Review the QA and approve this run to unlock host-owned import.'
  } else if (status === 'approved') {
    phase = 'approved'
    summary = 'Run the host-owned import command from Control Center -> Plugins.'
    nextStepLabel = run.artifacts?.actionFrames ? 'Import Approved Action' : 'Import Approved Pet'
    nextStepReason = 'Use Control Center -> Plugins to run the host-owned import command.'
    nextStepBlocked = true
  } else if (status === 'imported') {
    phase = 'imported'
    summary = 'Host-owned import is complete. Review the imported result inside OpenPet.'
    nextStepLabel = 'Review imported result'
    nextStepReason = 'The dashboard cannot apply post-import host actions; review the imported result inside OpenPet.'
    nextStepBlocked = true
  } else if (taskStatus === 'confirmed') {
    phase = 'ready-to-generate'
    summary = 'Run Generate action to start host-owned generation.'
    nextStepLabel = 'Generate action'
    nextStepReason = 'Generation is unlocked for this confirmed task.'
  }

  return {
    phase: createPublicText({ dataDir, value: phase }),
    summary: createPublicText({ dataDir, value: summary }),
    prompt: createPublicText({ dataDir, value: prompt }),
    backend: createPublicText({ dataDir, value: backend }),
    taskStatus: createPublicText({ dataDir, value: taskStatus || 'unknown' }),
    currentStep: createPublicText({ dataDir, value: run.currentStep || 'draft' }),
    reviewStatus: createPublicText({ dataDir, value: run.reviewStatus || 'pending' }),
    importStatus: createPublicText({ dataDir, value: run.importStatus || 'not-imported' }),
    steps: createWizardSteps(phase),
    nextStep: {
      label: createPublicText({ dataDir, value: nextStepLabel }),
      reason: createPublicText({ dataDir, value: nextStepReason }),
      blocked: Boolean(nextStepBlocked)
    }
  }
}

const createPublicTextList = ({ dataDir, values = [] }) => (
  Array.isArray(values)
    ? values.map((value) => createPublicText({ dataDir, value })).filter(Boolean)
    : []
)

const resolveImportCommand = (run) => (
  run.artifacts?.actionFrames
    ? 'import-approved-action'
    : 'import-approved-pet'
)

const createWorkflowGuidance = ({ dataDir, run }) => {
  const backend = String(run.backend || run.input?.backend || 'fixture')
  const modelSnapshot = run.modelSnapshot || run.artifacts?.generatedImage?.modelSnapshot || {}
  const providerLabel = [modelSnapshot.provider, modelSnapshot.model].filter(Boolean).join(' / ')
  const usesProviderRun = backend !== 'fixture'
  const generationSummary = usesProviderRun
    ? (
        ['ready_for_review', 'approved', 'imported'].includes(run.status)
          ? `This run already used the host-owned ${backend} image Provider${providerLabel ? ` (${providerLabel})` : ''}.`
          : run.status === 'failed'
            ? `This run failed while using the host-owned ${backend} image Provider${providerLabel ? ` (${providerLabel})` : ''}.`
            : `This run will use the host-owned ${backend} image Provider when generation starts${providerLabel ? ` (${providerLabel})` : ''}.`
      )
    : 'Fixture output is for workflow QA only and does not validate real host image Provider quality.'
  const smokeChecklist = usesProviderRun
    ? [
        'Use Control Center -> AI -> Test saved image Provider before production smoke runs.',
        'The dashboard service cannot run a live provider health check because bridge tokens stay command-scoped.',
        run.status === 'failed'
          ? 'Fix the provider readiness issue, then use Retry generation on this same run.'
          : 'Review QA, prompt provenance, and generated frames before claiming production asset quality.'
      ]
    : [
        'Use fixture runs to validate task flow, QA, and import handoff wiring.',
        'Switch to cloud or local before claiming production-ready generated assets.',
        'Use Control Center -> AI -> Test saved image Provider before production smoke runs.'
      ]
  const hasActionFrames = Boolean(run.artifacts?.actionFrames)
  const importCommand = resolveImportCommand(run)
  let importStatus = 'not-ready'
  let importSummary = hasActionFrames
    ? 'Approve the run before using Import Approved Action from Control Center -> Plugins.'
    : 'Approve the run before using Import Approved Pet from Control Center -> Plugins.'
  let triggerProposalStatus = hasActionFrames ? 'not-attempted' : 'not-applicable'
  let triggerProposalSummary = hasActionFrames
    ? 'Trigger proposal handoff runs during Import Approved Action.'
    : 'This run does not create an action-frame trigger proposal handoff.'

  if (run.status === 'approved') {
    importStatus = 'ready'
    importSummary = importCommand === 'import-approved-action'
      ? 'Run Import Approved Action from Control Center -> Plugins to complete host-owned action import.'
      : 'Run Import Approved Pet from Control Center -> Plugins to complete host-owned pet import.'
  } else if (run.status === 'imported') {
    importStatus = 'imported'
    importSummary = importCommand === 'import-approved-action'
      ? `Imported action ${run.importedActionId || run.artifacts?.actionFrames?.actionId || ''}.`
      : 'Imported pet-pack output through the host-owned bridge.'
    if (hasActionFrames) {
      if (run.triggerProposalSubmission?.ok) {
        triggerProposalStatus = 'submitted'
        triggerProposalSummary = `Trigger proposal handoff succeeded. Review it in Actions -> Trigger Proposal Inbox${run.triggerProposalSubmission?.proposal?.id ? ` (${run.triggerProposalSubmission.proposal.id})` : ''}.`
      } else if (run.triggerProposalSubmission && run.triggerProposalSubmission.ok === false) {
        triggerProposalStatus = 'failed'
        triggerProposalSummary = 'Action import succeeded, but trigger proposal handoff failed. Re-run import or inspect the command output before applying trigger rules.'
      }
    }
  } else if (run.status === 'ready_for_review') {
    importStatus = 'review-required'
    importSummary = hasActionFrames
      ? 'Review QA and approve the run before host-owned action import.'
      : 'Review the generated pet-pack output and approve the run before host-owned pet import.'
  }

  return {
    generation: {
      backend: createPublicText({ dataDir, value: backend }),
      mode: usesProviderRun ? 'host-provider' : 'fixture-preview',
      summary: createPublicText({ dataDir, value: generationSummary }),
      smokeChecklist: createPublicTextList({ dataDir, values: smokeChecklist })
    },
    import: {
      status: createPublicText({ dataDir, value: importStatus }),
      command: createPublicText({ dataDir, value: importCommand }),
      summary: createPublicText({ dataDir, value: importSummary }),
      importedActionId: createPublicText({ dataDir, value: run.importedActionId || '' }),
      triggerProposalStatus: createPublicText({ dataDir, value: triggerProposalStatus }),
      triggerProposalSummary: createPublicText({ dataDir, value: triggerProposalSummary })
    }
  }
}

const createPublicArtifacts = ({ dataDir, artifacts = {} }) => {
  const publicArtifacts = {}
  if (artifacts.outputDir) publicArtifacts.outputDir = toDataRelativePath({ dataDir, targetPath: artifacts.outputDir })
  if (artifacts.petJson) publicArtifacts.petJson = toDataRelativePath({ dataDir, targetPath: artifacts.petJson })
  if (artifacts.spritesheet) publicArtifacts.spritesheet = toDataRelativePath({ dataDir, targetPath: artifacts.spritesheet })
  if (artifacts.bundle) publicArtifacts.bundle = toDataRelativePath({ dataDir, targetPath: artifacts.bundle })
  if (artifacts.qa) publicArtifacts.qa = toDataRelativePath({ dataDir, targetPath: artifacts.qa })
  if (artifacts.sourceImageQa) {
    publicArtifacts.sourceImageQa = toDataRelativePath({ dataDir, targetPath: artifacts.sourceImageQa })
  }
  if (artifacts.actionTaskQa) {
    publicArtifacts.actionTaskQa = toDataRelativePath({ dataDir, targetPath: artifacts.actionTaskQa })
  }
  if (artifacts.actionFrames) {
    publicArtifacts.actionFrames = {
      actionId: createPublicText({ dataDir, value: artifacts.actionFrames.actionId }),
      name: createPublicText({ dataDir, value: artifacts.actionFrames.name }),
      qa: toDataRelativePath({ dataDir, targetPath: artifacts.actionFrames.qa }),
      contactSheet: toDataRelativePath({ dataDir, targetPath: artifacts.actionFrames.contactSheet }),
      frameCount: artifacts.actionFrames.frameCount,
      frameWidth: artifacts.actionFrames.frameWidth,
      frameHeight: artifacts.actionFrames.frameHeight,
      triggerProposal: createPublicLogValue({ dataDir, value: artifacts.actionFrames.triggerProposal || { type: 'unbound' } })
    }
  }
  return publicArtifacts
}

const createPublicRun = ({ dataDir, run }) => {
  const publicRun = createPublicLogValue({ dataDir, value: run })
  return {
    ...publicRun,
    artifacts: createPublicArtifacts({ dataDir, artifacts: run.artifacts || {} }),
    developerPrompt: createDeveloperPrompt({ dataDir, run }),
    recovery: createPublicRecovery({ dataDir, run }),
    wizardState: createWizardState({ dataDir, run }),
    workflowGuidance: createWorkflowGuidance({ dataDir, run })
  }
}

const getActionFramePath = ({ dataDir, run, actionId, fileName }) => {
  const actionFrames = run.artifacts?.actionFrames
  if (!actionFrames || actionFrames.actionId !== actionId) throw new Error('Action frame preview is not available')
  if (!SAFE_FRAME_FILE_PATTERN.test(fileName || '')) throw new Error('Action frame file name is invalid')
  const framesDir = assertPathInsideDataDir({
    dataDir,
    targetPath: actionFrames.framesDir,
    label: 'Action frames directory'
  })
  const framePath = assertPathInsideDataDir({
    dataDir,
    targetPath: path.join(framesDir, fileName),
    label: 'Action frame preview'
  })
  if (!fs.existsSync(framePath)) throw new Error('Action frame preview is missing')
  return framePath
}

const getActionContactSheetPath = ({ dataDir, run, actionId }) => {
  const actionFrames = run.artifacts?.actionFrames
  if (!actionFrames || actionFrames.actionId !== actionId) throw new Error('Action contact sheet is not available')
  const contactSheetPath = assertPathInsideDataDir({
    dataDir,
    targetPath: actionFrames.contactSheet,
    label: 'Action contact sheet'
  })
  if (!fs.existsSync(contactSheetPath)) throw new Error('Action contact sheet is missing')
  return contactSheetPath
}

const createActionReview = ({ dataDir, run }) => {
  const actionFrames = run.artifacts?.actionFrames
  const action = Array.isArray(run.generationTask?.actions) ? run.generationTask.actions[0] : null
  if (!actionFrames) return null
  const actionId = actionFrames.actionId
  const frameCount = actionFrames.frameCount || action?.frameCount || 0
  const previewFrames = Array.from({ length: Math.min(32, Math.max(0, Number(frameCount) || 0)) }, (_entry, index) => {
    const fileName = `${String(index + 1).padStart(4, '0')}.png`
    return {
      fileName,
      width: actionFrames.frameWidth || 0,
      height: actionFrames.frameHeight || 0,
      url: `/api/runs/${encodeURIComponent(run.runId)}/action-frames/${encodeURIComponent(actionId)}/${fileName}`
    }
  })
  return {
    actionId: createPublicText({ dataDir, value: actionId }),
    name: createPublicText({ dataDir, value: actionFrames.name || action?.name || actionFrames.actionId }),
    frameCount,
    frameWidth: actionFrames.frameWidth || 0,
    frameHeight: actionFrames.frameHeight || 0,
    qa: toDataRelativePath({ dataDir, targetPath: actionFrames.qa }),
    contactSheet: toDataRelativePath({ dataDir, targetPath: actionFrames.contactSheet }),
    contactSheetUrl: actionFrames.contactSheet
      ? `/api/runs/${encodeURIComponent(run.runId)}/action-frames/${encodeURIComponent(actionId)}/contact-sheet.png`
      : '',
    previewFrames,
    triggerProposal: createPublicLogValue({ dataDir, value: actionFrames.triggerProposal || action?.triggerProposal || { type: 'unbound' } }),
    importStatus: run.importStatus || 'not-imported'
  }
}

const handlePost = async ({ request, response, dataDir, url }) => {
  try {
    const body = await readJsonBody(request)
    if (url.pathname === '/api/tasks/draft') {
      const output = draftTaskRun({ dataDir, payload: body })
      sendJson(response, 200, {
        ok: true,
        ...output,
        run: createPublicRun({ dataDir, run: output.run })
      })
      return true
    }

    const answerMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/questions\/([^/]+)\/answer$/)
    if (answerMatch) {
      const output = answerTaskQuestion({
        dataDir,
        runId: decodeURIComponent(answerMatch[1]),
        questionId: decodeURIComponent(answerMatch[2]),
        answer: body.answer
      })
      sendJson(response, 200, {
        ok: true,
        ...output,
        run: createPublicRun({ dataDir, run: output.run })
      })
      return true
    }

    const confirmMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/confirm$/)
    if (confirmMatch) {
      const output = confirmTaskRun({
        dataDir,
        runId: decodeURIComponent(confirmMatch[1])
      })
      sendJson(response, 200, {
        ok: true,
        ...output,
        run: createPublicRun({ dataDir, run: output.run })
      })
      return true
    }

    const generateMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/generate-action$/)
    if (generateMatch) {
      const output = await runGenerationStep({
        dataDir,
        runId: decodeURIComponent(generateMatch[1])
      })
      sendJson(response, 200, {
        ok: true,
        run: createPublicRun({ dataDir, run: output.run }),
        actionReview: createActionReview({ dataDir, run: output.run }),
        outputDir: toDataRelativePath({ dataDir, targetPath: output.outputDir })
      })
      return true
    }

    const approveMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/approve$/)
    if (approveMatch) {
      const runId = decodeURIComponent(approveMatch[1])
      const current = readRun({ dataDir, runId })
      if (current.status !== 'ready_for_review') {
        throw new Error(`Run must be ready_for_review before approval: ${current.status}`)
      }
      assertRunActionFrameQaPassed({ dataDir, run: current, operation: 'approval' })
      const run = updateRunStatus({
        dataDir,
        runId,
        status: 'approved',
        patch: { reviewStatus: 'approved', currentStep: 'approved' }
      })
      appendRunLog({
        dataDir,
        runId,
        level: 'info',
        event: 'run.approved',
        message: `Approved run ${runId}`,
        data: { runId }
      })
      sendJson(response, 200, {
        ok: true,
        run: createPublicRun({ dataDir, run }),
        actionReview: createActionReview({ dataDir, run }),
        importCommand: run.artifacts?.actionFrames ? 'import-approved-action' : 'import-approved-pet'
      })
      return true
    }

    const repairFrameMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/action-frames\/([^/]+)\/([^/]+)\/repair$/)
    if (repairFrameMatch) {
      const runId = decodeURIComponent(repairFrameMatch[1])
      const actionId = decodeURIComponent(repairFrameMatch[2])
      const fileName = decodeURIComponent(repairFrameMatch[3])
      const run = readRun({ dataDir, runId })
      const actionFrames = run.artifacts?.actionFrames
      const action = Array.isArray(run.generationTask?.actions)
        ? run.generationTask.actions.find((candidate) => candidate.actionId === actionId)
        : null
      if (run.status !== 'ready_for_review') {
        throw new Error(`Action frame repair requires a reviewable run: ${run.status}`)
      }
      if (!actionFrames || actionFrames.actionId !== actionId || !action) {
        throw new Error('Action frame repair is not available')
      }
      if (!run.artifacts?.generatedImage) {
        throw new Error('Action frame repair requires generated image provenance')
      }
      const repair = await repairActionFrameFromGeneratedImage({
        dataDir,
        generationResult: run.artifacts.generatedImage,
        action,
        outputFramesDir: actionFrames.framesDir,
        qaDir: actionFrames.qa ? path.dirname(actionFrames.qa) : path.join(dataDir, 'runs', runId, 'qa'),
        fileName
      })
      const nextRun = updateRunStatus({
        dataDir,
        runId,
        status: run.status,
        patch: {
          currentStep: 'review',
          artifacts: {
            ...run.artifacts,
            actionFrames: {
              ...actionFrames,
              contactSheet: repair.contactSheetPath
            }
          }
        }
      })
      appendRunLog({
        dataDir,
        runId,
        level: 'info',
        event: 'action-frame.repaired',
        message: `Repaired action frame ${fileName}`,
        data: {
          actionId,
          fileName
        }
      })
      sendJson(response, 200, {
        ok: true,
        run: createPublicRun({ dataDir, run: nextRun }),
        actionReview: createActionReview({ dataDir, run: nextRun }),
        repair: {
          actionId: repair.actionId,
          fileName: repair.fileName,
          frameIndex: repair.frameIndex,
          contactSheet: toDataRelativePath({ dataDir, targetPath: repair.contactSheetPath }),
          qa: toDataRelativePath({ dataDir, targetPath: repair.qaPath })
        }
      })
      return true
    }

    return false
  } catch (error) {
    sendError(response, error, { dataDir })
    return true
  }
}

const createCreatorStudioServer = ({ dataDir, dashboardPath }) => http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1')
  if (url.pathname === '/health') {
    sendJson(response, 200, { ok: true, service: 'creator-studio' })
    return
  }
  if (request.method === 'POST') {
    if (await handlePost({ request, response, dataDir, url })) return
  }
  if (url.pathname === '/api/runs') {
    sendJson(response, 200, { ok: true, runs: listRuns({ dataDir }).map((run) => createPublicRun({ dataDir, run })) })
    return
  }

  const runMatch = url.pathname.match(/^\/api\/runs\/([^/]+)(\/logs)?$/)
  if (runMatch) {
    const runId = decodeURIComponent(runMatch[1])
    try {
      if (runMatch[2] === '/logs') {
        sendJson(response, 200, {
          ok: true,
          runId,
          logs: readRunLogs({ dataDir, runId }).map((entry) => createPublicLogEntry({ dataDir, entry }))
        })
        return
      }
      const run = readRun({ dataDir, runId })
      sendJson(response, 200, {
        ok: true,
        run: createPublicRun({ dataDir, run }),
        actionReview: createActionReview({ dataDir, run })
      })
      return
    } catch (error) {
      sendJson(response, 404, { ok: false, error: error.message || 'Run not found' })
      return
    }
  }

  const contactSheetMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/action-frames\/([^/]+)\/contact-sheet\.png$/)
  if (contactSheetMatch) {
    try {
      const run = readRun({ dataDir, runId: decodeURIComponent(contactSheetMatch[1]) })
      const contactSheetPath = getActionContactSheetPath({
        dataDir,
        run,
        actionId: decodeURIComponent(contactSheetMatch[2])
      })
      sendPng(response, contactSheetPath)
      return
    } catch (error) {
      sendJson(response, 404, { ok: false, error: error.message || 'Action contact sheet not found' })
      return
    }
  }

  const actionFrameMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/action-frames\/([^/]+)\/([^/]+)$/)
  if (actionFrameMatch) {
    try {
      const run = readRun({ dataDir, runId: decodeURIComponent(actionFrameMatch[1]) })
      const framePath = getActionFramePath({
        dataDir,
        run,
        actionId: decodeURIComponent(actionFrameMatch[2]),
        fileName: decodeURIComponent(actionFrameMatch[3])
      })
      sendPng(response, framePath)
      return
    } catch (error) {
      sendJson(response, 404, { ok: false, error: error.message || 'Action frame preview not found' })
      return
    }
  }

  sendHtml(response, dashboardPath)
})

const startCreatorStudioService = () => {
  const port = Number(process.env.OPENPET_CREATOR_STUDIO_PORT || 8794)
  const dashboardPath = path.join(__dirname, '..', 'web', 'dashboard', 'index.html')
  const server = createCreatorStudioServer({
    dataDir: process.env.OPENPET_DATA_DIR || '',
    dashboardPath
  })
  server.listen(port, '127.0.0.1', () => {
    console.log(`Creator Studio dashboard listening on http://127.0.0.1:${port}`)
  })
  const shutdown = () => server.close(() => process.exit(0))
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
  return server
}

if (require.main === module) {
  startCreatorStudioService()
}

module.exports = {
  createCreatorStudioServer,
  startCreatorStudioService
}
