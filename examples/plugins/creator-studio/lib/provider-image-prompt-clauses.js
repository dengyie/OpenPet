const { createTaskError, sanitizeVisualDirective } = require('./provider-image-task')

const CATEGORY_ORDER = Object.freeze([
  'deliverable',
  'reference',
  'change',
  'preserve',
  'composition',
  'action',
  'frame-beat',
  'background',
  'exclusion'
])

const categoryRank = (category) => {
  const index = CATEGORY_ORDER.indexOf(category)
  return index === -1 ? CATEGORY_ORDER.length : index
}

const createClause = ({ id, category, text, source = 'task', scope = 'request', priority = 50 }) => Object.freeze({
  id,
  category,
  source,
  scope,
  priority,
  enabled: true,
  text: String(text || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1600)
})

const isIdleTask = (task) => (
  task.action?.animationType === 'stationary_loop' && /\bidle|resting|quiet\b/i.test(
    `${task.action?.name || ''} ${task.action?.moment || ''}`
  )
)

const createDeliverableClause = (task) => {
  if (task.taskType === 'action-frame-sheet') {
    return createClause({
      id: 'deliverable.frame-sheet',
      category: 'deliverable',
      priority: 100,
      text: `Create one ${task.canvas.width} x ${task.canvas.height} animation frame sheet with exactly ${task.sheet.frameCount} complete full-body character frames arranged in ${task.sheet.columns} columns and ${task.sheet.rows} rows. Read cells left to right, then top to bottom.`
    })
  }
  if (task.taskType === 'action-keyframe') {
    return createClause({
      id: 'deliverable.action-keyframe',
      category: 'deliverable',
      priority: 100,
      text: `Create one complete full-body action keyframe at ${task.canvas.width} x ${task.canvas.height} with a ${task.canvas.aspectRatio} aspect ratio.`
    })
  }
  return createClause({
    id: 'deliverable.character-image',
    category: 'deliverable',
    priority: 100,
    text: `Create one complete full-body character image at ${task.canvas.width} x ${task.canvas.height} with a ${task.canvas.aspectRatio} aspect ratio. Show one character only in a calm, readable identity pose.`
  })
}

const createReferenceClause = (task) => {
  const reference = task.referenceInterpretation
  if (reference.type === 'identity-comparison') {
    const poseRule = isIdleTask(task)
      ? 'For this quiet idle task, keep the canonical pose unless the action plan names one subtle local change.'
      : 'Do not preserve the neutral reference pose; the ACTION PLAN or FRAME PLAN is the sole authority for the new pose.'
    return createClause({
      id: 'reference.identity-comparison',
      category: 'reference',
      priority: 95,
      text: `Use the attached board for character identity, visible proportions, colors, markings, materials, accessories, viewpoint, scale, lighting style, and rendering style. Its ${reference.primaryRegion || 'primary character view'} controls canonical continuity, and its ${reference.secondaryRegion || 'supporting detail view'} supplies visible identity details. ${poseRule} Do not copy the board layout, repeated views, spacing, labels, borders, or background.`
    })
  }
  if (reference.type === 'identity-and-motion') {
    return createClause({
      id: 'reference.identity-and-motion',
      category: 'reference',
      priority: 95,
      text: 'Use the attached board for character identity, visible proportions, colors, markings, materials, accessories, viewpoint, scale, lighting style, and rendering style. Use its pose examples only for the action moments they visibly represent; the written frame plan controls all other poses. Do not copy the board layout, repeated views, spacing, labels, borders, or background.'
    })
  }
  return createClause({
    id: 'reference.single-character',
    category: 'reference',
    priority: 95,
    text: 'Use the attached image as the identity and visual-style reference. Follow it for every visible identity-bearing detail, color, marking, body proportion, silhouette, material, accessory, subject-lighting choice, and rendering medium. If written appearance details conflict with the image, follow the image.'
  })
}

