const { runCommand } = require('../lib/command-io')
const { createRun } = require('../lib/run-store')
const { draftGenerationTask, shouldDraftGenerationTask } = require('../lib/conversation-wizard')

runCommand(async (context) => {
  const payload = context.payload || {}
  const prompt = payload.originalPrompt || payload.prompt || ''
  const draft = shouldDraftGenerationTask({
    prompt,
    mode: payload.mode,
    generationTask: payload.generationTask
  })
    ? (payload.generationTask
        ? { originalPrompt: prompt, generationTask: payload.generationTask }
        : draftGenerationTask({ prompt, context: payload.context || {} }))
    : {}
  const run = createRun({
    dataDir: process.env.OPENPET_DATA_DIR,
    input: {
      ...payload,
      backend: payload.backend || context.config?.backend || 'fixture',
      ...(draft.originalPrompt ? { originalPrompt: draft.originalPrompt } : {}),
      ...(draft.generationTask ? { generationTask: draft.generationTask } : {})
    }
  })
  return { message: `Created run ${run.runId}`, run }
})
