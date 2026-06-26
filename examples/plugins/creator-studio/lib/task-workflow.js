const { draftGenerationTask } = require('./conversation-wizard')
const { appendRunLog, createRun, readRun, writeRun } = require('./run-store')

const TRIGGER_ANSWERS = {
  manual: { type: 'manual', notes: 'User selected manual trigger.' },
  click: { type: 'click', binding: 'clickAction', notes: 'User selected click trigger.' },
  random: { type: 'random', notes: 'User selected random trigger.' },
  state: { type: 'state', notes: 'User selected state trigger.' },
  event: { type: 'event', notes: 'User selected event trigger.' },
  unbound: { type: 'unbound', notes: 'User selected unbound trigger.' }
}

const getTaskStatus = (generationTask) => {
  if (!generationTask) return 'not_started'
  return generationTask.questions?.length > 0 ? 'needs_input' : 'ready_for_confirmation'
}

const draftTaskRun = ({ dataDir, payload = {}, now = () => new Date().toISOString() }) => {
  const prompt = payload.originalPrompt || payload.prompt || ''
  const draft = payload.generationTask
    ? { originalPrompt: String(prompt || '').trim(), generationTask: payload.generationTask }
    : draftGenerationTask({ prompt, context: payload.context || {} })
  const run = createRun({
    dataDir,
    input: {
      ...payload,
      prompt: draft.originalPrompt || String(payload.prompt || ''),
      originalPrompt: draft.originalPrompt,
      generationTask: draft.generationTask,
      backend: payload.backend || 'fixture'
    },
    now
  })
  const taskStatus = getTaskStatus(run.generationTask)
  const nextRun = writeRun({
    dataDir,
    run: {
      ...run,
      taskStatus,
      currentStep: taskStatus === 'needs_input' ? 'task_questions' : 'task_preview'
    }
  })
  appendRunLog({
    dataDir,
    runId: nextRun.runId,
    level: 'info',
    event: 'task.drafted',
    message: 'Creator Studio task drafted',
    data: { taskStatus, mode: nextRun.generationTask.mode },
    now
  })
  return { run: nextRun }
}

const findQuestion = ({ run, questionId }) => {
  const question = (run.generationTask?.questions || []).find((candidate) => candidate.id === questionId)
  if (!question) throw new Error(`Creator Studio question is not pending: ${questionId}`)
  return question
}

const normalizeAnswer = ({ question, answer }) => {
  const normalized = String(answer || '').trim()
  if (!question.options.includes(normalized)) {
    throw new Error(`Creator Studio answer is invalid for ${question.id}: ${normalized}`)
  }
  return normalized
}

const applyTriggerAnswer = ({ generationTask, answer }) => ({
  ...generationTask,
  actions: generationTask.actions.map((action, index) => index === 0
    ? { ...action, triggerProposal: TRIGGER_ANSWERS[answer] }
    : action),
  questions: generationTask.questions.filter((question) => question.id !== 'trigger')
})

const updateTaskDraft = ({
  dataDir,
  runId,
  updates = {},
  now = () => new Date().toISOString()
}) => {
  const run = readRun({ dataDir, runId })
  if (!run.generationTask) throw new Error('Creator Studio run has no generation task')
  if (run.taskStatus === 'confirmed') throw new Error('Confirmed Creator Studio tasks cannot be edited')
  const currentAction = Array.isArray(run.generationTask.actions) ? run.generationTask.actions[0] : null
  if (!currentAction) throw new Error('Creator Studio task has no editable action')
  const triggerType = String(updates.triggerType || currentAction.triggerProposal?.type || 'unbound').trim()
  const triggerProposal = TRIGGER_ANSWERS[triggerType]
  if (!triggerProposal) throw new Error(`Creator Studio trigger type is invalid: ${triggerType}`)
  const actionName = String(updates.actionName || currentAction.name || '').trim() || currentAction.name
  const motionPrompt = String(updates.motionPrompt || currentAction.motionPrompt || '').trim() || currentAction.motionPrompt
  const editedAt = now()
  const generationTask = {
    ...run.generationTask,
    actions: run.generationTask.actions.map((action, index) => index === 0
      ? {
          ...action,
          name: actionName,
          motionPrompt,
          loop: Boolean(updates.loop),
          triggerProposal
        }
      : action),
    questions: run.generationTask.questions.filter((question) => question.id !== 'trigger')
  }
  const taskStatus = getTaskStatus(generationTask)
  const nextRun = writeRun({
    dataDir,
    run: {
      ...run,
      generationTask,
      taskStatus,
      currentStep: taskStatus === 'needs_input' ? 'task_questions' : 'task_preview',
      updatedAt: editedAt
    }
  })
  appendRunLog({
    dataDir,
    runId,
    level: 'info',
    event: 'task.updated',
    message: 'Creator Studio task updated from dashboard edit controls',
    data: {
      taskStatus,
      triggerType,
      loop: Boolean(updates.loop)
    },
    now: () => editedAt
  })
  return { run: nextRun }
}

const answerTaskQuestion = ({
  dataDir,
  runId,
  questionId,
  answer,
  now = () => new Date().toISOString()
}) => {
  const run = readRun({ dataDir, runId })
  if (!run.generationTask) throw new Error('Creator Studio run has no generation task')
  const question = findQuestion({ run, questionId })
  const normalizedAnswer = normalizeAnswer({ question, answer })
  const answeredAt = now()
  const generationTask = questionId === 'trigger'
    ? applyTriggerAnswer({ generationTask: run.generationTask, answer: normalizedAnswer })
    : {
        ...run.generationTask,
        questions: run.generationTask.questions.filter((candidate) => candidate.id !== questionId)
      }
  const taskStatus = getTaskStatus(generationTask)
  const nextRun = writeRun({
    dataDir,
    run: {
      ...run,
      generationTask,
      taskStatus,
      currentStep: taskStatus === 'needs_input' ? 'task_questions' : 'task_preview',
      updatedAt: answeredAt,
      conversation: {
        originalPrompt: run.conversation?.originalPrompt || run.input?.originalPrompt || '',
        answers: [
          ...(run.conversation?.answers || []),
          { questionId, answer: normalizedAnswer, answeredAt }
        ]
      }
    }
  })
  appendRunLog({
    dataDir,
    runId,
    level: 'info',
    event: 'task.question_answered',
    message: 'Creator Studio task question answered',
    data: { questionId, answer: normalizedAnswer, taskStatus },
    now: () => answeredAt
  })
  return { run: nextRun }
}

const confirmTaskRun = ({ dataDir, runId, now = () => new Date().toISOString() }) => {
  const run = readRun({ dataDir, runId })
  if (!run.generationTask) throw new Error('Creator Studio run has no generation task')
  if ((run.generationTask.questions || []).length > 0) {
    throw new Error('Creator Studio task has remaining questions')
  }
  const confirmedAt = now()
  const nextRun = writeRun({
    dataDir,
    run: {
      ...run,
      status: 'draft',
      taskStatus: 'confirmed',
      currentStep: 'confirmed',
      updatedAt: confirmedAt
    }
  })
  appendRunLog({
    dataDir,
    runId,
    level: 'info',
    event: 'task.confirmed',
    message: 'Creator Studio task confirmed',
    data: { mode: nextRun.generationTask.mode },
    now: () => confirmedAt
  })
  return { run: nextRun }
}

module.exports = {
  answerTaskQuestion,
  confirmTaskRun,
  draftTaskRun,
  updateTaskDraft
}
