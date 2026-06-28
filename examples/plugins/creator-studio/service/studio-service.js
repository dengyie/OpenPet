const http = require('http')
const fs = require('fs')
const path = require('path')
const { appendRunLog, listRuns, readRun, readRunLogs, updateRunStatus } = require('../lib/run-store')
const { runGenerationStep } = require('../lib/backend-runner')
const { repairActionFrameFromGeneratedImage } = require('../lib/action-frame-builder')
const { answerTaskQuestion, confirmTaskRun, draftTaskRun } = require('../lib/task-workflow')
const { sanitizeCreativeBrief } = require('../lib/openpet-prompt-builder')

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

const sendError = (response, error) => {
  const statusCode = /valid JSON|too large|invalid|remaining questions|not pending|required|requires|must/i.test(error.message || '')
    ? 400
    : 500
  sendJson(response, statusCode, { ok: false, error: error.message || 'Creator Studio service failed' })
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

const createPublicLogValue = ({ dataDir, value }) => {
  if (typeof value === 'string') return toPublicLogString({ dataDir, value })
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
      actionId: artifacts.actionFrames.actionId,
      name: artifacts.actionFrames.name,
      qa: toDataRelativePath({ dataDir, targetPath: artifacts.actionFrames.qa }),
      frameCount: artifacts.actionFrames.frameCount,
      frameWidth: artifacts.actionFrames.frameWidth,
      frameHeight: artifacts.actionFrames.frameHeight,
      triggerProposal: artifacts.actionFrames.triggerProposal || { type: 'unbound' }
    }
  }
  return publicArtifacts
}

const createPromptProvenance = ({ run }) => {
  const generatedImage = run.artifacts?.generatedImage
  const promptBuilder = generatedImage?.promptBuilder
  if (!generatedImage || !promptBuilder) return null
  const promptPreview = sanitizeCreativeBrief(generatedImage.prompt || promptBuilder.promptPreview || '')
  return {
    version: promptBuilder.version,
    mode: promptBuilder.mode,
    actionId: promptBuilder.actionId,
    sections: Array.isArray(promptBuilder.sections) ? promptBuilder.sections.slice() : [],
    warnings: Array.isArray(promptBuilder.warnings) ? promptBuilder.warnings.slice() : [],
    promptPreview
  }
}

const createImageUsageSummary = ({ run }) => {
  const generatedImage = run.artifacts?.generatedImage
  const usage = generatedImage?.usage
  const estimatedCostUsd = Number(usage?.estimatedCostUsd)
  if (!generatedImage || !Number.isFinite(estimatedCostUsd) || estimatedCostUsd < 0) return null
  return {
    provider: String(generatedImage.provider || run.backend || ''),
    model: String(generatedImage.model || ''),
    generatedAt: String(generatedImage.generatedAt || ''),
    outputCount: Array.isArray(generatedImage.outputs) ? generatedImage.outputs.length : 0,
    estimatedCostUsd,
    estimatedCostDisplayUsd: `$${estimatedCostUsd.toFixed(4)}`
  }
}

const getProviderCompatibilityNote = ({ model }) => {
  if (String(model || '').trim() === 'gpt-image-2') {
    return 'gpt-image-2 uses the host default image protocol; transparent-background behavior depends on the host/provider default negotiation.'
  }
  return 'OpenAI-compatible image requests ask for transparent output, but the final alpha behavior still depends on the active gateway and model.'
}

