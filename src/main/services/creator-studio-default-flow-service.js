const CREATOR_STUDIO_PLUGIN_ID = 'openpet.creator-studio'
const CREATOR_STUDIO_SERVICE_ID = 'studio'
const DEFAULT_CREATOR_STUDIO_COMMAND_ID = 'draft-task'
const LEGACY_CREATOR_STUDIO_COMMAND_ID = 'create-run'
const CREATOR_STUDIO_ANSWER_COMMAND_ID = 'answer-question'
const CREATOR_STUDIO_CONFIRM_COMMAND_ID = 'confirm-task'
const CREATOR_STUDIO_GENERATE_COMMAND_ID = 'run-step'
const CREATOR_STUDIO_APPROVE_COMMAND_ID = 'approve-run'
const CREATOR_STUDIO_IMPORT_ACTION_COMMAND_ID = 'import-approved-action'
const CREATOR_STUDIO_IMPORT_PET_COMMAND_ID = 'import-approved-pet'

const findPluginById = (plugins = [], pluginId) => (
  Array.isArray(plugins)
    ? plugins.find((plugin) => plugin?.id === pluginId) || null
    : null
)

const getPluginServiceRuntimeStatus = (plugin, serviceId) => (
  plugin?.entries?.services?.find((service) => service.id === serviceId)?.runtime?.status || 'stopped'
)

const getCreatorStudioRun = (result) => {
  const candidate = result?.result
  return candidate && typeof candidate === 'object' && !Array.isArray(candidate) && candidate.run && typeof candidate.run === 'object'
    ? candidate.run
    : null
}

const getCreatorStudioRunId = (run) => String(run?.runId || '').trim()

const getCreatorStudioQuestions = (run) => {
  const generationTask = run?.generationTask
  const questions = generationTask && typeof generationTask === 'object' && !Array.isArray(generationTask)
    ? generationTask.questions
    : null
  return Array.isArray(questions) ? questions : []
}

const resolveCreatorStudioAutoAnswer = (question) => {
  if (String(question?.id || '') === 'trigger') return 'manual'
  return ''
}

const isCreatorStudioActionRun = (run) => {
  const artifacts = run?.artifacts
  return Boolean(artifacts && typeof artifacts === 'object' && !Array.isArray(artifacts) && artifacts.actionFrames)
}

const getCommandMessage = (result, fallback) => {
  const message = result?.result && typeof result.result === 'object' && !Array.isArray(result.result)
    ? result.result.message
    : ''
  return String(message || fallback || '').trim()
}

const getCreatorStudioTriggerProposalSubmission = (result) => {
  const candidate = result?.result
  return candidate &&
    typeof candidate === 'object' &&
    !Array.isArray(candidate) &&
    candidate.triggerProposalSubmission &&
    typeof candidate.triggerProposalSubmission === 'object' &&
    !Array.isArray(candidate.triggerProposalSubmission)
    ? candidate.triggerProposalSubmission
    : null
}

const createStructuredResult = ({ state, message, runId = '', lastCommandResult = null }) => ({
  ok: true,
  state,
  message,
  runId,
  lastCommandResult
})