const createChangeClause = ({ task, visualPlan }) => {
  const changes = Array.isArray(visualPlan?.subject?.requestedVisibleChanges)
    ? visualPlan.subject.requestedVisibleChanges.filter(Boolean)
    : []
  const styleIntent = Array.isArray(visualPlan?.subject?.mediumAndStyle)
    ? visualPlan.subject.mediumAndStyle.filter(Boolean)
    : []
  if (task.stage === 'repair') {
    if (changes.length !== 1) {
      throw createTaskError(
        'image_prompt_repair_scope_invalid',
        'Image repair requires exactly one bounded visible correction'
      )
    }
    return createClause({
      id: 'change.repair-delta',
      category: 'change',
      source: 'repair',
      scope: 'repair',
      priority: 100,
      text: `Change only this observable issue: ${changes[0]}.`
    })
  }
  if (task.taskType !== 'character-image') {
    const moment = task.action?.moment || task.action?.name || 'the requested action pose'
    const sheetLanguage = task.taskType === 'action-frame-sheet'
      ? `Change only the pose from cell to cell to perform ${task.action?.name || 'the requested action'}.`
      : `Change only the pose to this exact visible moment: ${moment}.`
    const scopedCorrection = [
      changes.length
        ? `Correct only this additional visible issue while keeping the requested action intact: ${changes[0]}.`
        : '',
      styleIntent.length
        ? `Apply these visible style details only when they agree with the attached identity: ${styleIntent.join('; ')}.`
        : ''
    ].filter(Boolean).join(' ')
    return createClause({
      id: 'change.action-pose',
      category: 'change',
      priority: 90,
      text: `${sheetLanguage}${scopedCorrection ? ` ${scopedCorrection}` : ''}`
    })
  }
  return createClause({
    id: changes.length ? 'change.visible-adjustments' : 'change.no-redesign',
    category: 'change',
    priority: 80,
    text: changes.length || styleIntent.length
      ? [
          changes.length ? `Apply only these visible adjustments: ${changes.join('; ')}.` : '',
          styleIntent.length ? `Apply these visible style details only when they agree with the attached identity: ${styleIntent.join('; ')}.` : ''
        ].filter(Boolean).join(' ')
      : 'Do not redesign the character.'
  })
}

const createPreserveClause = (task) => {
  const locks = Array.isArray(task.styleLocks) ? task.styleLocks.filter(Boolean) : []
  const actionLocks = Array.isArray(task.action?.lockedParts) ? task.action.lockedParts.filter(Boolean) : []
  const combined = [...new Set([...locks, ...actionLocks])]
  return createClause({
    id: 'preserve.identity-locks',
    category: 'preserve',
    priority: 90,
    text: `Keep unchanged: ${combined.join(', ')}. Keep every identity-bearing feature and every body part or accessory visible in the reference present, recognizable, and consistent. Do not invent, remove, duplicate, or redesign visible anatomy or accessories.`
  })
}

const createCompositionClause = (task) => {
  if (task.taskType === 'action-frame-sheet') {
    const unusedCells = (task.sheet.columns * task.sheet.rows) - task.sheet.frameCount
    return createClause({
      id: 'composition.frame-sheet',
      category: 'composition',
      priority: 85,
      text: `Use equal invisible cells. Put one complete pose inside each required cell with approximately ${task.subject.safePaddingPercent}% internal padding. Keep the same viewpoint, character scale, subject lighting, and lower-center root in every cell. Do not crop the character or let character pixels cross between cells.${unusedCells > 0 ? ' Keep every unused cell free of character pixels.' : ''}`
    })
  }
  return createClause({
    id: 'composition.single-character',
    category: 'composition',
    priority: 85,
    text: `Place the complete character at the lower center of the canvas. Use approximately ${task.subject.targetOccupancyPercent}% of the canvas height and leave at least ${task.subject.safePaddingPercent}% clear padding on every side. Do not crop the character or let it touch an image edge.`
  })
}

