const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildActionKeyframePrompt,
  buildActionSpriteRowPrompt,
  buildCharacterAnchorPrompt
} = require('../../examples/plugins/creator-studio/lib/anchor-prompt-builder')
const {
  buildActionFramePlan
} = require('../../examples/plugins/creator-studio/lib/action-semantics')
const {
  resolveImageModelCapabilities
} = require('../../examples/plugins/creator-studio/lib/image-model-capabilities')
const {
  compileProviderImagePrompt
} = require('../../examples/plugins/creator-studio/lib/provider-image-prompt-compiler')
const {
  createProviderImageTask
} = require('../../examples/plugins/creator-studio/lib/provider-image-task')
const {
  createVisualPlan
} = require('../../examples/plugins/creator-studio/lib/visual-plan')

const INTERNAL_OR_SENSITIVE_PROMPT_TEXT = [
  /\btransparent\b/i,
  /\bOpenPet\b/i,
  /\bCreator[-_ ]?Studio\b/i,
  /\bProvider\b/i,
  /\b(?:run|action)[-_ ]?id\b/i,
  /\breference[-_ ]?role\b/i,
  /\bmultipart\b/i,
  /https?:\/\//i,
  /file:\/{2,3}/i,
  /(?:\/Users|\/var|\/tmp|\/private|\/Volumes)\//i,
  /\b(?:api[-_ ]?key|credential|password|authorization)\b/i,
  /\bsk-[A-Za-z0-9_-]+\b/i
]

const assertHeadingOrder = (prompt, headings) => {
  let previous = -1
  for (const heading of headings) {
    const index = prompt.indexOf(`\n${heading}\n`)
    const resolved = index === -1 && prompt.startsWith(`${heading}\n`) ? 0 : index
    assert.notEqual(resolved, -1, `missing ${heading} section`)
    assert.ok(resolved > previous, `${heading} section is out of order`)
    previous = resolved
  }
}

const assertGptImage2PromptSafe = (prompt) => {
  for (const pattern of INTERNAL_OR_SENSITIVE_PROMPT_TEXT) assert.doesNotMatch(prompt, pattern)
}

const createSheetTask = ({
  frameCount = 6,
  stage = 'final',
  action = {},
  requestedChanges = []
} = {}) => createProviderImageTask({
  taskType: 'action-frame-sheet',
  stage,
  sheet: {
    frameCount,
    columns: frameCount <= 4 ? 2 : frameCount <= 6 ? 3 : 4,
    rows: Math.ceil(frameCount / (frameCount <= 4 ? 2 : frameCount <= 6 ? 3 : 4)),
    readingOrder: 'left-to-right-top-to-bottom'
  },
  referenceRole: 'keyframe-action-reference-board',
  action: {
    name: 'running right',
    animationType: 'locomotion_loop',
    moment: 'first contact pose',
    viewDirection: 'character faces viewer-right',
    loopType: 'seamless in-place cycle',
    movingParts: ['visible locomotion appendages'],
    secondaryMotion: ['small body rise and fall'],
    lockedParts: ['identity-bearing details', 'body proportions', 'scale'],
    forbiddenMotion: ['translation across the canvas', 'viewpoint change'],
    loopIntent: 'last frame transitions cleanly into the first frame',
    frameBeats: buildActionFramePlan({
      action: { actionId: 'running-right', animationType: 'locomotion_loop' },
      frameCount
    }),
    ...action
  },
  requestedChanges
})