const createProviderSmokeGuidance = ({ run }) => {
  const backend = String(run.backend || run.input?.backend || '').trim().toLowerCase()
  if (!backend || backend === 'fixture') return null
  const status = String(run.backendStatus?.state || 'idle')
  const modelSnapshot = run.modelSnapshot || run.artifacts?.generatedImage?.modelSnapshot || {}
  const provider = String(modelSnapshot.provider || 'openai-compatible')
  const model = String(modelSnapshot.model || run.artifacts?.generatedImage?.model || '')
  const baseUrlHost = String(modelSnapshot.baseUrlHost || '')
  if (status === 'not_configured') {
    return {
      backend,
      provider,
      model,
      baseUrlHost,
      status,
      summary: 'This backend cannot run a real provider smoke check until the host-owned image settings are saved.',
      checklist: [
        'Open Control Center -> AI and save the Image Provider settings for this backend.',
        'Run the Image Provider health check before retrying this Creator Studio run.',
        'After the health check passes, re-run this task and review the generated transparent artifacts before import.'
      ],
      expectedEvidence: [
        'Backend recovery should clear the not_configured state and return a provider-backed run detail payload.',
        'The follow-up run should expose prompt provenance, generation usage, and reviewable output artifacts.'
      ],
      compatibilityNote: getProviderCompatibilityNote({ model })
    }
  }

  const outputEvidence = run.generationTask?.mode === 'single-action'
    ? 'Single-action runs should produce ordered transparent PNG frames plus action-frame-validation.json before import.'
    : 'Full-pet runs should produce a reviewable spritesheet.webp, bundle, and atlas QA before import.'

  return {
    backend,
    provider,
    model,
    baseUrlHost,
    status: status || 'ready',
    summary: 'This run used the host-owned image provider path. Re-run a real generation after a fresh provider health check before you trust the output for production assets.',
    checklist: [
      'Open Control Center -> AI and save the Image Provider settings for this backend.',
      'Run the Image Provider health check and confirm the selected model and gateway match this run.',
      'Generate one more non-fixture Creator Studio run and verify the transparent output artifacts before import.'
    ],
    expectedEvidence: [
      'Prompt provenance, generation usage, and backend state all reflect the same provider-backed run.',
      outputEvidence
    ],
    compatibilityNote: getProviderCompatibilityNote({ model })
  }
}

const createWizardState = ({ run }) => {
  const question = Array.isArray(run.generationTask?.questions) ? run.generationTask.questions[0] : null
  const triggerProposalSubmissions = Array.isArray(run.triggerProposalSubmissions) ? run.triggerProposalSubmissions : []
  if (run.importStatus === 'imported') {
    const nextStep = run.triggerProposalSubmissionError
      ? 'Host import completed. Review the imported pet pack, then resolve the pending trigger proposal submissions in OpenPet.'
      : (triggerProposalSubmissions.length > 0
          ? 'Host import completed. Review the imported pet pack and the submitted trigger proposals in OpenPet.'
          : 'Host import completed. Review the imported action or pet pack in OpenPet.')
    return {
      stage: 'imported',
      label: 'Imported',
      nextStep,
      taskStatus: String(run.taskStatus || ''),
      runStatus: String(run.status || ''),
      reviewStatus: String(run.reviewStatus || ''),
      importStatus: String(run.importStatus || ''),
      recommendedAction: null
    }
  }
  if (run.status === 'approved') {
    return {
      stage: 'approved',
      label: 'Approved',
      nextStep: run.artifacts?.actionFrames
        ? 'Run the Import Approved Action command in OpenPet to finish the host-owned import.'
        : 'Run the Import Approved Pet command in OpenPet to finish the host-owned import.',
      taskStatus: String(run.taskStatus || ''),
      runStatus: String(run.status || ''),
      reviewStatus: String(run.reviewStatus || ''),
      importStatus: String(run.importStatus || ''),
      recommendedAction: {
        kind: 'import',
        label: run.artifacts?.actionFrames ? 'Import Approved Action' : 'Import Approved Pet'
      }
    }
  }
  if (run.status === 'ready_for_review') {
    return {
      stage: 'review',
      label: 'Review Output',
      nextStep: run.artifacts?.actionFrames
        ? 'Review the generated frames, repair any bad frame, then approve the run.'
        : 'Review the generated output and approve the run when QA looks correct.',
      taskStatus: String(run.taskStatus || ''),
      runStatus: String(run.status || ''),
      reviewStatus: String(run.reviewStatus || ''),
      importStatus: String(run.importStatus || ''),
      recommendedAction: {
        kind: 'approve',
        label: 'Approve run'
      }
    }
  }
  if (run.status === 'failed') {
    return {
      stage: 'failed',
      label: 'Generation Failed',
      nextStep: 'Review the backend recovery guidance, fix the provider issue if needed, then retry generation.',
      taskStatus: String(run.taskStatus || ''),
      runStatus: String(run.status || ''),
      reviewStatus: String(run.reviewStatus || ''),
      importStatus: String(run.importStatus || ''),
      recommendedAction: {
        kind: 'retry_generate',
        label: 'Retry generation'
      }
    }
  }
  if (run.taskStatus === 'confirmed') {
    return {
      stage: 'confirmed',
      label: 'Ready To Generate',
      nextStep: 'Generate the action or pet output from this confirmed task.',
      taskStatus: String(run.taskStatus || ''),
      runStatus: String(run.status || ''),
      reviewStatus: String(run.reviewStatus || ''),
      importStatus: String(run.importStatus || ''),
      recommendedAction: {
        kind: 'generate',
        label: run.generationTask?.mode === 'full-pet' ? 'Generate pet' : 'Generate action'
      }
    }
  }
  if (run.taskStatus === 'needs_input') {
    const questionPrompt = question ? String(question.prompt || question.question || question.id || '') : ''
    return {
      stage: 'needs_input',
      label: 'Needs Input',
      nextStep: question
        ? `Answer the pending question: ${questionPrompt}`
        : 'Answer the remaining task questions before confirmation.',
      taskStatus: String(run.taskStatus || ''),
      runStatus: String(run.status || ''),
      reviewStatus: String(run.reviewStatus || ''),
      importStatus: String(run.importStatus || ''),
      pendingQuestion: question ? {
        id: String(question.id || ''),
        prompt: String(question.prompt || question.question || question.id || ''),
        options: Array.isArray(question.options) ? question.options.map((option) => String(option)) : []
      } : null,
      recommendedAction: {
        kind: 'answer_question',
        label: 'Answer pending question'
      }
    }
  }
  if (run.taskStatus === 'ready_for_confirmation') {
    return {
      stage: 'ready_for_confirmation',
      label: 'Ready For Confirmation',
      nextStep: 'Confirm the drafted task before generation.',
      taskStatus: String(run.taskStatus || ''),
      runStatus: String(run.status || ''),
      reviewStatus: String(run.reviewStatus || ''),
      importStatus: String(run.importStatus || ''),
      recommendedAction: {
        kind: 'confirm',
        label: 'Confirm task'
      }
    }
  }
  return {
    stage: 'draft',
    label: 'Draft',
    nextStep: 'Draft a task from the prompt to begin the Creator Studio workflow.',
    taskStatus: String(run.taskStatus || ''),
    runStatus: String(run.status || ''),
    reviewStatus: String(run.reviewStatus || ''),
    importStatus: String(run.importStatus || ''),
    recommendedAction: {
      kind: 'draft',
      label: 'Draft task'
    }
  }
}