const createActionClauses = (task) => {
  if (task.taskType === 'character-image') return []
  const action = task.action || {}
  const details = [
    action.viewDirection ? `Direction: ${action.viewDirection}.` : '',
    action.movingParts?.length ? `Primary motion: ${action.movingParts.join(', ')}.` : '',
    action.secondaryMotion?.length ? `Allowed secondary motion: ${action.secondaryMotion.join(', ')}.` : '',
    action.forbiddenMotion?.length ? `Never: ${action.forbiddenMotion.join(', ')}.` : '',
    action.loopType ? `Loop type: ${action.loopType}.` : '',
    action.loopIntent ? `Loop requirement: ${action.loopIntent}.` : ''
  ].filter(Boolean)
  const clauses = [createClause({
    id: 'action.motion-contract',
    category: 'action',
    priority: 80,
    text: details.join(' ')
  })]
  if (task.taskType === 'action-frame-sheet') {
    for (const beat of action.frameBeats || []) {
      clauses.push(createClause({
        id: `frame-beat.${beat.frame}`,
        category: 'frame-beat',
        scope: `frame:${beat.frame}`,
        priority: 70,
        text: `Cell ${beat.frame} (${beat.cell}) — ${beat.beat}.`
      }))
    }
  }
  return clauses
}

const createBackgroundClause = (capabilities) => createClause({
  id: capabilities.supportsDirectTransparency
    ? 'background.direct-transparent'
    : 'background.opaque-cutout',
  category: 'background',
  priority: 85,
  text: capabilities.supportsDirectTransparency
    ? 'Use a fully transparent background. Keep every subject edge clean with no floor, scenery, background texture, or cast shadow.'
    : 'Use one uniform opaque background color that strongly contrasts with every character edge. Use no gradient, texture, scenery, floor line, divider, or cast shadow. Keep every edge clean and separable for downstream background removal.'
})

const createExclusionClauses = ({ task, qualityGuidance }) => {
  const deliverableExclusions = task.taskType === 'action-frame-sheet'
    ? 'No visible grid, text, labels, numbers, logo, watermark, border, presentation layout, duplicate placeholder frame, extra character, prop, scenery, or identity redesign. Return only the complete frame sheet.'
    : 'No text, labels, logo, watermark, border, panel, grid, duplicate character, duplicate pose, extra prop, scenery, presentation layout, or identity redesign. Return only the requested image.'
  const clauses = [createClause({
    id: 'exclusion.delivery',
    category: 'exclusion',
    priority: 80,
    text: deliverableExclusions
  })]
  const guidance = Array.isArray(qualityGuidance)
    ? qualityGuidance.map(sanitizeVisualDirective).filter(Boolean).slice(0, 8)
    : []
  if (guidance.length) {
    clauses.push(createClause({
      id: 'exclusion.quality-guidance',
      category: 'exclusion',
      source: 'human-quality-guidance',
      priority: 60,
      text: `Additional quality constraints: ${guidance.join(' ')}`
    }))
  }
  return clauses
}

const validateClauses = ({ task, clauses, capabilities }) => {
  const seen = new Set()
  for (const clause of clauses) {
    if (!clause.text) throw createTaskError('image_prompt_semantic_conflict', 'Image prompt clause is empty')
    if (seen.has(clause.id)) throw createTaskError('image_prompt_semantic_conflict', 'Image prompt clause id is duplicated')
    seen.add(clause.id)
  }
  if (task.taskType === 'action-frame-sheet') {
    const beatCount = clauses.filter((clause) => clause.category === 'frame-beat').length
    if (beatCount !== task.sheet.frameCount) {
      throw createTaskError('image_prompt_frame_plan_incomplete', 'Image prompt does not describe every required frame')
    }
  }
  if (!capabilities.supportsDirectTransparency && clauses.some((clause) => /\btransparent\b/i.test(clause.text))) {
    throw createTaskError('image_prompt_capability_conflict', 'Selected image model prompt cannot request transparency')
  }
}

const buildProviderImagePromptClauses = ({ task, visualPlan, capabilities, qualityGuidance = [] }) => {
  const clauses = [
    createDeliverableClause(task),
    createReferenceClause(task),
    createChangeClause({ task, visualPlan }),
    createPreserveClause(task),
    createCompositionClause(task),
    ...createActionClauses(task),
    createBackgroundClause(capabilities),
    ...createExclusionClauses({ task, qualityGuidance })
  ].filter(Boolean)
  clauses.sort((left, right) => (
    categoryRank(left.category) - categoryRank(right.category) || right.priority - left.priority
  ))
  validateClauses({ task, clauses, capabilities })
  return Object.freeze(clauses)
}

module.exports = {
  CATEGORY_ORDER,
  buildProviderImagePromptClauses
}