test('visual plan removes product language while preserving explicit visible changes', () => {
  const plan = createVisualPlan({
    appearanceIntent: [
      'Create a reusable OpenPet desktop pet named X',
      'softly shaded digital illustration'
    ],
    requestedChanges: [
      'make the application reusable at runtime',
      'add one visible red neck scarf'
    ]
  })

  assert.deepEqual(plan.subject.mediumAndStyle, ['softly shaded digital illustration'])
  assert.deepEqual(plan.subject.requestedVisibleChanges, ['add one visible red neck scarf'])

  const built = buildCharacterAnchorPrompt({
    model: 'gpt-image-2',
    appearanceIntent: [
      'Create a reusable OpenPet desktop pet named X',
      'softly shaded digital illustration'
    ],
    requestedChanges: ['add one visible red neck scarf']
  })
  assert.doesNotMatch(built.prompt, /reusable|desktop[- ]?pet|named X/i)
  assert.match(built.prompt, /visible red neck scarf/i)
})

test('image model capability profiles are bounded and model-aware', () => {
  const gptImage2 = resolveImageModelCapabilities('gpt-image-2')
  assert.deepEqual(gptImage2, {
    id: 'gpt-image-2-v1',
    model: 'gpt-image-2',
    promptRenderer: 'gpt-image-2-v1',
    imageConditioning: 'required',
    adjustableInputFidelity: false,
    supportsDirectTransparency: false,
    cutoutStrategy: 'solid-background-then-local-removal',
    supportsDedicatedNegativePrompt: false,
    requestedOutputCount: 1
  })

  for (const model of ['gpt-image-1', 'gpt-image-1.5']) {
    const profile = resolveImageModelCapabilities(model)
    assert.equal(profile.id, 'gpt-image-edit-transparent-v1')
    assert.equal(profile.model, model)
    assert.equal(profile.promptRenderer, 'generic-image-edit-v1')
    assert.equal(profile.supportsDirectTransparency, true)
    assert.equal(profile.requestedOutputCount, 1)
  }

  const runtime = resolveImageModelCapabilities('eligible-runtime-image-model')
  assert.equal(runtime.id, 'generic-image-edit-v1:eligible-runtime-image-model')
  assert.equal(runtime.promptRenderer, 'generic-image-edit-v1')
  assert.equal(runtime.requestedOutputCount, 1)

  assert.throws(
    () => resolveImageModelCapabilities(''),
    (error) => error?.code === 'image_prompt_capability_conflict'
  )
})

test('provider image task v3 preserves complete action semantics and exact frame geometry', () => {
  const task = createSheetTask({ frameCount: 6 })

  assert.equal(task.version, 3)
  assert.equal(task.action.animationType, 'locomotion_loop')
  assert.equal(task.action.viewDirection, 'character faces viewer-right')
  assert.equal(task.action.loopType, 'seamless in-place cycle')
  assert.deepEqual(task.action.secondaryMotion, ['small body rise and fall'])
  assert.deepEqual(task.action.forbiddenMotion, ['translation across the canvas', 'viewpoint change'])
  assert.equal(task.action.frameBeats.length, 6)
  assert.deepEqual(task.action.frameBeats.map((beat) => beat.frame), [1, 2, 3, 4, 5, 6])
  assert.deepEqual(task.action.frameBeats.map((beat) => beat.cell), [
    'row 1 column 1',
    'row 1 column 2',
    'row 1 column 3',
    'row 2 column 1',
    'row 2 column 2',
    'row 2 column 3'
  ])
})

test('provider image task rejects incomplete, duplicate, mismatched, and unknown frame contracts', () => {
  const sparse = {
    taskType: 'action-frame-sheet',
    stage: 'final',
    sheet: { frameCount: 3, columns: 3, rows: 1 },
    action: {
      name: 'wave',
      frameBeats: [
        { frame: 1, beat: 'start' },
        { frame: 2, beat: 'peak' }
      ]
    }
  }
  assert.throws(
    () => createProviderImageTask(sparse),
    (error) => error?.code === 'image_prompt_frame_plan_incomplete'
  )

  assert.throws(
    () => createProviderImageTask({
      ...sparse,
      action: {
        name: 'wave',
        frameBeats: [
          { frame: 1, beat: 'start' },
          { frame: 1, beat: 'duplicate' },
          { frame: 3, beat: 'end' }
        ]
      }
    }),
    (error) => error?.code === 'image_prompt_frame_plan_incomplete'
  )

  assert.throws(
    () => createProviderImageTask({
      ...sparse,
      action: {
        name: 'wave',
        frameBeats: [
          { frame: 1, cell: 'row 1 column 2', beat: 'start' },
          { frame: 2, beat: 'peak' },
          { frame: 3, beat: 'end' }
        ]
      }
    }),
    (error) => error?.code === 'image_prompt_frame_plan_incomplete'
  )

  assert.throws(
    () => createProviderImageTask({
      taskType: 'character-image',
      stage: 'identity',
      unknownField: true
    }),
    (error) => error?.code === 'image_prompt_contract_invalid'
  )
})