const createBackendRecovery = ({ run }) => {
  const backendStatus = run.backendStatus || {}
  if (run.status !== 'failed' || run.currentStep !== 'generate') return null
  const backend = String(backendStatus.backend || run.backend || run.input?.backend || '')
  const state = String(backendStatus.state || 'failed')
  const message = String(backendStatus.message || run.error || '').trim()
  const summary = message
    ? `${message.split('.').find(Boolean) || message}.`.replace(/\.\.+$/, '.')
    : 'Generation failed.'
  const guidance = state === 'not_configured'
    ? 'Configure model settings in OpenPet before retrying this run.'
    : 'Review the provider error, adjust the host image settings if needed, then retry this run.'
  return {
    backend,
    state,
    canRetry: run.status === 'failed',
    actionLabel: 'Retry generation',
    summary,
    guidance
  }
}

const createPublicRun = ({ dataDir, run }) => ({
  ...run,
  artifacts: createPublicArtifacts({ dataDir, artifacts: run.artifacts || {} })
})

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
    actionId,
    name: actionFrames.name || action?.name || actionFrames.actionId,
    frameCount,
    frameWidth: actionFrames.frameWidth || 0,
    frameHeight: actionFrames.frameHeight || 0,
    qa: toDataRelativePath({ dataDir, targetPath: actionFrames.qa }),
    previewFrames,
    triggerProposal: actionFrames.triggerProposal || action?.triggerProposal || { type: 'unbound' },
    importStatus: run.importStatus || 'not-imported'
  }
}