const createCreatorStudioDefaultFlowService = ({
  pluginService,
  imageGenerationModelService
}) => {
  if (!pluginService?.listPlugins || !pluginService?.runCommand) {
    throw new Error('Plugin service is required for Creator Studio default flow')
  }
  if (!imageGenerationModelService?.checkHealth) {
    throw new Error('Image generation model service is required for Creator Studio default flow')
  }

  const runDefaultFlow = async ({ prompt }) => {
    const normalizedPrompt = String(prompt || '').trim()
    if (!normalizedPrompt) throw new Error('请先输入 Creator Studio 请求')

    const plugin = findPluginById(pluginService.listPlugins(), CREATOR_STUDIO_PLUGIN_ID)
    if (!plugin) throw new Error('未找到 Creator Studio 插件')
    if (!plugin.enabled || !plugin.runnable || plugin.blockStatus?.blocked) {
      throw new Error('请先启用 Creator Studio 插件')
    }
    const health = await imageGenerationModelService.checkHealth({})
    if (!health?.ok) {
      return createStructuredResult({
        state: 'blocked',
        message: '请先到 AI -> 模型 Provider -> 图片模型 配置并保存可用模型，然后再使用生成并导入'
      })
    }

    const commandId = Array.isArray(plugin.commands) && plugin.commands.some((command) => command.id === DEFAULT_CREATOR_STUDIO_COMMAND_ID)
      ? DEFAULT_CREATOR_STUDIO_COMMAND_ID
      : LEGACY_CREATOR_STUDIO_COMMAND_ID

    let lastRunId = ''
    let lastCommandResult = null

    try {
      let result = await pluginService.runCommand(CREATOR_STUDIO_PLUGIN_ID, commandId, {
        prompt: normalizedPrompt,
        originalPrompt: normalizedPrompt,
        backend: 'provider'
      })
      let run = getCreatorStudioRun(result)
      let runId = getCreatorStudioRunId(run)
      lastRunId = runId
      lastCommandResult = result

      while (runId) {
        const pendingQuestions = getCreatorStudioQuestions(run)
        if (!pendingQuestions.length) break
        const question = pendingQuestions[0]
        const answer = resolveCreatorStudioAutoAnswer(question)
        if (!answer) {
          return createStructuredResult({
            state: 'needs_details',
            runId,
            lastCommandResult,
            message: `生成并导入已暂停：run ${runId} 还需要人工补充信息。请点击“查看任务详情”。`
          })
        }
        result = await pluginService.runCommand(CREATOR_STUDIO_PLUGIN_ID, CREATOR_STUDIO_ANSWER_COMMAND_ID, {
          runId,
          questionId: String(question?.id || ''),
          answer
        })
        lastCommandResult = result
        run = getCreatorStudioRun(result)
        runId = getCreatorStudioRunId(run)
        lastRunId = runId
      }

      if (runId && String(run?.taskStatus || '') !== 'confirmed') {
        result = await pluginService.runCommand(CREATOR_STUDIO_PLUGIN_ID, CREATOR_STUDIO_CONFIRM_COMMAND_ID, { runId })
        lastCommandResult = result
        run = getCreatorStudioRun(result)
        runId = getCreatorStudioRunId(run)
        lastRunId = runId
      }

      if (runId) {
        result = await pluginService.runCommand(CREATOR_STUDIO_PLUGIN_ID, CREATOR_STUDIO_GENERATE_COMMAND_ID, { runId })
        lastCommandResult = result
        run = getCreatorStudioRun(result)
        runId = getCreatorStudioRunId(run)
        lastRunId = runId
      }

      if (runId && String(run?.status || '') === 'ready_for_review') {
        result = await pluginService.runCommand(CREATOR_STUDIO_PLUGIN_ID, CREATOR_STUDIO_APPROVE_COMMAND_ID, { runId })
        lastCommandResult = result
        run = getCreatorStudioRun(result)
        runId = getCreatorStudioRunId(run)
        lastRunId = runId
      }

      if (runId && String(run?.status || '') === 'approved') {
        const importCommandId = isCreatorStudioActionRun(run)
          ? CREATOR_STUDIO_IMPORT_ACTION_COMMAND_ID
          : CREATOR_STUDIO_IMPORT_PET_COMMAND_ID
        result = await pluginService.runCommand(CREATOR_STUDIO_PLUGIN_ID, importCommandId, {
          runId,
          activate: true
        })
        lastCommandResult = result
        run = getCreatorStudioRun(result)
        runId = getCreatorStudioRunId(run) || runId
        lastRunId = runId
      }

      if (lastCommandResult?.commandId === CREATOR_STUDIO_IMPORT_ACTION_COMMAND_ID) {
        const triggerProposalSubmission = getCreatorStudioTriggerProposalSubmission(lastCommandResult)
        if (!triggerProposalSubmission) {
          return createStructuredResult({
            state: 'needs_details',
            runId: lastRunId,
            lastCommandResult,
            message: `动作已导入，但 run ${lastRunId} 缺少触发建议交接记录。请点击“查看任务详情”。`
          })
        }
        if (triggerProposalSubmission.ok !== true) {
          return createStructuredResult({
            state: 'needs_details',
            runId: lastRunId,
            lastCommandResult,
            message: `动作已导入，但 run ${lastRunId} 的触发建议交接失败。请点击“查看任务详情”。`
          })
        }
      }

      return createStructuredResult({
        state: 'completed',
        runId: lastRunId,
        lastCommandResult,
        message: getCommandMessage(lastCommandResult, '生成并导入已完成')
      })
    } catch (error) {
      if (lastRunId) {
        return createStructuredResult({
          state: 'needs_details',
          runId: lastRunId,
          lastCommandResult,
          message: `生成并导入在 run ${lastRunId} 失败：${error.message || '未知错误'}。请点击“查看任务详情”。`
        })
      }
      throw error
    }
  }

  return {
    runDefaultFlow
  }
}

module.exports = { createCreatorStudioDefaultFlowService }