test('gpt image 2 character prompt uses the standard section format and opaque cutout contract', () => {
  const result = buildCharacterAnchorPrompt({
    model: 'gpt-image-2',
    referenceRole: 'single-character-reference',
    appearanceIntent: ['soft watercolor rendering'],
    requestedChanges: ['add one visible blue ribbon']
  })

  assertHeadingOrder(result.prompt, [
    'DELIVERABLE',
    'REFERENCE',
    'CHANGE',
    'PRESERVE',
    'COMPOSITION',
    'BACKGROUND',
    'CONSTRAINTS'
  ])
  assert.match(result.prompt, /uniform opaque background color/i)
  assert.match(result.prompt, /strongly contrasts with every character edge/i)
  assert.match(result.prompt, /downstream background removal/i)
  assertGptImage2PromptSafe(result.prompt)
  assert.equal(result.version, 6)
  assert.equal(result.promptCompilerVersion, 3)
  assert.equal(result.promptCompiler.providerImageTaskVersion, 3)
  assert.equal(result.promptCompiler.promptRenderer, 'gpt-image-2-v1')
  assert.equal(result.promptCompiler.modelCapabilityProfile, 'gpt-image-2-v1')
  assert.equal(result.promptCompiler.backgroundStrategy, 'solid-background-then-local-removal')
  assert.equal(result.promptCompiler.referenceImageCount, 1)
  assert.equal(result.promptCompiler.requestedOutputCount, 1)
})

test('gpt image 2 non-idle and idle keyframes separate pose authority from identity preservation', () => {
  const running = buildActionKeyframePrompt({
    model: 'gpt-image-2',
    referenceRole: 'full-pet-action-identity-board',
    keyframeRole: 'start',
    action: {
      actionId: 'running-right',
      name: 'running right',
      animationType: 'locomotion_loop',
      viewDirection: 'character faces viewer-right',
      loopType: 'seamless in-place cycle',
      animatedParts: ['visible locomotion appendages'],
      secondaryMotion: ['small body rise and fall'],
      forbiddenMotion: ['translation across the canvas', 'viewpoint change']
    }
  })
  assertHeadingOrder(running.prompt, [
    'DELIVERABLE',
    'REFERENCE',
    'CHANGE',
    'PRESERVE',
    'COMPOSITION',
    'ACTION PLAN',
    'BACKGROUND',
    'CONSTRAINTS'
  ])
  assert.match(running.prompt, /sole authority for the new pose/i)
  assert.match(running.prompt, /character faces viewer-right/i)
  assert.match(running.prompt, /small body rise and fall/i)
  assert.match(running.prompt, /translation across the canvas/i)
  assert.match(running.prompt, /seamless in-place cycle/i)
  assertGptImage2PromptSafe(running.prompt)

  const idle = buildActionKeyframePrompt({
    model: 'gpt-image-2',
    referenceRole: 'full-pet-action-identity-board',
    keyframeRole: 'start',
    action: {
      actionId: 'idle',
      name: 'idle',
      animationType: 'stationary_loop',
      animatedParts: ['subtle breathing only'],
      forbiddenMotion: ['body-root motion', 'large appendage movement']
    }
  })
  assert.match(idle.prompt, /keep the canonical pose/i)
  assert.match(idle.prompt, /subtle breathing only/i)
  assert.match(idle.prompt, /body-root motion/i)
  assert.doesNotMatch(idle.prompt, /sole authority for the new pose/i)
  assertGptImage2PromptSafe(idle.prompt)
})

