const {
  createProviderImageTask,
  createTaskError
} = require('./provider-image-task')
const { createVisualPlan } = require('./visual-plan')
const { resolveImageModelCapabilities } = require('./image-model-capabilities')
const { buildProviderImagePromptClauses } = require('./provider-image-prompt-clauses')
const { renderGptImage2Prompt } = require('./gpt-image-2-prompt-renderer')

const PROMPT_COMPILER_VERSION = 3
const MAX_PROMPT_LENGTH = 12000

const FORBIDDEN_PROMPT_PATTERNS = Object.freeze([
  Object.freeze({ pattern: /\bOpenPet\b/i, label: 'product name' }),
  Object.freeze({ pattern: /\bCreator[-_ ]?Studio\b/i, label: 'product component' }),
  Object.freeze({ pattern: /\bCodex[-_ ]?Pet\b/i, label: 'product asset format' }),
  Object.freeze({ pattern: /\bHatch[-_ ]?Pet\b/i, label: 'product workflow' }),
  Object.freeze({ pattern: /\bProvider\b/i, label: 'transport owner' }),
  Object.freeze({ pattern: /\bbackend\b/i, label: 'backend name' }),
  Object.freeze({ pattern: /\b(?:run|action)[-_ ]?id\b/i, label: 'internal identifier' }),
  Object.freeze({ pattern: /\breference[-_ ]?role\b/i, label: 'reference role' }),
  Object.freeze({ pattern: /\bcheckpoint\b/i, label: 'checkpoint term' }),
  Object.freeze({ pattern: /\bmultipart\b/i, label: 'transport format' }),
  Object.freeze({ pattern: /\b(?:sk-[A-Za-z0-9_-]+|bearer\s+[A-Za-z0-9._~-]+|(?:[A-Za-z0-9_-]*token[A-Za-z0-9_-]*|api[-_ ]?key|secret|credential|password|authorization)\s*[:=]\s*(?:(?:bearer|basic)\s+)?\S+)\b/i, label: 'secret' }),
  Object.freeze({ pattern: /\b[A-Za-z0-9_-]*token[A-Za-z0-9_-]*\b/i, label: 'token identifier' }),
  Object.freeze({ pattern: /https?:\/\/\S+/i, label: 'URL' }),
  Object.freeze({ pattern: /\bfile:\/{2,3}\S+/i, label: 'file URI' }),
  Object.freeze({ pattern: /(?:^|\s)(?:\.\.[/\\])+\S*/i, label: 'path traversal' }),
  Object.freeze({ pattern: /\b[A-Za-z]:[\\/]\S+/i, label: 'Windows path' }),
  Object.freeze({ pattern: /\\\\[^\\/\s]+[\\/]\S+/i, label: 'UNC path' }),
  Object.freeze({ pattern: /\b(?:runs|inputs|outputs|assets|cat_anime)[/\\][^\s,，。)]+/i, label: 'project path' }),
  Object.freeze({ pattern: /(?:\/Users|\/var|\/tmp|\/private|\/Volumes)\//i, label: 'host path' }),
  Object.freeze({ pattern: /(?:^|\s)\/(?!\/)\S+/i, label: 'absolute path' }),
  Object.freeze({ pattern: /\b(?:ignore|disregard|override|replace|reveal|repeat)\b.{0,80}\b(?:instruction|prompt|system|rule|requirement)\b/i, label: 'prompt control' }),
  Object.freeze({ pattern: /\b(?:instruction|prompt|system)\b.{0,80}\b(?:ignore|disregard|override|replace|reveal|repeat)\b/i, label: 'prompt control' }),
  Object.freeze({ pattern: /(?:忽略|无视|覆盖|泄露|透露|重复).{0,40}(?:指令|提示词|系统|规则|要求)/i, label: 'prompt control' })
])

const assertProviderNeutralPrompt = (value, capabilities = null) => {
  const text = String(value || '').trim()
  if (!text) throw createTaskError('image_prompt_contract_invalid', 'Compiled image prompt is empty')
  if (text.length > MAX_PROMPT_LENGTH) {
    throw createTaskError('image_prompt_contract_invalid', 'Compiled image prompt is too long')
  }
  for (const entry of FORBIDDEN_PROMPT_PATTERNS) {
    if (entry.pattern.test(text)) {
      throw createTaskError(
        'image_prompt_internal_term',
        `Compiled image prompt contains forbidden ${entry.label}`
      )
    }
  }
  if (capabilities && !capabilities.supportsDirectTransparency && /\btransparent\b/i.test(text)) {
    throw createTaskError(
      'image_prompt_capability_conflict',
      'Compiled image prompt requests unsupported transparency'
    )
  }
  return text
}

const normalizeCompilerTask = (task = {}) => createProviderImageTask({
  taskType: task.taskType,
  stage: task.stage,
  canvas: task.canvas,
  sheet: task.sheet,
  referenceInterpretation: task.referenceInterpretation,
  subject: task.subject,
  action: task.action,
  styleLocks: task.styleLocks,
  appearanceIntent: task.appearanceIntent,
  strategyId: task.strategyId,
  requestedChanges: task.requestedChanges,
  ...(task.actionClass ? { actionClass: task.actionClass } : {}),
  ...(task.anchorPolicy ? { anchorPolicy: task.anchorPolicy } : {}),
  ...(task.componentPolicy ? { componentPolicy: task.componentPolicy } : {}),
  ...(task.effectPolicy ? { effectPolicy: task.effectPolicy } : {}),
  ...(task.motionPresetId ? { motionPresetId: task.motionPresetId } : {}),
  ...(task.framePlanVersion ? { framePlanVersion: task.framePlanVersion } : {})
})

const renderPrompt = ({ task, clauses, capabilities }) => {
  if (capabilities.promptRenderer === 'gpt-image-2-v1' || capabilities.promptRenderer === 'structured-image-edit-v1') {
    return renderGptImage2Prompt({ task, clauses, capabilities })
  }
  throw createTaskError('image_prompt_capability_conflict', 'Selected image model prompt renderer is unavailable')
}

const compileProviderImagePrompt = ({ task, model = 'gpt-image-2', visualPlan = null, qualityGuidance = [] } = {}) => {
  const normalizedTask = normalizeCompilerTask(task)
  const capabilities = resolveImageModelCapabilities(model)
  const normalizedVisualPlan = createVisualPlan(visualPlan || {
    appearanceIntent: normalizedTask.appearanceIntent,
    requestedChanges: normalizedTask.requestedChanges,
    action: normalizedTask.action,
    subject: normalizedTask.subject
  })
  const clauses = buildProviderImagePromptClauses({ task: normalizedTask, visualPlan: normalizedVisualPlan, capabilities, qualityGuidance })
  const text = assertProviderNeutralPrompt(renderPrompt({ task: normalizedTask, clauses, capabilities }), capabilities)
  return Object.freeze({
    version: PROMPT_COMPILER_VERSION,
    taskType: normalizedTask.taskType,
    text,
    safeSummary: Object.freeze({
      visualPlanVersion: normalizedVisualPlan.version,
      providerImageTaskVersion: normalizedTask.version,
      promptCompilerVersion: PROMPT_COMPILER_VERSION,
      promptRenderer: capabilities.promptRenderer,
      modelCapabilityProfile: capabilities.id,
      taskType: normalizedTask.taskType,
      stage: normalizedTask.stage,
      width: normalizedTask.canvas.width,
      height: normalizedTask.canvas.height,
      aspectRatio: normalizedTask.canvas.aspectRatio,
      referenceImageCount: 1,
      requestedOutputCount: capabilities.requestedOutputCount,
      backgroundStrategy: capabilities.cutoutStrategy,
      frameBeatCount: normalizedTask.action?.frameBeats?.length || 0,
      promptClauseIds: Object.freeze(clauses.map((clause) => clause.id)),
      promptCharacterCount: text.length,
      promptSafety: 'provider-neutral-model-aware',
      ...(normalizedTask.actionClass ? { actionClass: normalizedTask.actionClass } : {}),
      ...(normalizedTask.anchorPolicy ? { anchorPolicy: normalizedTask.anchorPolicy } : {}),
      ...(normalizedTask.componentPolicy ? { componentPolicy: normalizedTask.componentPolicy } : {}),
      ...(normalizedTask.effectPolicy ? { effectPolicy: normalizedTask.effectPolicy } : {}),
      ...(normalizedTask.motionPresetId ? { motionPresetId: normalizedTask.motionPresetId } : {}),
      ...(normalizedTask.framePlanVersion ? { framePlanVersion: normalizedTask.framePlanVersion } : {}),
      ...(normalizedTask.strategyId ? { strategyId: normalizedTask.strategyId } : {})
    }),
    warnings: Object.freeze(Array.isArray(normalizedVisualPlan.warnings) ? normalizedVisualPlan.warnings.slice(0, 8) : [])
  })
}

const createReferenceParagraph = (reference) => {
  const task = createProviderImageTask({ taskType: 'character-image', stage: 'identity', referenceInterpretation: reference })
  const capabilities = resolveImageModelCapabilities('gpt-image-2')
  return buildProviderImagePromptClauses({ task, visualPlan: createVisualPlan({ subject: task.subject }), capabilities })
    .find((clause) => clause.category === 'reference')?.text || ''
}

module.exports = {
  FORBIDDEN_PROMPT_PATTERNS,
  PROMPT_COMPILER_VERSION,
  assertProviderNeutralPrompt,
  compileProviderImagePrompt,
  createReferenceParagraph
}