const assertActionFrameQaPassed = ({ dataDir, actionFrames }) => {
  if (!actionFrames) return
  if (!actionFrames.qa) throw new Error('Action frame QA must pass before approval')
  const qaPath = assertPathInsideDataDir({
    dataDir,
    targetPath: actionFrames.qa,
    label: 'Action frame QA'
  })
  if (!fs.existsSync(qaPath)) throw new Error('Action frame QA must pass before approval')
  let qa
  try {
    qa = JSON.parse(fs.readFileSync(qaPath, 'utf-8'))
  } catch (_) {
    throw new Error('Action frame QA must be valid JSON before approval')
  }
  if (qa.ok !== true) throw new Error('Action frame QA must pass before approval')
  if (qa.actionId !== actionFrames.actionId) throw new Error('Action frame QA actionId must match before approval')
  if (Number(qa.frameCount) !== Number(actionFrames.frameCount)) {
    throw new Error('Action frame QA frameCount must match before approval')
  }
  if (Number(qa.frameWidth) !== Number(actionFrames.frameWidth)) {
    throw new Error('Action frame QA frameWidth must match before approval')
  }
  if (Number(qa.frameHeight) !== Number(actionFrames.frameHeight)) {
    throw new Error('Action frame QA frameHeight must match before approval')
  }
  const frames = Array.isArray(qa.frames) ? qa.frames : []
  if (frames.length !== Number(actionFrames.frameCount)) {
    throw new Error('Action frame QA frames must be complete before approval')
  }
  frames.forEach((frame, index) => {
    const expectedFileName = `${String(index + 1).padStart(4, '0')}.png`
    if (frame?.fileName !== expectedFileName || Number(frame.visiblePixels) < 1) {
      throw new Error('Action frame QA frames must be complete before approval')
    }
  })
}

const handlePost = async ({ request, response, dataDir, url }) => {
  try {
    const body = await readJsonBody(request)
    if (url.pathname === '/api/tasks/draft') {
      const output = draftTaskRun({ dataDir, payload: body })
      sendJson(response, 200, {
        ok: true,
        ...output,
        run: createPublicRun({ dataDir, run: output.run }),
        promptProvenance: createPromptProvenance({ run: output.run }),
        imageUsageSummary: createImageUsageSummary({ run: output.run }),
        wizardState: createWizardState({ run: output.run }),
        providerSmokeGuidance: createProviderSmokeGuidance({ run: output.run })
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
        run: createPublicRun({ dataDir, run: output.run }),
        promptProvenance: createPromptProvenance({ run: output.run }),
        imageUsageSummary: createImageUsageSummary({ run: output.run }),
        wizardState: createWizardState({ run: output.run }),
        providerSmokeGuidance: createProviderSmokeGuidance({ run: output.run })
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
        run: createPublicRun({ dataDir, run: output.run }),
        promptProvenance: createPromptProvenance({ run: output.run }),
        imageUsageSummary: createImageUsageSummary({ run: output.run }),
        wizardState: createWizardState({ run: output.run }),
        providerSmokeGuidance: createProviderSmokeGuidance({ run: output.run })
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
        promptProvenance: createPromptProvenance({ run: output.run }),
        imageUsageSummary: createImageUsageSummary({ run: output.run }),
        wizardState: createWizardState({ run: output.run }),
        providerSmokeGuidance: createProviderSmokeGuidance({ run: output.run }),
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
      assertActionFrameQaPassed({ dataDir, actionFrames: current.artifacts?.actionFrames })
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
        promptProvenance: createPromptProvenance({ run }),
        imageUsageSummary: createImageUsageSummary({ run }),
        wizardState: createWizardState({ run }),
        providerSmokeGuidance: createProviderSmokeGuidance({ run }),
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
          currentStep: 'review'
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
        promptProvenance: createPromptProvenance({ run: nextRun }),
        imageUsageSummary: createImageUsageSummary({ run: nextRun }),
        wizardState: createWizardState({ run: nextRun }),
        providerSmokeGuidance: createProviderSmokeGuidance({ run: nextRun }),
        repair: {
          actionId: repair.actionId,
          fileName: repair.fileName,
          frameIndex: repair.frameIndex,
          qa: toDataRelativePath({ dataDir, targetPath: repair.qaPath })
        }
      })
      return true
    }

    return false
  } catch (error) {
    sendError(response, error)
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
        actionReview: createActionReview({ dataDir, run }),
        promptProvenance: createPromptProvenance({ run }),
        imageUsageSummary: createImageUsageSummary({ run }),
        wizardState: createWizardState({ run }),
        backendRecovery: createBackendRecovery({ run }),
        providerSmokeGuidance: createProviderSmokeGuidance({ run })
      })
      return
    } catch (error) {
      sendJson(response, 404, { ok: false, error: error.message || 'Run not found' })
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