test('gpt image 2 frame sheets define every cell without ranges or anatomy assumptions', () => {
  const result = buildActionSpriteRowPrompt({
    model: 'gpt-image-2',
    referenceRole: 'keyframe-action-reference-board',
    action: {
      actionId: 'running-right',
      name: 'running right',
      animationType: 'locomotion_loop',
      frameCount: 8,
      viewDirection: 'character faces viewer-right',
      loopType: 'seamless in-place cycle',
      animatedParts: ['visible locomotion appendages'],
      secondaryMotion: ['small body rise and fall'],
      forbiddenMotion: ['translation across the canvas', 'viewpoint change']
    }
  })

  assertHeadingOrder(result.prompt, [
    'DELIVERABLE',
    'REFERENCE',
    'CHANGE',
    'PRESERVE',
    'COMPOSITION',
    'FRAME PLAN',
    'BACKGROUND',
    'CONSTRAINTS'
  ])
  for (let frame = 1; frame <= 8; frame += 1) {
    assert.equal((result.prompt.match(new RegExp(`^Cell ${frame} \\(`, 'gm')) || []).length, 1)
  }
  assert.doesNotMatch(result.prompt, /Frames?\s+\d+\s*[-–]\s*\d+/i)
  assert.doesNotMatch(result.prompt, /\b(?:ears?|paws?|tails?|wings?|clothing)\b/i)
  assert.match(result.prompt, /character faces viewer-right/i)
  assert.match(result.prompt, /small body rise and fall/i)
  assert.match(result.prompt, /translation across the canvas/i)
  assert.match(result.prompt, /returns smoothly to the first pose/i)
  assert.equal(result.promptCompiler.frameBeatCount, 8)
  assert.equal(result.promptCompiler.promptClauseIds.filter((id) => id.startsWith('frame-beat.')).length, 8)
  assertGptImage2PromptSafe(result.prompt)
})

test('every official generated action receives one unique beat for every configured frame', () => {
  const cases = [
    { actionId: 'idle', name: 'idle', animationType: 'stationary_loop', frameCount: 6 },
    { actionId: 'running-right', name: 'running right', animationType: 'locomotion_loop', viewDirection: 'character faces viewer-right', frameCount: 8 },
    { actionId: 'waving', name: 'waving', animationType: 'stationary_loop', frameCount: 4 },
    { actionId: 'jumping', name: 'jumping', animationType: 'vertical_bounce', frameCount: 5 },
    { actionId: 'failed', name: 'failed reaction', animationType: 'reaction', frameCount: 8 },
    { actionId: 'waiting', name: 'waiting', animationType: 'stationary_loop', frameCount: 6 },
    { actionId: 'running', name: 'working activity', animationType: 'stationary_loop', frameCount: 6 },
    { actionId: 'review', name: 'reviewing', animationType: 'stationary_loop', frameCount: 6 }
  ]

  for (const action of cases) {
    const result = buildActionSpriteRowPrompt({
      model: 'gpt-image-2',
      action: {
        ...action,
        loopType: action.animationType === 'locomotion_loop'
          ? 'seamless in-place cycle'
          : 'stable local loop',
        secondaryMotion: ['small controlled follow-through'],
        forbiddenMotion: ['viewpoint change', 'unplanned root drift']
      }
    })
    const beatLines = result.prompt.match(/^Cell \d+ \([^\n]+\) — .+$/gm) || []
    assert.equal(beatLines.length, action.frameCount, action.actionId)
    assert.equal(new Set(beatLines).size, action.frameCount, `${action.actionId} contains duplicate cell lines`)
    assert.equal(result.promptCompiler.frameBeatCount, action.frameCount)
    assert.match(result.prompt, /small controlled follow-through/i)
    assert.match(result.prompt, /viewpoint change/i)
    assert.match(result.prompt, /unplanned root drift/i)
    assert.doesNotMatch(result.prompt, /Frames?\s+\d+\s*[-–]\s*\d+/i)
  }
})

test('a single custom phase cannot collapse a complete frame plan', () => {
  const beats = buildActionFramePlan({
    action: {
      actionId: 'waving',
      name: 'waving',
      animationType: 'stationary_loop',
      framePlan: ['Frame 1: one vague custom pose']
    },
    frameCount: 4
  })

  assert.equal(beats.length, 4)
  assert.equal(new Set(beats).size, 4)
  assert.match(beats[0], /neutral anchored pose/i)
  assert.match(beats[2], /wave peak/i)
})

test('generic transparent-capable models retain direct transparency without changing semantic sections', () => {
  const result = buildCharacterAnchorPrompt({
    model: 'eligible-runtime-image-model'
  })
  assertHeadingOrder(result.prompt, [
    'DELIVERABLE',
    'REFERENCE',
    'CHANGE',
    'PRESERVE',
    'COMPOSITION',
    'BACKGROUND',
    'CONSTRAINTS'
  ])
  assert.match(result.prompt, /fully transparent background/i)
  assert.equal(result.promptCompiler.promptRenderer, 'generic-image-edit-v1')
  assert.equal(result.promptCompiler.backgroundStrategy, 'direct-transparent-output')
})

test('repair rendering contains one visible correction and a separate preservation contract', () => {
  const task = createProviderImageTask({
    taskType: 'action-keyframe',
    stage: 'repair',
    referenceRole: 'single-character-reference',
    action: {
      name: 'running right',
      animationType: 'locomotion_loop',
      moment: 'first contact pose',
      viewDirection: 'character faces viewer-right',
      loopType: 'seamless in-place cycle',
      movingParts: ['visible locomotion appendages'],
      secondaryMotion: ['small body rise and fall'],
      lockedParts: ['identity-bearing details', 'body proportions', 'scale'],
      forbiddenMotion: ['translation across the canvas'],
      loopIntent: 'return cleanly to the first frame'
    },
    requestedChanges: ['move the complete character inside the safe padding']
  })
  const result = compileProviderImagePrompt({
    task,
    model: 'gpt-image-2',
    visualPlan: createVisualPlan({
      action: task.action,
      requestedChanges: task.requestedChanges
    })
  })

  assertHeadingOrder(result.text, [
    'DELIVERABLE',
    'REFERENCE',
    'CHANGE ONLY',
    'KEEP UNCHANGED',
    'COMPOSITION',
    'ACTION PLAN',
    'BACKGROUND',
    'CONSTRAINTS'
  ])
  assert.equal((result.text.match(/Change only this observable issue:/gi) || []).length, 1)
  assert.match(result.text, /move the complete character inside the safe padding/i)
  assert.match(result.text, /Keep unchanged:/i)
  assert.doesNotMatch(result.text, /previous prompt|prompt history|prior attempt/i)
  assertGptImage2PromptSafe(result.text)
})

test('repair rendering rejects more than one visible correction', () => {
  const task = createProviderImageTask({
    taskType: 'action-keyframe',
    stage: 'repair',
    action: { name: 'wave', moment: 'raised greeting pose' },
    requestedChanges: ['fix the crop', 'change the direction']
  })
  assert.throws(
    () => compileProviderImagePrompt({
      task,
      model: 'gpt-image-2',
      visualPlan: createVisualPlan({ requestedChanges: task.requestedChanges })
    }),
    (error) => error?.code === 'image_prompt_repair_scope_invalid'
  )
})
