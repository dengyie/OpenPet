const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawn, spawnSync } = require('node:child_process')
const sharp = require('sharp')

const { normalizePluginManifest } = require('../../src/main/plugins/manifest')
const { normalizeConfigSchema } = require('../../src/main/plugins/config-schema')
const { createMinimalWebp } = require('../../examples/plugins/creator-studio/lib/fake-hatch-pet')

const pluginRoot = path.resolve(__dirname, '../../examples/plugins/creator-studio')
const createActionFrameQa = ({
  actionId = 'shy-spin',
  frameCount = 1,
  frameWidth = 192,
  frameHeight = 208,
  ok = true,
  visiblePixels = 192 * 208
} = {}) => ({
  ok,
  actionId,
  frameCount,
  frameWidth,
  frameHeight,
  frames: Array.from({ length: frameCount }, (_entry, index) => ({
    fileName: `${String(index + 1).padStart(4, '0')}.png`,
    width: frameWidth,
    height: frameHeight,
    visiblePixels
  })),
  warnings: []
})

test('creator studio example manifest declares hybrid creator workflow entries', () => {
  const manifest = normalizePluginManifest(
    JSON.parse(fs.readFileSync(path.join(pluginRoot, 'plugin.json'), 'utf-8')),
    { source: 'local', basePath: pluginRoot }
  )

  assert.equal(manifest.id, 'openpet.creator-studio')
  assert.equal(manifest.profile, 'hybrid')
  assert.deepEqual(manifest.permissions, ['pet-pack:import', 'pet:say', 'model:image-generate', 'assets:generate', 'trigger-proposals:write'])
  assert.deepEqual(manifest.commands.map((command) => command.id), [
    'create-run',
    'draft-task',
    'answer-question',
    'confirm-task',
    'run-step',
    'approve-run',
    'import-approved-pet',
    'import-approved-action',
    'export-bundle'
  ])
  assert.equal(manifest.entries.services[0].id, 'studio')
  assert.equal(manifest.entries.dashboards[0].id, 'main')
})

test('creator studio example config schema normalizes backend controls', () => {
  const schema = normalizeConfigSchema(
    JSON.parse(fs.readFileSync(path.join(pluginRoot, 'config.schema.json'), 'utf-8'))
  )

  assert.deepEqual(schema.properties.map((field) => field.key), [
    'backend',
    'autoActivateAfterImport',
    'servicePort'
  ])
  assert.deepEqual(schema.properties.find((field) => field.key === 'backend').enum, ['fixture', 'provider'])
})

test('creator studio run store normalizes legacy cloud and local backend values to provider', () => {
  const { createRun } = require('../../examples/plugins/creator-studio/lib/run-store')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-backend-normalize-'))

  const localRun = createRun({
    dataDir,
    input: { petName: 'Local Cat', prompt: 'A local generated cat', backend: 'local' },
    now: () => '2026-06-26T00:00:00.000Z'
  })
  const cloudRun = createRun({
    dataDir,
    input: { petName: 'Cloud Cat', prompt: 'A cloud generated cat', backend: 'cloud' },
    now: () => '2026-06-26T00:00:01.000Z'
  })
  const providerRun = createRun({
    dataDir,
    input: { petName: 'Provider Cat', prompt: 'A provider generated cat', backend: 'provider' },
    now: () => '2026-06-26T00:00:02.000Z'
  })

  assert.equal(localRun.backend, 'provider')
  assert.equal(localRun.input.backend, 'provider')
  assert.equal(localRun.backendStatus.backend, 'provider')
  assert.equal(localRun.modelProvider, 'provider')

  assert.equal(cloudRun.backend, 'provider')
  assert.equal(cloudRun.input.backend, 'provider')
  assert.equal(cloudRun.backendStatus.backend, 'provider')
  assert.equal(cloudRun.modelProvider, 'provider')

  assert.equal(providerRun.backend, 'provider')
  assert.equal(providerRun.input.backend, 'provider')
  assert.equal(providerRun.backendStatus.backend, 'provider')
  assert.equal(providerRun.modelProvider, 'provider')
})

test('creator studio wizard drafts a custom click-triggered single-action task', () => {
  const { draftGenerationTask } = require('../../examples/plugins/creator-studio/lib/conversation-wizard')

  const draft = draftGenerationTask({
    prompt: '给当前猫猫加一个“被摸头后害羞转圈”的动作，点击触发，风格保持一致。'
  })

  assert.equal(draft.generationTask.mode, 'single-action')
  assert.equal(draft.generationTask.targetPet, 'current')
  assert.equal(draft.generationTask.styleSource, 'currentPet')
  assert.match(draft.generationTask.actions[0].actionId, /^action-[0-9a-f]{8}$/)
  assert.equal(draft.generationTask.actions[0].name, '被摸头后害羞转圈')
  assert.equal(draft.generationTask.actions[0].loop, false)
  assert.equal(draft.generationTask.actions[0].frameCount, 16)
  assert.deepEqual(draft.generationTask.actions[0].triggerProposal, {
    type: 'click',
    binding: 'clickAction',
    notes: 'User requested click trigger.'
  })
  assert.deepEqual(draft.generationTask.questions, [])
})

test('creator studio wizard asks one trigger question for ambiguous custom actions', () => {
  const { draftGenerationTask } = require('../../examples/plugins/creator-studio/lib/conversation-wizard')

  const draft = draftGenerationTask({
    prompt: '新增一个自定义动作：原地打滚，动作要循环。'
  })

  assert.equal(draft.generationTask.mode, 'single-action')
  assert.equal(draft.generationTask.actions[0].name, '原地打滚')
  assert.equal(draft.generationTask.actions[0].loop, true)
  assert.equal(draft.generationTask.actions[0].triggerProposal.type, 'unbound')
  assert.deepEqual(draft.generationTask.questions, [{
    id: 'trigger',
    question: 'How should this custom action be triggered?',
    options: ['manual', 'click', 'random', 'state', 'event', 'unbound']
  }])
})

test('creator studio wizard does not treat legacy pet prompts as action tasks', () => {
  const { shouldDraftGenerationTask } = require('../../examples/plugins/creator-studio/lib/conversation-wizard')

  assert.equal(shouldDraftGenerationTask({ prompt: 'A small mint helper cat' }), false)
  assert.equal(shouldDraftGenerationTask({ prompt: '帮我做一只软乎乎的橘猫桌宠' }), false)
  assert.equal(shouldDraftGenerationTask({ prompt: '新增一个动作，但是按旧版流程创建', mode: 'legacy' }), false)
  assert.equal(shouldDraftGenerationTask({ prompt: '生成一只完整的新桌宠', mode: 'full-pet' }), false)
  assert.equal(shouldDraftGenerationTask({ prompt: '新增一个自定义动作：原地打滚，动作要循环。' }), true)
  assert.equal(shouldDraftGenerationTask({ prompt: 'A custom action that waves on click', mode: 'single-action' }), true)
})

test('creator studio generation task validation rejects unsafe trigger proposals', () => {
  const { normalizeGenerationTask } = require('../../examples/plugins/creator-studio/lib/generation-task')

  assert.throws(
    () => normalizeGenerationTask({
      mode: 'single-action',
      targetPet: 'current',
      styleSource: 'currentPet',
      actions: [{
        actionId: 'bad-action',
        name: 'Bad Action',
        motionPrompt: 'Move around',
        triggerProposal: { type: 'shell' }
      }]
    }),
    /trigger type is invalid/
  )
})

test('creator studio generation task validation clamps action frame count to builder limits', () => {
  const { normalizeGenerationTask } = require('../../examples/plugins/creator-studio/lib/generation-task')

  const task = normalizeGenerationTask({
    mode: 'single-action',
    targetPet: 'current',
    styleSource: 'currentPet',
    actions: [{
      actionId: 'many-frames',
      name: 'Many Frames',
      motionPrompt: 'Move around',
      frameCount: 96,
      triggerProposal: { type: 'manual' }
    }]
  })

  assert.equal(task.actions[0].frameCount, 32)
})

test('creator studio prompt builder creates an OpenPet full-pet prompt with runtime and boundary rules', () => {
  const { buildOpenPetImagePrompt } = require('../../examples/plugins/creator-studio/lib/openpet-prompt-builder')
  const { normalizeGenerationTask } = require('../../examples/plugins/creator-studio/lib/generation-task')
  const generationTask = normalizeGenerationTask({
    mode: 'full-pet',
    targetPet: 'new',
    styleSource: 'textOnly',
    characterBrief: '一只软乎乎的橘猫桌宠，喜欢睡在键盘旁边。',
    actions: [{
      actionId: 'idle',
      name: 'Idle',
      motionPrompt: 'neutral idle pose',
      loop: true,
      frameCount: 12,
      triggerProposal: { type: 'state', binding: 'idle' }
    }]
  })

  const built = buildOpenPetImagePrompt({
    run: {
      petId: 'orange-cat',
      input: {
        prompt: '一只软乎乎的橘猫桌宠，喜欢睡在键盘旁边。',
        generationTask
      }
    },
    backend: 'provider',
    model: 'gpt-image-2'
  })

  assert.equal(built.mode, 'full-pet')
  assert.equal(built.actionId, 'idle')
  assert.deepEqual(built.sections, [
    'Intent',
    'OpenPet Runtime Contract',
    'Canvas And Boundary Rules',
    'Background And Transparency Policy',
    'Character Shape Language',
    'Generation Mode',
    'Action Requirements',
    'Style Consistency',
    'Output Requirements',
    'Negative Constraints',
    'User Creative Brief'
  ])
  assert.match(built.prompt, /OpenPet desktop pet sprite asset/)
  assert.match(built.prompt, /small floating desktop pet window/)
  assert.match(built.prompt, /exactly one pet character/)
  assert.match(built.prompt, /8-12% safe padding/)
  assert.match(built.prompt, /no cropped ears, tail, paws, limbs/)
  assert.match(built.prompt, /compact desktop-pet body/)
  assert.match(built.prompt, /full-pet/)
  assert.match(built.prompt, /transparent-friendly, easy cutout silhouette/)
  assert.match(built.prompt, /no text, logo, watermark/)
  assert.match(built.prompt, /一只软乎乎的橘猫桌宠/)
  assert.equal(built.prompt.includes('response_format'), false)
})

test('creator studio prompt builder preserves custom action semantics and current-pet style consistency', () => {
  const { buildOpenPetImagePrompt } = require('../../examples/plugins/creator-studio/lib/openpet-prompt-builder')
  const { draftGenerationTask } = require('../../examples/plugins/creator-studio/lib/conversation-wizard')
  const draft = draftGenerationTask({
    prompt: '新增一个自定义动作：原地打滚，动作要循环。'
  })

  const built = buildOpenPetImagePrompt({
    run: {
      petId: 'current-cat',
      input: {
        prompt: draft.originalPrompt,
        originalPrompt: draft.originalPrompt,
        generationTask: draft.generationTask
      }
    },
    backend: 'provider',
    model: 'local-pet-sprite'
  })

  assert.equal(built.mode, 'single-action')
  assert.equal(built.actionId, draft.generationTask.actions[0].actionId)
  assert.match(built.prompt, /Mode: single-action/)
  assert.match(built.prompt, /Target: current/)
  assert.match(built.prompt, /Action ID: action-[0-9a-f]{8}/)
  assert.match(built.prompt, /Action name: 原地打滚/)
  assert.match(built.prompt, /Loop policy: looping/)
  assert.match(built.prompt, /Frame count intent: 12/)
  assert.match(built.prompt, /Trigger: unbound/)
  assert.match(built.prompt, /keep the current pet's style, proportions, palette, facial design, and line work/i)
  assert.match(built.prompt, /same character identity/)
  assert.match(built.prompt, /新增一个自定义动作：原地打滚/)
})

test('creator studio prompt builder filters secrets paths and bridge details from prompts', () => {
  const { buildOpenPetImagePrompt } = require('../../examples/plugins/creator-studio/lib/openpet-prompt-builder')

  const built = buildOpenPetImagePrompt({
    run: {
      petId: 'unsafe-cat',
      input: {
        prompt: 'Make a cat. API key sk-test-secret at /Users/mango/private/ref.png via http://127.0.0.1:8317/v1 and bridge-token.',
        originalPrompt: 'Make a cat. API key sk-test-secret at /Users/mango/private/ref.png via http://127.0.0.1:8317/v1 and bridge-token.'
      }
    },
    backend: 'provider',
    model: 'gpt-image-2'
  })

  assert.match(built.prompt, /OpenPet desktop pet sprite asset/)
  assert.equal(built.prompt.includes('sk-test-secret'), false)
  assert.equal(built.prompt.includes('/Users/mango/private/ref.png'), false)
  assert.equal(built.prompt.includes('127.0.0.1:8317'), false)
  assert.equal(built.prompt.includes('bridge-token'), false)
  assert.equal(built.warnings.includes('creative_brief_sanitized'), true)
})

test('creator studio run store creates and advances durable run state', () => {
  const { createRun, readRun, updateRunStatus } = require('../../examples/plugins/creator-studio/lib/run-store')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-test-'))

  const run = createRun({
    dataDir,
    input: {
      petName: 'Sprout Cat',
      prompt: 'A small mint helper cat',
      backend: 'fixture'
    },
    now: () => '2026-06-19T00:00:00.000Z'
  })
  const updated = updateRunStatus({
    dataDir,
    runId: run.runId,
    status: 'prepared',
    patch: { currentStep: 'prepare' },
    now: () => '2026-06-19T00:01:00.000Z'
  })

  assert.equal(run.status, 'draft')
  assert.equal(readRun({ dataDir, runId: run.runId }).input.petName, 'Sprout Cat')
  assert.deepEqual(run.backendStatus, {
    backend: 'fixture',
    state: 'idle',
    message: '',
    updatedAt: '2026-06-19T00:00:00.000Z'
  })
  assert.equal(updated.status, 'prepared')
  assert.equal(updated.currentStep, 'prepare')
})

test('creator studio run store persists conversational generation tasks', () => {
  const { createRun, readRun } = require('../../examples/plugins/creator-studio/lib/run-store')
  const { draftGenerationTask } = require('../../examples/plugins/creator-studio/lib/conversation-wizard')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-task-'))
  const draft = draftGenerationTask({
    prompt: '给当前猫猫加一个“被摸头后害羞转圈”的动作，点击触发，风格保持一致。'
  })

  const run = createRun({
    dataDir,
    input: {
      petName: 'Task Cat',
      prompt: draft.originalPrompt,
      backend: 'fixture',
      generationTask: draft.generationTask,
      originalPrompt: draft.originalPrompt
    },
    now: () => '2026-06-19T00:00:00.000Z'
  })
  const persisted = readRun({ dataDir, runId: run.runId })

  assert.equal(persisted.input.originalPrompt, draft.originalPrompt)
  assert.equal(persisted.generationTask.actions[0].name, '被摸头后害羞转圈')
  assert.equal(persisted.generationTask.actions[0].triggerProposal.type, 'click')
  assert.equal(fs.existsSync(path.join(dataDir, 'runs', run.runId, 'inputs', 'generation-task.json')), true)
  assert.equal(fs.existsSync(path.join(dataDir, 'runs', run.runId, 'inputs', 'original-prompt.txt')), true)
  assert.equal(persisted.taskStatus, 'ready_for_confirmation')
  assert.deepEqual(persisted.conversation, {
    originalPrompt: draft.originalPrompt,
    answers: []
  })
})

test('creator studio task workflow drafts answers and confirms custom actions', () => {
  const {
    answerTaskQuestion,
    confirmTaskRun,
    draftTaskRun
  } = require('../../examples/plugins/creator-studio/lib/task-workflow')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-task-workflow-'))

  const draft = draftTaskRun({
    dataDir,
    payload: {
      prompt: '新增一个自定义动作：原地打滚，动作要循环。',
      backend: 'fixture'
    },
    now: () => '2026-06-20T00:00:00.000Z'
  })

  assert.equal(draft.run.status, 'draft')
  assert.equal(draft.run.taskStatus, 'needs_input')
  assert.equal(draft.run.generationTask.mode, 'single-action')
  assert.equal(draft.run.generationTask.actions[0].name, '原地打滚')
  assert.equal(draft.run.generationTask.actions[0].triggerProposal.type, 'unbound')
  assert.equal(draft.run.generationTask.questions[0].id, 'trigger')

  const answered = answerTaskQuestion({
    dataDir,
    runId: draft.run.runId,
    questionId: 'trigger',
    answer: 'click',
    now: () => '2026-06-20T00:01:00.000Z'
  })

  assert.equal(answered.run.taskStatus, 'ready_for_confirmation')
  assert.equal(answered.run.generationTask.questions.length, 0)
  assert.deepEqual(answered.run.generationTask.actions[0].triggerProposal, {
    type: 'click',
    binding: 'clickAction',
    notes: 'User selected click trigger.'
  })
  assert.deepEqual(answered.run.conversation.answers, [{
    questionId: 'trigger',
    answer: 'click',
    answeredAt: '2026-06-20T00:01:00.000Z'
  }])

  const confirmed = confirmTaskRun({
    dataDir,
    runId: draft.run.runId,
    now: () => '2026-06-20T00:02:00.000Z'
  })
  const logs = fs.readFileSync(path.join(dataDir, 'runs', draft.run.runId, 'logs', 'events.jsonl'), 'utf-8')
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line))

  assert.equal(confirmed.run.taskStatus, 'confirmed')
  assert.equal(confirmed.run.status, 'draft')
  assert.equal(confirmed.run.currentStep, 'confirmed')
  assert.deepEqual(logs.map((entry) => entry.event), [
    'task.drafted',
    'task.question_answered',
    'task.confirmed'
  ])
})

test('creator studio task workflow rejects invalid question answers and unresolved confirmation', () => {
  const {
    answerTaskQuestion,
    confirmTaskRun,
    draftTaskRun
  } = require('../../examples/plugins/creator-studio/lib/task-workflow')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-task-invalid-'))
  const draft = draftTaskRun({
    dataDir,
    payload: {
      prompt: '新增一个自定义动作：原地打滚，动作要循环。',
      backend: 'fixture'
    },
    now: () => '2026-06-20T00:00:00.000Z'
  })

  assert.throws(
    () => answerTaskQuestion({
      dataDir,
      runId: draft.run.runId,
      questionId: 'trigger',
      answer: 'shell'
    }),
    /answer is invalid/
  )
  assert.throws(
    () => confirmTaskRun({
      dataDir,
      runId: draft.run.runId
    }),
    /remaining questions/
  )
})

test('creator studio run store keeps same-name same-day runs separate', () => {
  const { createRun } = require('../../examples/plugins/creator-studio/lib/run-store')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-collisions-'))

  const first = createRun({
    dataDir,
    input: {
      petName: 'Sprout Cat',
      prompt: 'First concept',
      backend: 'fixture'
    },
    now: () => '2026-06-19T00:00:00.000Z'
  })
  const second = createRun({
    dataDir,
    input: {
      petName: 'Sprout Cat',
      prompt: 'Second concept',
      backend: 'fixture'
    },
    now: () => '2026-06-19T00:00:00.000Z'
  })

  assert.notEqual(first.runId, second.runId)
  assert.equal(fs.readFileSync(path.join(dataDir, 'runs', first.runId, 'inputs', 'prompt.md'), 'utf-8'), 'First concept\n')
  assert.equal(fs.readFileSync(path.join(dataDir, 'runs', second.runId, 'inputs', 'prompt.md'), 'utf-8'), 'Second concept\n')
})

test('creator studio run store lists runs and persists append-only logs', () => {
  const { appendRunLog, createRun, listRuns, readRunLogs } = require('../../examples/plugins/creator-studio/lib/run-store')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-run-list-'))

  const first = createRun({
    dataDir,
    input: { petName: 'First Cat', prompt: 'First prompt', backend: 'fixture' },
    now: () => '2026-06-19T00:00:00.000Z'
  })
  const second = createRun({
    dataDir,
    input: { petName: 'Second Cat', prompt: 'Second prompt', backend: 'fixture' },
    now: () => '2026-06-19T00:02:00.000Z'
  })
  appendRunLog({
    dataDir,
    runId: second.runId,
    level: 'info',
    event: 'generate.start',
    message: 'Generation started',
    now: () => '2026-06-19T00:03:00.000Z'
  })

  assert.deepEqual(listRuns({ dataDir }).map((run) => run.runId), [second.runId, first.runId])
  assert.deepEqual(readRunLogs({ dataDir, runId: second.runId }), [{
    timestamp: '2026-06-19T00:03:00.000Z',
    level: 'info',
    event: 'generate.start',
    message: 'Generation started',
    data: {}
  }])
})

test('creator studio run store resolves latest run by workflow status', () => {
  const { createRun, resolveRunId, updateRunStatus } = require('../../examples/plugins/creator-studio/lib/run-store')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-resolve-run-'))

  const oldRun = createRun({
    dataDir,
    input: { petName: 'Old Cat', prompt: 'Old prompt', backend: 'fixture' },
    now: () => '2026-06-19T00:00:00.000Z'
  })
  const latestRun = createRun({
    dataDir,
    input: { petName: 'Latest Cat', prompt: 'Latest prompt', backend: 'fixture' },
    now: () => '2026-06-19T00:01:00.000Z'
  })
  updateRunStatus({
    dataDir,
    runId: oldRun.runId,
    status: 'ready_for_review',
    now: () => '2026-06-19T00:02:00.000Z'
  })
  updateRunStatus({
    dataDir,
    runId: latestRun.runId,
    status: 'ready_for_review',
    now: () => '2026-06-19T00:03:00.000Z'
  })

  assert.equal(resolveRunId({
    dataDir,
    statuses: ['ready_for_review'],
    description: 'ready_for_review'
  }), latestRun.runId)
  assert.equal(resolveRunId({
    dataDir,
    runId: oldRun.runId,
    statuses: ['ready_for_review']
  }), oldRun.runId)
  assert.equal(resolveRunId({
    dataDir,
    statuses: ['ready_for_review'],
    description: 'ready_for_review fixture run',
    filter: (run) => run.runId === oldRun.runId
  }), oldRun.runId)
  assert.throws(
    () => resolveRunId({
      dataDir,
      statuses: ['ready_for_review'],
      description: 'ready_for_review imported',
      filter: (run) => run.importStatus === 'imported'
    }),
    /No ready_for_review imported run found/
  )
  assert.throws(
    () => resolveRunId({ dataDir, statuses: ['approved'], description: 'approved' }),
    /No approved run found/
  )
})

test('creator studio backend runner generates fixture output through the selected adapter', async () => {
  const { readRunLogs } = require('../../examples/plugins/creator-studio/lib/run-store')
  const { confirmTaskRun, draftTaskRun } = require('../../examples/plugins/creator-studio/lib/task-workflow')
  const { runGenerationStep } = require('../../examples/plugins/creator-studio/lib/backend-runner')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-output-'))
  const draft = draftTaskRun({
    dataDir,
    payload: {
      petName: 'Sprout Cat',
      prompt: '给当前猫猫加一个“被摸头后害羞转圈”的动作，点击触发，风格保持一致。',
      backend: 'fixture'
    },
    now: () => '2026-06-19T00:00:00.000Z'
  })
  const confirmed = confirmTaskRun({
    dataDir,
    runId: draft.run.runId,
    now: () => '2026-06-19T00:01:00.000Z'
  })

  const output = await runGenerationStep({ dataDir, runId: confirmed.run.runId })
  const manifest = JSON.parse(fs.readFileSync(path.join(output.outputDir, 'pet.json'), 'utf-8'))
  const actionQa = JSON.parse(fs.readFileSync(path.join(dataDir, 'runs', confirmed.run.runId, 'qa', 'action-generation-task.json'), 'utf-8'))
  const atlasQa = JSON.parse(fs.readFileSync(path.join(dataDir, 'runs', confirmed.run.runId, 'qa', 'atlas-validation.json'), 'utf-8'))
  const atlasStats = await sharp(path.join(output.outputDir, 'spritesheet.webp'))
    .ensureAlpha()
    .raw()
    .stats()
  const bundleHash = crypto.createHash('sha256').update(fs.readFileSync(output.bundlePath)).digest('hex')

  assert.equal(manifest.id, confirmed.run.petId)
  assert.equal(manifest.spritesheetPath, 'spritesheet.webp')
  assert.equal(manifest.creatorStudio.mode, 'single-action')
  assert.equal(manifest.creatorStudio.actions[0].name, '被摸头后害羞转圈')
  assert.equal(manifest.creatorStudio.importPolicy.appliesTriggerAutomatically, false)
  assert.equal(actionQa.ok, true)
  assert.equal(actionQa.mode, 'single-action')
  assert.equal(actionQa.targetPet, 'current')
  assert.equal(actionQa.styleSource, 'currentPet')
  assert.equal(actionQa.actions[0].name, '被摸头后害羞转圈')
  assert.equal(actionQa.actions[0].triggerProposal.type, 'click')
  assert.equal(actionQa.importPolicy.appliesTriggerAutomatically, false)
  assert.equal(actionQa.importPolicy.triggerProposalOwner, 'openpet-host')
  assert.equal(atlasQa.visiblePixels > 0, true)
  assert.equal(atlasStats.channels[3].max > 0, true)
  assert.equal(fs.existsSync(path.join(output.outputDir, 'spritesheet.webp')), true)
  assert.equal(fs.existsSync(output.bundlePath), true)
  assert.equal(output.sha256, bundleHash)
  assert.equal(output.run.taskStatus, 'confirmed')
  assert.equal(output.run.backendStatus.state, 'ready')
  assert.equal(output.run.backendStatus.backend, 'fixture')
  assert.deepEqual(readRunLogs({ dataDir, runId: confirmed.run.runId }).map((entry) => entry.event), [
    'task.drafted',
    'task.confirmed',
    'generate.start',
    'generate.complete'
  ])
})

test('creator studio backend runner refuses unresolved conversational tasks before generation', async () => {
  const { draftTaskRun } = require('../../examples/plugins/creator-studio/lib/task-workflow')
  const { readRun } = require('../../examples/plugins/creator-studio/lib/run-store')
  const { runGenerationStep } = require('../../examples/plugins/creator-studio/lib/backend-runner')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-unconfirmed-task-'))
  const draft = draftTaskRun({
    dataDir,
    payload: {
      petName: 'Unconfirmed Cat',
      prompt: '新增一个自定义动作：原地打滚，动作要循环。',
      backend: 'fixture'
    },
    now: () => '2026-06-20T01:00:00.000Z'
  })

  await assert.rejects(
    runGenerationStep({ dataDir, runId: draft.run.runId }),
    /Creator Studio task must be confirmed before generation/
  )
  const failed = readRun({ dataDir, runId: draft.run.runId })
  assert.equal(failed.status, 'failed')
  assert.equal(failed.taskStatus, 'needs_input')
  assert.match(failed.error, /must be confirmed/)
  assert.equal(fs.existsSync(path.join(dataDir, 'runs', draft.run.runId, 'outputs', 'pet.json')), false)
})

test('creator studio backend runner records unavailable provider backend without fixture fallback', async () => {
  const { createRun, readRun, readRunLogs } = require('../../examples/plugins/creator-studio/lib/run-store')
  const { runGenerationStep } = require('../../examples/plugins/creator-studio/lib/backend-runner')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-provider-'))
  const run = createRun({
    dataDir,
    input: { petName: 'Cloud Cat', prompt: 'A cloud generated cat', backend: 'cloud' },
    now: () => '2026-06-19T00:00:00.000Z'
  })

  await assert.rejects(
    runGenerationStep({ dataDir, runId: run.runId }),
    /Provider backend is not configured/
  )
  const failed = readRun({ dataDir, runId: run.runId })
  assert.equal(failed.status, 'failed')
  assert.equal(failed.currentStep, 'generate')
  assert.equal(failed.backendStatus.backend, 'provider')
  assert.equal(failed.backendStatus.state, 'not_configured')
  assert.match(failed.error, /Provider backend is not configured/)
  assert.equal(fs.existsSync(path.join(dataDir, 'runs', run.runId, 'outputs', 'pet.json')), false)
  assert.deepEqual(readRunLogs({ dataDir, runId: run.runId }).map((entry) => entry.event), [
    'generate.start',
    'generate.failed'
  ])
})

const createCommandInput = ({ command, payload = {}, config = {} }) => `${JSON.stringify({
      pluginId: 'openpet.creator-studio',
      commandId: command,
      payload,
      config: { backend: 'fixture', autoActivateAfterImport: true, ...config },
      paths: { extensionDir: pluginRoot }
    })}\n`

const createCommandEnv = ({ dataDir, env = {} }) => ({
  ...process.env,
  OPENPET_DATA_DIR: dataDir,
  OPENPET_CACHE_DIR: path.join(dataDir, 'cache'),
  OPENPET_LOG_DIR: path.join(dataDir, 'logs'),
  ...env
})

const parseCommandJson = (stdout) => JSON.parse(stdout.trim().split(/\r?\n/).filter(Boolean).at(-1))

const runCreatorCommand = ({ command, dataDir, payload = {}, config = {}, env = {} }) => {
  const result = spawnSync(process.execPath, [path.join(pluginRoot, 'commands', `${command}.js`)], {
    input: createCommandInput({ command, payload, config }),
    env: {
      ...createCommandEnv({ dataDir, env })
    },
    encoding: 'utf-8'
  })
  return {
    ...result,
    json: parseCommandJson(result.stdout)
  }
}

const createBridgeServer = ({ routes }) => {
  const requests = []
  const server = require('node:http').createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      const payload = body ? JSON.parse(body) : {}
      requests.push({ method: request.method, url: request.url, payload })
      const handler = routes.find((route) => request.url.endsWith(route.path))?.handler
      const result = handler
        ? handler({ request, payload, requests })
        : { status: 404, body: { ok: false, error: 'Not found' } }
      response.writeHead(result.status || 200, {
        'Content-Type': 'application/json',
        Connection: 'close'
      })
      response.end(JSON.stringify(result.body))
    })
  })
  return { server, requests }
}

const runCreatorCommandAsync = ({ command, dataDir, payload = {}, config = {}, env = {} }) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(pluginRoot, 'commands', `${command}.js`)], {
    env: createCommandEnv({ dataDir, env }),
    stdio: ['pipe', 'pipe', 'pipe']
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.on('error', reject)
  child.on('close', (status, signal) => {
    try {
      resolve({ status, signal, stdout, stderr, json: parseCommandJson(stdout) })
    } catch (error) {
      reject(error)
    }
  })
  child.stdin.end(createCommandInput({ command, payload, config }))
})

test('creator studio run-step command fails unavailable provider backend with persisted run state', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-provider-command-'))

  const created = runCreatorCommand({
    command: 'create-run',
    dataDir,
    payload: { petName: 'Local Cat', prompt: 'A local generated cat', backend: 'local' },
    config: { backend: 'provider' }
  })
  const generated = runCreatorCommand({
    command: 'run-step',
    dataDir,
    payload: { runId: created.json.run.runId },
    config: { backend: 'provider' }
  })
  const run = JSON.parse(fs.readFileSync(path.join(dataDir, 'runs', created.json.run.runId, 'run.json'), 'utf-8'))

  assert.equal(created.status, 0)
  assert.equal(generated.status, 1)
  assert.equal(generated.json.ok, false)
  assert.match(generated.json.error, /Provider backend is not configured/)
  assert.equal(run.status, 'failed')
  assert.equal(run.backendStatus.backend, 'provider')
  assert.equal(run.backendStatus.state, 'not_configured')
})

test('creator studio run-step command uses host bridge for provider generation when available', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-local-bridge-'))
  const requests = []
  const created = runCreatorCommand({
    command: 'create-run',
    dataDir,
    payload: { petName: 'Local Cat', prompt: '新增一个自定义动作：原地打滚，动作要循环，点击触发。', backend: 'local' },
    config: { backend: 'provider' }
  })
  const bridgeServer = require('node:http').createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      const payload = body ? JSON.parse(body) : {}
      requests.push({ method: request.method, url: request.url, payload })
      response.writeHead(200, {
        'Content-Type': 'application/json',
        Connection: 'close'
      })
      if (request.url.endsWith('/creator/model-image-generate')) {
        const dataRelativePath = `runs/${created.json.run.runId}/frames/base/0001.png`
        const generatedPath = path.join(dataDir, dataRelativePath)
        fs.mkdirSync(path.dirname(generatedPath), { recursive: true })
        sharp({
          create: {
            width: 96,
            height: 112,
            channels: 4,
            background: { r: 20, g: 170, b: 120, alpha: 1 }
          }
        })
          .png()
          .toFile(generatedPath)
          .then(() => {
            response.end(JSON.stringify({
              ok: true,
              result: {
                ok: true,
                provider: 'openai-compatible',
                model: 'local-pet-sprite',
                generatedAt: '2026-06-19T00:00:00.000Z',
                outputs: [{
                  dataRelativePath,
                  mimeType: 'image/png',
                  sha256: 'local-bridge-sha'
                }]
              }
            }))
          })
          .catch((error) => {
            response.end(JSON.stringify({ ok: false, error: error.message }))
        })
        return
      }
      if (request.url.endsWith('/creator/model-settings')) {
        response.end(JSON.stringify({
          ok: true,
          config: {
            provider: 'openai-compatible',
            baseUrl: 'http://127.0.0.1:7860/v1',
            model: 'local-custom-sprite-v2',
            apiKeyRef: 'secret:model.image.openai.apiKey',
            timeoutMs: 120000,
            maxConcurrentJobs: 1,
            hasApiKey: true,
            apiKeyPreview: '••••test',
            apiKeyLabel: 'Image API Key'
          }
        }))
        return
      }
      if (request.url.endsWith('/creator/model-health-check')) {
        response.end(JSON.stringify({
          ok: true,
          result: {
            ok: true,
            provider: 'openai-compatible',
            code: 'provider_healthy',
            message: 'Image Provider is reachable'
          }
        }))
        return
      }
      response.end(JSON.stringify({
          ok: true,
          config: {
          provider: 'openai-compatible',
          baseUrl: 'http://127.0.0.1:7860/v1',
          model: 'local-pet-sprite',
          apiKeyRef: 'secret:model.image.openai.apiKey',
          timeoutMs: 120000,
          maxConcurrentJobs: 1,
          hasApiKey: true,
          apiKeyPreview: '••••test',
          apiKeyLabel: 'Image API Key'
        }
      }))
    })
  })
  await new Promise((resolve) => bridgeServer.listen(0, '127.0.0.1', resolve))
  const port = bridgeServer.address().port

  try {
    const generated = await runCreatorCommandAsync({
      command: 'run-step',
      dataDir,
      payload: { runId: created.json.run.runId },
      config: { backend: 'provider' },
      env: {
        OPENPET_BRIDGE_URL: `http://127.0.0.1:${port}`,
        OPENPET_BRIDGE_TOKEN: 'bridge-token'
      }
    })
    const run = JSON.parse(fs.readFileSync(path.join(dataDir, 'runs', created.json.run.runId, 'run.json'), 'utf-8'))
    const actionFrames = run.artifacts.actionFrames
    const frameQa = JSON.parse(fs.readFileSync(actionFrames.qa, 'utf-8'))
    const firstFramePath = path.join(actionFrames.framesDir, '0001.png')
    const lastFramePath = path.join(actionFrames.framesDir, `${String(actionFrames.frameCount).padStart(4, '0')}.png`)
    const firstFrameStats = await sharp(firstFramePath).ensureAlpha().raw().stats()

    assert.equal(created.status, 0)
    assert.equal(generated.status, 0)
    assert.equal(generated.json.ok, true)
    assert.equal(generated.json.run.backendStatus.backend, 'provider')
    assert.equal(generated.json.run.backendStatus.state, 'ready')
    assert.equal(run.status, 'ready_for_review')
    assert.equal(run.backendStatus.state, 'ready')
    assert.equal(run.artifacts.generatedImage.outputs[0].dataRelativePath, `runs/${created.json.run.runId}/frames/base/0001.png`)
    assert.equal(actionFrames.actionId, run.generationTask.actions[0].actionId)
    assert.equal(actionFrames.name, '原地打滚')
    assert.equal(actionFrames.frameCount, 12)
    assert.equal(actionFrames.frameWidth, 192)
    assert.equal(actionFrames.frameHeight, 208)
    assert.equal(fs.existsSync(firstFramePath), true)
    assert.equal(fs.existsSync(lastFramePath), true)
    assert.equal(firstFrameStats.channels[3].max > 0, true)
    assert.equal(frameQa.ok, true)
    assert.equal(frameQa.sourceRelativePath, `runs/${created.json.run.runId}/frames/base/0001.png`)
    assert.equal(frameQa.actionId, actionFrames.actionId)
    assert.equal(frameQa.playback.loop, true)
    assert.equal(frameQa.playback.frameDurationsMs.length, 12)
    assert.equal(frameQa.playback.frameDurationsMs.every((duration) => duration === 120), true)
    assert.equal(frameQa.playback.totalDurationMs, 1440)
    assert.equal(frameQa.playback.timeline.length, 12)
    assert.deepEqual(frameQa.playback.timeline[0], {
      fileName: '0001.png',
      frameIndex: 0,
      durationMs: 120,
      startMs: 0,
      endMs: 120
    })
    assert.equal(JSON.stringify(frameQa).includes(dataDir), false)
    assert.match(requests[1].payload.prompt, /OpenPet desktop pet sprite asset/)
    assert.match(requests[1].payload.prompt, /Canvas And Boundary Rules/)
    assert.match(requests[1].payload.prompt, /Action name: 原地打滚/)
    assert.match(requests[1].payload.prompt, /Loop policy: looping/)
    assert.match(requests[1].payload.prompt, /Model: local-custom-sprite-v2/)
    assert.notEqual(requests[1].payload.prompt, '新增一个自定义动作：原地打滚，动作要循环，点击触发。')
    assert.equal(requests[1].payload.prompt.includes('bridge-token'), false)
    assert.deepEqual(run.modelSnapshot, {
      backend: 'provider',
      provider: 'openai-compatible',
      model: 'local-custom-sprite-v2',
      baseUrlHost: '127.0.0.1:7860'
    })
    assert.deepEqual(run.artifacts.generatedImage.modelSnapshot, run.modelSnapshot)
    assert.equal(run.artifacts.generatedImage.promptBuilder.version, 1)
    assert.equal(run.artifacts.generatedImage.promptBuilder.mode, 'single-action')
    assert.deepEqual(run.artifacts.generatedImage.promptBuilder.warnings, [])
    assert.deepEqual(requests.map((entry) => entry.url), ['/creator/model-settings', '/creator/model-image-generate'])
  } finally {
    bridgeServer.closeAllConnections?.()
    await new Promise((resolve) => bridgeServer.close(resolve))
  }
})

test('creator studio run-step command fails and persists run state when provider image generation times out', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-provider-timeout-'))
  const created = runCreatorCommand({
    command: 'create-run',
    dataDir,
    payload: {
      petName: 'Cloud Timeout Cat',
      prompt: '新增一个自定义动作：原地打滚，动作要循环，点击触发。',
      backend: 'provider'
    },
    config: { backend: 'provider' }
  })

  const bridgeServer = require('node:http').createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      void body
      setTimeout(() => {
        if (response.writableEnded) return
        response.writeHead(400, {
          'Content-Type': 'application/json',
          Connection: 'close'
        })
        response.end(JSON.stringify({
          ok: false,
          error: 'Provider image generation timed out after 120000ms'
        }))
      }, 25)
    })
  })
  await new Promise((resolve) => bridgeServer.listen(0, '127.0.0.1', resolve))
  const port = bridgeServer.address().port

  try {
    const generated = await runCreatorCommandAsync({
      command: 'run-step',
      dataDir,
      payload: { runId: created.json.run.runId },
      config: { backend: 'provider' },
      env: {
        OPENPET_BRIDGE_URL: `http://127.0.0.1:${port}`,
        OPENPET_BRIDGE_TOKEN: 'bridge-token'
      }
    })
    const runPath = path.join(dataDir, 'runs', created.json.run.runId, 'run.json')
    const logPath = path.join(dataDir, 'runs', created.json.run.runId, 'logs', 'events.jsonl')
    const run = JSON.parse(fs.readFileSync(runPath, 'utf-8'))
    const events = fs.readFileSync(logPath, 'utf-8').trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))

    assert.equal(created.status, 0)
    assert.equal(generated.status, 1)
    assert.equal(generated.json.ok, false)
    assert.match(generated.json.error, /timed out after 120000ms/i)
    assert.equal(run.status, 'failed')
    assert.equal(run.currentStep, 'generate')
    assert.equal(run.backendStatus.backend, 'provider')
    assert.equal(run.backendStatus.state, 'failed')
    assert.match(run.backendStatus.message, /timed out after 120000ms/i)
    assert.match(run.error, /timed out after 120000ms/i)
    assert.deepEqual(events.map((entry) => entry.event), ['generate.start', 'generate.failed'])
  } finally {
    bridgeServer.closeAllConnections?.()
    await new Promise((resolve) => bridgeServer.close(resolve))
  }
})

test('creator studio run-step command surfaces provider business errors from the bridge', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-provider-business-error-'))
  const created = runCreatorCommand({
    command: 'create-run',
    dataDir,
    payload: {
      petName: 'Cloud Business Error Cat',
      prompt: '新增一个自定义动作：开心挥手，动作要循环，点击触发。',
      backend: 'provider'
    },
    config: { backend: 'provider' }
  })

  const bridgeServer = require('node:http').createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      void body
      response.writeHead(200, {
        'Content-Type': 'application/json',
        Connection: 'close'
      })
      response.end(JSON.stringify({
        ok: false,
        error: '该接口未接入公益站独立网关，旧转发链路已关闭'
      }))
    })
  })
  await new Promise((resolve) => bridgeServer.listen(0, '127.0.0.1', resolve))
  const port = bridgeServer.address().port

  try {
    const generated = await runCreatorCommandAsync({
      command: 'run-step',
      dataDir,
      payload: { runId: created.json.run.runId },
      config: { backend: 'provider' },
      env: {
        OPENPET_BRIDGE_URL: `http://127.0.0.1:${port}`,
        OPENPET_BRIDGE_TOKEN: 'bridge-token'
      }
    })
    const runPath = path.join(dataDir, 'runs', created.json.run.runId, 'run.json')
    const logPath = path.join(dataDir, 'runs', created.json.run.runId, 'logs', 'events.jsonl')
    const run = JSON.parse(fs.readFileSync(runPath, 'utf-8'))
    const events = fs.readFileSync(logPath, 'utf-8').trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))

    assert.equal(created.status, 0)
    assert.equal(generated.status, 1)
    assert.equal(generated.json.ok, false)
    assert.match(generated.json.error, /旧转发链路已关闭/)
    assert.equal(run.status, 'failed')
    assert.equal(run.currentStep, 'generate')
    assert.equal(run.backendStatus.backend, 'provider')
    assert.equal(run.backendStatus.state, 'failed')
    assert.match(run.backendStatus.message, /旧转发链路已关闭/)
    assert.match(run.error, /旧转发链路已关闭/)
    assert.deepEqual(events.map((entry) => entry.event), ['generate.start', 'generate.failed'])
  } finally {
    bridgeServer.closeAllConnections?.()
    await new Promise((resolve) => bridgeServer.close(resolve))
  }
})

test('creator studio host-bridged local run can be approved and exported as a standard pet bundle', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-local-export-'))
  const created = runCreatorCommand({
    command: 'create-run',
    dataDir,
    payload: { petName: 'Local Export Cat', prompt: 'A local generated export cat', backend: 'local' },
    config: { backend: 'local' }
  })
  const bridgeServer = require('node:http').createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      response.writeHead(200, {
        'Content-Type': 'application/json',
        Connection: 'close'
      })
      const dataRelativePath = `runs/${created.json.run.runId}/frames/base/0001.png`
      const generatedPath = path.join(dataDir, dataRelativePath)
      fs.mkdirSync(path.dirname(generatedPath), { recursive: true })
      sharp({
        create: {
          width: 80,
          height: 100,
          channels: 4,
          background: { r: 230, g: 130, b: 40, alpha: 1 }
        }
      })
        .png()
        .toFile(generatedPath)
        .then(() => {
          response.end(JSON.stringify({
            ok: true,
            result: {
              ok: true,
              backend: 'local',
              model: 'local-pet-sprite',
              generatedAt: '2026-06-19T00:00:00.000Z',
              outputs: [{
                dataRelativePath,
                mimeType: 'image/png',
                sha256: 'local-export-sha'
              }]
            }
          }))
        })
        .catch((error) => {
          response.end(JSON.stringify({ ok: false, error: error.message }))
        })
      void body
    })
  })
  await new Promise((resolve) => bridgeServer.listen(0, '127.0.0.1', resolve))
  const port = bridgeServer.address().port

  try {
    const generated = await runCreatorCommandAsync({
      command: 'run-step',
      dataDir,
      payload: { runId: created.json.run.runId },
      config: { backend: 'local' },
      env: {
        OPENPET_BRIDGE_URL: `http://127.0.0.1:${port}`,
        OPENPET_BRIDGE_TOKEN: 'bridge-token'
      }
    })
    const approved = runCreatorCommand({
      command: 'approve-run',
      dataDir,
      payload: { runId: created.json.run.runId }
    })
    const exported = runCreatorCommand({
      command: 'export-bundle',
      dataDir,
      payload: { runId: created.json.run.runId }
    })

    assert.equal(generated.status, 0)
    assert.equal(approved.status, 0)
    assert.equal(exported.status, 0)
    assert.equal(fs.existsSync(exported.json.bundle.path), true)
    assert.match(exported.json.bundle.path, /\.codex-pet\.zip$/)
  } finally {
    bridgeServer.closeAllConnections?.()
    await new Promise((resolve) => bridgeServer.close(resolve))
  }
})

test('creator studio import command regenerates stale fixture output when approved atlas is transparent', async () => {
  const { createRun, readRun, updateRunStatus } = require('../../examples/plugins/creator-studio/lib/run-store')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-stale-fixture-'))
  const run = createRun({
    dataDir,
    input: { petName: 'Stale Fixture Cat', prompt: 'A stale fixture cat', backend: 'fixture' },
    now: () => '2026-06-19T00:00:00.000Z'
  })
  const generated = runCreatorCommand({
    command: 'run-step',
    dataDir,
    payload: { runId: run.runId }
  })
  assert.equal(generated.status, 0)
  const outputDir = generated.json.outputDir
  fs.writeFileSync(path.join(outputDir, 'spritesheet.webp'), Buffer.from([
    'UklGRpgAAABXRUJQVlA4TIsAAAAv/8XTEQcQEREAUKT//ymi/6n//e9///vf//73',
    'v//973//+9///ve///3vf//73//+97///e9///vf//73v//973//+9///ve///3',
    'vf//73//+97///e9///vf//73v//973//+9///ve///3vf//73//+97///e9///',
    'vf//73v//973//+9///q8CAA=='
  ].join(''), 'base64'))
  updateRunStatus({
    dataDir,
    runId: run.runId,
    status: 'approved',
    patch: { reviewStatus: 'approved', currentStep: 'approved' },
    now: () => '2026-06-19T00:01:00.000Z'
  })

  let inspectCount = 0
  const { server, requests } = createBridgeServer({
    routes: [
      {
        path: '/creator/pet-pack/inspect-output',
        handler: () => {
          inspectCount += 1
          return inspectCount === 1
            ? { status: 400, body: { ok: false, error: 'Codex pet atlas must contain visible pixels' } }
            : { body: { ok: true, inspection: { valid: true, selectionId: 'selection-1' } } }
        }
      },
      {
        path: '/creator/pet-pack/import-output',
        handler: () => ({ body: { ok: true, imported: { pack: { id: 'stale-fixture-cat' } }, activated: { activePackId: 'stale-fixture-cat' } } })
      }
    ]
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const imported = await runCreatorCommandAsync({
      command: 'import-approved-pet',
      dataDir,
      payload: { runId: run.runId, activate: true },
      env: {
        OPENPET_BRIDGE_URL: `http://127.0.0.1:${port}`,
        OPENPET_BRIDGE_TOKEN: 'bridge-token'
      }
    })
    const repaired = readRun({ dataDir, runId: run.runId })
    const atlasStats = await sharp(path.join(outputDir, 'spritesheet.webp'))
      .ensureAlpha()
      .raw()
      .stats()

    assert.equal(imported.status, 0)
    assert.equal(imported.json.ok, true)
    assert.equal(imported.json.run.status, 'imported')
    assert.equal(repaired.importedPackId, 'stale-fixture-cat')
    assert.equal(atlasStats.channels[3].max > 0, true)
    assert.deepEqual(requests.map((entry) => entry.url), [
      '/creator/pet-pack/inspect-output',
      '/creator/pet-pack/inspect-output',
      '/creator/pet-pack/import-output'
    ])
  } finally {
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio import-approved-pet rejects full-pet output without passing qa gate', async () => {
  const { createRun, readRun, updateRunStatus } = require('../../examples/plugins/creator-studio/lib/run-store')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-import-pet-qa-fail-'))
  const run = createRun({
    dataDir,
    input: {
      petName: 'Import QA Fail Cat',
      petId: 'import-qa-fail-cat',
      backend: 'cloud',
      prompt: '生成一只完整的新桌宠。',
      generationTask: {
        mode: 'full-pet',
        targetPet: 'new',
        styleSource: 'textOnly',
        characterBrief: '一只圆滚滚的桌宠。',
        actions: [{
          actionId: 'idle',
          name: 'Idle',
          motionPrompt: 'neutral idle pose',
          frameCount: 12,
          loop: true,
          triggerProposal: { type: 'state', binding: 'idle' }
        }]
      }
    },
    now: () => '2026-06-26T02:00:00.000Z'
  })
  const outputDir = path.join(dataDir, 'runs', run.runId, 'outputs')
  const qaDir = path.join(dataDir, 'runs', run.runId, 'qa')
  fs.mkdirSync(outputDir, { recursive: true })
  fs.mkdirSync(qaDir, { recursive: true })
  fs.writeFileSync(path.join(outputDir, 'spritesheet.webp'), createMinimalWebp())
  fs.writeFileSync(path.join(outputDir, 'pet.json'), `${JSON.stringify({
    id: run.petId,
    displayName: 'Import QA Fail Cat',
    spritesheetPath: 'spritesheet.webp'
  }, null, 2)}\n`)
  fs.writeFileSync(
    path.join(qaDir, 'atlas-validation.json'),
    `${JSON.stringify({
      ok: false,
      width: 1536,
      height: 1872,
      visiblePixels: 0,
      warnings: ['Atlas contained no visible pixels.']
    }, null, 2)}\n`
  )
  fs.writeFileSync(
    path.join(qaDir, 'source-image-validation.json'),
    `${JSON.stringify({
      ok: true,
      sourceRelativePath: `runs/${run.runId}/frames/base/0001.png`,
      width: 1024,
      height: 1024,
      visiblePixels: 2048,
      warnings: []
    }, null, 2)}\n`
  )
  updateRunStatus({
    dataDir,
    runId: run.runId,
    status: 'approved',
    patch: {
      reviewStatus: 'approved',
      currentStep: 'approved',
      taskStatus: 'confirmed',
      artifacts: {
        outputDir,
        petJson: path.join(outputDir, 'pet.json'),
        spritesheet: path.join(outputDir, 'spritesheet.webp'),
        qa: path.join(qaDir, 'atlas-validation.json'),
        sourceImageQa: path.join(qaDir, 'source-image-validation.json')
      }
    },
    now: () => '2026-06-26T02:01:00.000Z'
  })
  const { server, requests } = createBridgeServer({
    routes: [
      {
        path: '/creator/pet-pack/inspect-output',
        handler: () => ({ body: { ok: true, inspection: { valid: true, selectionId: 'selection-qa-fail' } } })
      },
      {
        path: '/creator/pet-pack/import-output',
        handler: () => ({ body: { ok: true, imported: { pack: { id: 'import-qa-fail-cat' } } } })
      }
    ]
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const imported = await runCreatorCommandAsync({
      command: 'import-approved-pet',
      dataDir,
      payload: { runId: run.runId, activate: true },
      env: {
        OPENPET_BRIDGE_URL: `http://127.0.0.1:${port}`,
        OPENPET_BRIDGE_TOKEN: 'bridge-token'
      }
    })
    const stored = readRun({ dataDir, runId: run.runId })

    assert.equal(imported.status, 1)
    assert.equal(imported.json.ok, false)
    assert.match(imported.json.error, /Full-pet QA must pass before import/)
    assert.equal(stored.status, 'approved')
    assert.equal(stored.importStatus, 'not-imported')
    assert.equal(requests.length, 0)
  } finally {
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio import-approved-pet imports approved full-pet output when qa gate passes', async () => {
  const { createRun, readRun, updateRunStatus } = require('../../examples/plugins/creator-studio/lib/run-store')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-import-pet-qa-pass-'))
  const run = createRun({
    dataDir,
    input: {
      petName: 'Import QA Pass Cat',
      petId: 'import-qa-pass-cat',
      backend: 'cloud',
      prompt: '生成一只完整的新桌宠。',
      generationTask: {
        mode: 'full-pet',
        targetPet: 'new',
        styleSource: 'textOnly',
        characterBrief: '一只圆滚滚的桌宠。',
        actions: [{
          actionId: 'idle',
          name: 'Idle',
          motionPrompt: 'neutral idle pose',
          frameCount: 12,
          loop: true,
          triggerProposal: { type: 'state', binding: 'idle' }
        }]
      }
    },
    now: () => '2026-06-26T02:10:00.000Z'
  })
  const outputDir = path.join(dataDir, 'runs', run.runId, 'outputs')
  const qaDir = path.join(dataDir, 'runs', run.runId, 'qa')
  fs.mkdirSync(outputDir, { recursive: true })
  fs.mkdirSync(qaDir, { recursive: true })
  fs.writeFileSync(path.join(outputDir, 'spritesheet.webp'), createMinimalWebp())
  fs.writeFileSync(path.join(outputDir, 'pet.json'), `${JSON.stringify({
    id: run.petId,
    displayName: 'Import QA Pass Cat',
    spritesheetPath: 'spritesheet.webp'
  }, null, 2)}\n`)
  fs.writeFileSync(
    path.join(qaDir, 'atlas-validation.json'),
    `${JSON.stringify({
      ok: true,
      width: 1536,
      height: 1872,
      visiblePixels: 6400,
      warnings: []
    }, null, 2)}\n`
  )
  fs.writeFileSync(
    path.join(qaDir, 'source-image-validation.json'),
    `${JSON.stringify({
      ok: true,
      sourceRelativePath: `runs/${run.runId}/frames/base/0001.png`,
      width: 1024,
      height: 1024,
      visiblePixels: 2048,
      warnings: []
    }, null, 2)}\n`
  )
  updateRunStatus({
    dataDir,
    runId: run.runId,
    status: 'approved',
    patch: {
      reviewStatus: 'approved',
      currentStep: 'approved',
      taskStatus: 'confirmed',
      artifacts: {
        outputDir,
        petJson: path.join(outputDir, 'pet.json'),
        spritesheet: path.join(outputDir, 'spritesheet.webp'),
        bundle: path.join(outputDir, `${run.petId}.codex-pet.zip`),
        qa: path.join(qaDir, 'atlas-validation.json'),
        sourceImageQa: path.join(qaDir, 'source-image-validation.json')
      }
    },
    now: () => '2026-06-26T02:11:00.000Z'
  })
  const { server, requests } = createBridgeServer({
    routes: [
      {
        path: '/creator/pet-pack/inspect-output',
        handler: () => ({ body: { ok: true, inspection: { valid: true, selectionId: 'selection-qa-pass' } } })
      },
      {
        path: '/creator/pet-pack/import-output',
        handler: () => ({ body: { ok: true, imported: { pack: { id: 'import-qa-pass-cat' } }, activated: { activePackId: 'import-qa-pass-cat' } } })
      }
    ]
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const imported = await runCreatorCommandAsync({
      command: 'import-approved-pet',
      dataDir,
      payload: { runId: run.runId, activate: true },
      env: {
        OPENPET_BRIDGE_URL: `http://127.0.0.1:${port}`,
        OPENPET_BRIDGE_TOKEN: 'bridge-token'
      }
    })
    const stored = readRun({ dataDir, runId: run.runId })

    assert.equal(imported.status, 0)
    assert.equal(imported.json.ok, true)
    assert.equal(imported.json.run.status, 'imported')
    assert.equal(stored.importedPackId, 'import-qa-pass-cat')
    assert.deepEqual(requests.map((entry) => entry.url), [
      '/creator/pet-pack/inspect-output',
      '/creator/pet-pack/import-output'
    ])
  } finally {
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio import-approved-action imports approved single-action frames through host bridge', async () => {
  const { createRun, readRun, updateRunStatus } = require('../../examples/plugins/creator-studio/lib/run-store')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-import-action-'))
  const framesDir = path.join(dataDir, 'runs/demo/frames/actions/shy-spin')
  const qaDir = path.join(dataDir, 'runs/demo/qa')
  fs.mkdirSync(framesDir, { recursive: true })
  fs.mkdirSync(qaDir, { recursive: true })
  await sharp({
    create: {
      width: 192,
      height: 208,
      channels: 4,
      background: { r: 240, g: 120, b: 140, alpha: 1 }
    }
  }).png().toFile(path.join(framesDir, '0001.png'))
  fs.writeFileSync(
    path.join(qaDir, 'action-frame-validation.json'),
    `${JSON.stringify(createActionFrameQa(), null, 2)}\n`
  )
  const run = createRun({
    dataDir,
    input: {
      petName: 'Action Import Cat',
      petId: 'action-import-cat',
      backend: 'cloud',
      prompt: '点击害羞转圈',
      generationTask: {
        mode: 'single-action',
        targetPet: 'current',
        styleSource: 'currentPet',
        actions: [{
          actionId: 'shy-spin',
          name: '害羞转圈',
          motionPrompt: '点击害羞转圈',
          frameCount: 1,
          triggerProposal: { type: 'click', binding: 'clickAction' }
        }]
      }
    }
  })
  updateRunStatus({
    dataDir,
    runId: run.runId,
    status: 'approved',
    patch: {
      reviewStatus: 'approved',
      currentStep: 'approved',
      artifacts: {
        actionFrames: {
          actionId: 'shy-spin',
          name: '害羞转圈',
          framesDir,
          qa: path.join(qaDir, 'action-frame-validation.json'),
          frameCount: 1,
          frameWidth: 192,
          frameHeight: 208,
          triggerProposal: { type: 'click', binding: 'clickAction' }
        }
      }
    },
    now: () => '2026-06-20T00:01:00.000Z'
  })
  const { server, requests } = createBridgeServer({
    routes: [
      {
        path: '/creator/assets/import-frames',
        handler: () => ({ body: { ok: true, result: { importedAction: { id: 'shy-spin' } } } })
      },
      {
        path: '/creator/trigger-proposals/submit',
        handler: ({ payload }) => ({
          body: {
            ok: true,
            proposal: {
              id: 'proposal:click:shy-spin:test',
              actionId: payload.actionId,
              type: payload.type,
              binding: payload.binding,
              status: 'pending'
            }
          }
        })
      }
    ]
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const imported = await runCreatorCommandAsync({
      command: 'import-approved-action',
      dataDir,
      payload: { runId: run.runId },
      env: {
        OPENPET_BRIDGE_URL: `http://127.0.0.1:${port}`,
        OPENPET_BRIDGE_TOKEN: 'bridge-token'
      }
    })
    const stored = readRun({ dataDir, runId: run.runId })

    assert.equal(imported.status, 0)
    assert.equal(imported.json.ok, true)
    assert.equal(imported.json.run.status, 'imported')
    assert.equal(imported.json.run.importedActionId, 'shy-spin')
    assert.equal(imported.json.triggerProposal.type, 'click')
    assert.equal(imported.json.triggerProposalSubmission.ok, true)
    assert.equal(imported.json.triggerProposalSubmission.proposal.id, 'proposal:click:shy-spin:test')
    assert.equal(stored.importStatus, 'imported')
    assert.equal(stored.triggerProposalSubmission.ok, true)
    assert.equal(requests[0].url, '/creator/assets/import-frames')
    assert.equal(requests[0].payload.dataRelativePath, 'runs/demo/frames/actions/shy-spin')
    assert.equal(requests[0].payload.actionId, 'shy-spin')
    assert.equal(requests[0].payload.label, '害羞转圈')
    assert.equal(JSON.stringify(requests[0].payload).includes(dataDir), false)
    assert.equal(requests[1].url, '/creator/trigger-proposals/submit')
    assert.equal(requests[1].payload.actionId, 'shy-spin')
    assert.equal(requests[1].payload.type, 'click')
    assert.equal(requests[1].payload.binding, 'clickAction')
    assert.equal(requests[1].payload.sourceRunId, run.runId)
    assert.equal(JSON.stringify(requests[1].payload).includes(dataDir), false)
  } finally {
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio import-approved-action rejects failed action frame QA before bridge import', async () => {
  const { createRun, readRun, updateRunStatus } = require('../../examples/plugins/creator-studio/lib/run-store')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-import-action-qa-'))
  const framesDir = path.join(dataDir, 'runs/demo/frames/actions/shy-spin')
  const qaDir = path.join(dataDir, 'runs/demo/qa')
  fs.mkdirSync(framesDir, { recursive: true })
  fs.mkdirSync(qaDir, { recursive: true })
  await sharp({
    create: {
      width: 192,
      height: 208,
      channels: 4,
      background: { r: 240, g: 120, b: 140, alpha: 1 }
    }
  }).png().toFile(path.join(framesDir, '0001.png'))
  fs.writeFileSync(
    path.join(qaDir, 'action-frame-validation.json'),
    `${JSON.stringify(createActionFrameQa({ ok: false }), null, 2)}\n`
  )
  const run = createRun({
    dataDir,
    input: {
      petName: 'Action Import QA Cat',
      petId: 'action-import-qa-cat',
      backend: 'cloud',
      prompt: '点击害羞转圈',
      generationTask: {
        mode: 'single-action',
        targetPet: 'current',
        styleSource: 'currentPet',
        actions: [{
          actionId: 'shy-spin',
          name: '害羞转圈',
          motionPrompt: '点击害羞转圈',
          frameCount: 1,
          triggerProposal: { type: 'click', binding: 'clickAction' }
        }]
      }
    }
  })
  updateRunStatus({
    dataDir,
    runId: run.runId,
    status: 'approved',
    patch: {
      reviewStatus: 'approved',
      currentStep: 'approved',
      artifacts: {
        actionFrames: {
          actionId: 'shy-spin',
          name: '害羞转圈',
          framesDir,
          qa: path.join(qaDir, 'action-frame-validation.json'),
          frameCount: 1,
          frameWidth: 192,
          frameHeight: 208,
          triggerProposal: { type: 'click', binding: 'clickAction' }
        }
      }
    },
    now: () => '2026-06-20T00:01:00.000Z'
  })
  const { server, requests } = createBridgeServer({
    routes: [{
      path: '/creator/assets/import-frames',
      handler: () => ({ body: { ok: true, result: { importedAction: { id: 'shy-spin' } } } })
    }]
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const imported = await runCreatorCommandAsync({
      command: 'import-approved-action',
      dataDir,
      payload: { runId: run.runId },
      env: {
        OPENPET_BRIDGE_URL: `http://127.0.0.1:${port}`,
        OPENPET_BRIDGE_TOKEN: 'bridge-token'
      }
    })
    const stored = readRun({ dataDir, runId: run.runId })

    assert.equal(imported.status, 1)
    assert.equal(imported.json.ok, false)
    assert.match(imported.json.error, /QA must pass/)
    assert.equal(stored.importStatus, 'not-imported')
    assert.equal(requests.length, 0)
  } finally {
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio approve-run rejects action frames without visible pixel evidence', async () => {
  const { createRun, readRun, updateRunStatus } = require('../../examples/plugins/creator-studio/lib/run-store')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-approve-action-qa-'))
  const framesDir = path.join(dataDir, 'runs/demo/frames/actions/shy-spin')
  const qaDir = path.join(dataDir, 'runs/demo/qa')
  fs.mkdirSync(framesDir, { recursive: true })
  fs.mkdirSync(qaDir, { recursive: true })
  await sharp({
    create: {
      width: 192,
      height: 208,
      channels: 4,
      background: { r: 240, g: 120, b: 140, alpha: 1 }
    }
  }).png().toFile(path.join(framesDir, '0001.png'))
  fs.writeFileSync(
    path.join(qaDir, 'action-frame-validation.json'),
    `${JSON.stringify(createActionFrameQa({ visiblePixels: 0 }), null, 2)}\n`
  )
  const run = createRun({
    dataDir,
    input: {
      petName: 'Action Approval QA Cat',
      petId: 'action-approval-qa-cat',
      backend: 'cloud',
      prompt: '点击害羞转圈',
      generationTask: {
        mode: 'single-action',
        targetPet: 'current',
        styleSource: 'currentPet',
        actions: [{
          actionId: 'shy-spin',
          name: '害羞转圈',
          motionPrompt: '点击害羞转圈',
          frameCount: 1,
          triggerProposal: { type: 'click', binding: 'clickAction' }
        }]
      }
    }
  })
  updateRunStatus({
    dataDir,
    runId: run.runId,
    status: 'ready_for_review',
    patch: {
      reviewStatus: 'pending',
      currentStep: 'review',
      artifacts: {
        actionFrames: {
          actionId: 'shy-spin',
          name: '害羞转圈',
          framesDir,
          qa: path.join(qaDir, 'action-frame-validation.json'),
          frameCount: 1,
          frameWidth: 192,
          frameHeight: 208,
          triggerProposal: { type: 'click', binding: 'clickAction' }
        }
      }
    }
  })

  const approved = runCreatorCommand({
    command: 'approve-run',
    dataDir,
    payload: { runId: run.runId }
  })
  const stored = readRun({ dataDir, runId: run.runId })

  assert.equal(approved.status, 1)
  assert.equal(approved.json.ok, false)
  assert.match(approved.json.error, /QA frames must be complete/)
  assert.equal(stored.status, 'ready_for_review')
  assert.equal(stored.reviewStatus, 'pending')
})

test('creator studio approve-run rejects full-pet output without passing atlas qa', () => {
  const { createRun, readRun, updateRunStatus } = require('../../examples/plugins/creator-studio/lib/run-store')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-approve-full-pet-qa-'))
  const outputDir = path.join(dataDir, 'runs/demo/outputs')
  const qaDir = path.join(dataDir, 'runs/demo/qa')
  fs.mkdirSync(outputDir, { recursive: true })
  fs.mkdirSync(qaDir, { recursive: true })
  fs.writeFileSync(path.join(outputDir, 'spritesheet.webp'), createMinimalWebp())
  fs.writeFileSync(path.join(outputDir, 'pet.json'), `${JSON.stringify({
    id: 'full-pet-qa-cat',
    displayName: 'Full Pet QA Cat',
    spritesheetPath: 'spritesheet.webp'
  }, null, 2)}\n`)
  fs.writeFileSync(
    path.join(qaDir, 'atlas-validation.json'),
    `${JSON.stringify({
      ok: false,
      width: 1536,
      height: 1872,
      visiblePixels: 0,
      warnings: ['Atlas contained no visible pixels.']
    }, null, 2)}\n`
  )
  fs.writeFileSync(
    path.join(qaDir, 'source-image-validation.json'),
    `${JSON.stringify({
      ok: true,
      sourceRelativePath: 'runs/demo/frames/base/0001.png',
      width: 1024,
      height: 1024,
      visiblePixels: 1200,
      warnings: []
    }, null, 2)}\n`
  )
  const run = createRun({
    dataDir,
    input: {
      petName: 'Full Pet QA Cat',
      petId: 'full-pet-qa-cat',
      backend: 'cloud',
      prompt: '生成一只完整的新桌宠。',
      generationTask: {
        mode: 'full-pet',
        targetPet: 'new',
        styleSource: 'textOnly',
        characterBrief: '一只软乎乎的桌宠。',
        actions: [{
          actionId: 'idle',
          name: 'Idle',
          motionPrompt: 'neutral idle pose',
          frameCount: 12,
          loop: true,
          triggerProposal: { type: 'state', binding: 'idle' }
        }]
      }
    }
  })
  updateRunStatus({
    dataDir,
    runId: run.runId,
    status: 'ready_for_review',
    patch: {
      reviewStatus: 'pending',
      currentStep: 'review',
      taskStatus: 'confirmed',
      artifacts: {
        outputDir,
        petJson: path.join(outputDir, 'pet.json'),
        spritesheet: path.join(outputDir, 'spritesheet.webp'),
        qa: path.join(qaDir, 'atlas-validation.json'),
        sourceImageQa: path.join(qaDir, 'source-image-validation.json')
      }
    }
  })

  const approved = runCreatorCommand({
    command: 'approve-run',
    dataDir,
    payload: { runId: run.runId }
  })
  const stored = readRun({ dataDir, runId: run.runId })

  assert.equal(approved.status, 1)
  assert.equal(approved.json.ok, false)
  assert.match(approved.json.error, /Full-pet QA must pass before approval/)
  assert.equal(stored.status, 'ready_for_review')
  assert.equal(stored.reviewStatus, 'pending')
})

test('creator studio approve-run accepts full-pet output with source and atlas qa evidence', () => {
  const { createRun, updateRunStatus } = require('../../examples/plugins/creator-studio/lib/run-store')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-approve-full-pet-ok-'))
  const outputDir = path.join(dataDir, 'runs/demo/outputs')
  const qaDir = path.join(dataDir, 'runs/demo/qa')
  fs.mkdirSync(outputDir, { recursive: true })
  fs.mkdirSync(qaDir, { recursive: true })
  fs.writeFileSync(path.join(outputDir, 'spritesheet.webp'), createMinimalWebp())
  fs.writeFileSync(path.join(outputDir, 'pet.json'), `${JSON.stringify({
    id: 'full-pet-ok-cat',
    displayName: 'Full Pet OK Cat',
    spritesheetPath: 'spritesheet.webp'
  }, null, 2)}\n`)
  fs.writeFileSync(
    path.join(qaDir, 'atlas-validation.json'),
    `${JSON.stringify({
      ok: true,
      width: 1536,
      height: 1872,
      visiblePixels: 6400,
      warnings: []
    }, null, 2)}\n`
  )
  fs.writeFileSync(
    path.join(qaDir, 'source-image-validation.json'),
    `${JSON.stringify({
      ok: true,
      sourceRelativePath: 'runs/demo/frames/base/0001.png',
      width: 1024,
      height: 1024,
      visiblePixels: 1200,
      warnings: []
    }, null, 2)}\n`
  )
  const run = createRun({
    dataDir,
    input: {
      petName: 'Full Pet OK Cat',
      petId: 'full-pet-ok-cat',
      backend: 'cloud',
      prompt: '生成一只完整的新桌宠。',
      generationTask: {
        mode: 'full-pet',
        targetPet: 'new',
        styleSource: 'textOnly',
        characterBrief: '一只圆润的桌宠。',
        actions: [{
          actionId: 'idle',
          name: 'Idle',
          motionPrompt: 'neutral idle pose',
          frameCount: 12,
          loop: true,
          triggerProposal: { type: 'state', binding: 'idle' }
        }]
      }
    }
  })
  updateRunStatus({
    dataDir,
    runId: run.runId,
    status: 'ready_for_review',
    patch: {
      reviewStatus: 'pending',
      currentStep: 'review',
      taskStatus: 'confirmed',
      artifacts: {
        outputDir,
        petJson: path.join(outputDir, 'pet.json'),
        spritesheet: path.join(outputDir, 'spritesheet.webp'),
        qa: path.join(qaDir, 'atlas-validation.json'),
        sourceImageQa: path.join(qaDir, 'source-image-validation.json')
      }
    }
  })

  const approved = runCreatorCommand({
    command: 'approve-run',
    dataDir,
    payload: { runId: run.runId }
  })

  assert.equal(approved.status, 0)
  assert.equal(approved.json.ok, true)
  assert.equal(approved.json.run.status, 'approved')
  assert.equal(approved.json.run.reviewStatus, 'approved')
})

test('creator studio import-approved-action rejects missing action frame files before bridge import', async () => {
  const { createRun, readRun, updateRunStatus } = require('../../examples/plugins/creator-studio/lib/run-store')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-import-action-missing-frame-'))
  const framesDir = path.join(dataDir, 'runs/demo/frames/actions/shy-spin')
  const qaDir = path.join(dataDir, 'runs/demo/qa')
  fs.mkdirSync(framesDir, { recursive: true })
  fs.mkdirSync(qaDir, { recursive: true })
  fs.writeFileSync(
    path.join(qaDir, 'action-frame-validation.json'),
    `${JSON.stringify(createActionFrameQa(), null, 2)}\n`
  )
  const run = createRun({
    dataDir,
    input: {
      petName: 'Action Missing Frame Cat',
      petId: 'action-missing-frame-cat',
      backend: 'cloud',
      prompt: '点击害羞转圈',
      generationTask: {
        mode: 'single-action',
        targetPet: 'current',
        styleSource: 'currentPet',
        actions: [{
          actionId: 'shy-spin',
          name: '害羞转圈',
          motionPrompt: '点击害羞转圈',
          frameCount: 1,
          triggerProposal: { type: 'click', binding: 'clickAction' }
        }]
      }
    }
  })
  updateRunStatus({
    dataDir,
    runId: run.runId,
    status: 'approved',
    patch: {
      reviewStatus: 'approved',
      currentStep: 'approved',
      artifacts: {
        actionFrames: {
          actionId: 'shy-spin',
          name: '害羞转圈',
          framesDir,
          qa: path.join(qaDir, 'action-frame-validation.json'),
          frameCount: 1,
          frameWidth: 192,
          frameHeight: 208,
          triggerProposal: { type: 'click', binding: 'clickAction' }
        }
      }
    }
  })
  const { server, requests } = createBridgeServer({
    routes: [{
      path: '/creator/assets/import-frames',
      handler: () => ({ body: { ok: true, result: { importedAction: { id: 'shy-spin' } } } })
    }]
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const imported = await runCreatorCommandAsync({
      command: 'import-approved-action',
      dataDir,
      payload: { runId: run.runId },
      env: {
        OPENPET_BRIDGE_URL: `http://127.0.0.1:${port}`,
        OPENPET_BRIDGE_TOKEN: 'bridge-token'
      }
    })
    const stored = readRun({ dataDir, runId: run.runId })

    assert.equal(imported.status, 1)
    assert.equal(imported.json.ok, false)
    assert.match(imported.json.error, /Action frame file is missing/)
    assert.equal(stored.status, 'approved')
    assert.equal(stored.importStatus, 'not-imported')
    assert.equal(requests.length, 0)
  } finally {
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio create-run command drafts a generation task from a conversation prompt', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-create-task-'))

  const created = runCreatorCommand({
    command: 'create-run',
    dataDir,
    payload: {
      petName: 'Prompt Cat',
      prompt: '新增一个自定义动作：原地打滚，动作要循环。'
    }
  })

  assert.equal(created.status, 0)
  assert.equal(created.json.run.generationTask.mode, 'single-action')
  assert.equal(created.json.run.generationTask.actions[0].name, '原地打滚')
  assert.equal(created.json.run.generationTask.questions[0].id, 'trigger')
})

test('creator studio create-run command keeps legacy pet prompts as plain runs', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-legacy-prompt-'))

  const created = runCreatorCommand({
    command: 'create-run',
    dataDir,
    payload: {
      petName: 'Sprout Cat',
      prompt: 'A small mint helper cat'
    }
  })

  assert.equal(created.status, 0)
  assert.equal(created.json.run.input.prompt, 'A small mint helper cat')
  assert.equal(created.json.run.input.originalPrompt, undefined)
  assert.equal(created.json.run.generationTask, undefined)
  assert.equal(fs.existsSync(path.join(dataDir, 'runs', created.json.run.runId, 'inputs', 'generation-task.json')), false)
})

test('creator studio commands create run generate output approve and export', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-commands-'))

  const created = runCreatorCommand({
    command: 'create-run',
    dataDir,
    payload: { petName: 'Sprout Cat', prompt: 'A small mint helper cat' }
  })
  const generated = runCreatorCommand({
    command: 'run-step',
    dataDir,
    payload: { runId: created.json.run.runId }
  })
  const approved = runCreatorCommand({
    command: 'approve-run',
    dataDir,
    payload: { runId: created.json.run.runId }
  })
  const exported = runCreatorCommand({
    command: 'export-bundle',
    dataDir,
    payload: { runId: created.json.run.runId }
  })

  assert.equal(created.status, 0)
  assert.equal(generated.status, 0)
  assert.equal(approved.status, 0)
  assert.equal(exported.status, 0)
  assert.equal(created.json.ok, true)
  assert.equal(generated.json.run.status, 'ready_for_review')
  assert.equal(approved.json.run.status, 'approved')
  assert.equal(exported.json.ok, true)
  assert.equal(fs.existsSync(exported.json.bundle.path), true)
})

test('creator studio commands infer latest run for generic plugin button flow', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-button-flow-'))

  const created = runCreatorCommand({
    command: 'create-run',
    dataDir,
    payload: { petName: 'Button Cat', prompt: 'A button generated cat' }
  })
  const generated = runCreatorCommand({
    command: 'run-step',
    dataDir
  })
  const approved = runCreatorCommand({
    command: 'approve-run',
    dataDir
  })
  const exported = runCreatorCommand({
    command: 'export-bundle',
    dataDir
  })

  assert.equal(created.status, 0)
  assert.equal(generated.status, 0)
  assert.equal(approved.status, 0)
  assert.equal(exported.status, 0)
  assert.equal(generated.json.run.runId, created.json.run.runId)
  assert.equal(approved.json.run.status, 'approved')
  assert.equal(exported.json.ok, true)
  assert.equal(fs.existsSync(exported.json.bundle.path), true)
})

test('creator studio export-bundle skips action-only runs when inferring latest run', () => {
  const { createRun, updateRunStatus } = require('../../examples/plugins/creator-studio/lib/run-store')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-export-filter-'))

  const petRun = runCreatorCommand({
    command: 'create-run',
    dataDir,
    payload: { petName: 'Bundle Cat', prompt: 'A bundle cat' }
  })
  runCreatorCommand({
    command: 'run-step',
    dataDir,
    payload: { runId: petRun.json.run.runId }
  })
  runCreatorCommand({
    command: 'approve-run',
    dataDir,
    payload: { runId: petRun.json.run.runId }
  })
  const actionRun = createRun({
    dataDir,
    input: {
      petName: 'Action Only Cat',
      petId: 'action-only-cat',
      backend: 'cloud',
      prompt: '点击害羞转圈',
      generationTask: {
        mode: 'single-action',
        targetPet: 'current',
        styleSource: 'currentPet',
        actions: [{
          actionId: 'shy-spin',
          name: '害羞转圈',
          motionPrompt: '点击害羞转圈',
          frameCount: 8,
          triggerProposal: { type: 'click', binding: 'clickAction' }
        }]
      }
    },
    now: () => '2026-06-20T00:00:00.000Z'
  })
  updateRunStatus({
    dataDir,
    runId: actionRun.runId,
    status: 'imported',
    patch: {
      importStatus: 'imported',
      artifacts: {
        actionFrames: {
          actionId: 'shy-spin',
          framesDir: path.join(dataDir, 'runs', actionRun.runId, 'frames', 'actions', 'shy-spin')
        }
      }
    },
    now: () => '2026-06-20T00:01:00.000Z'
  })

  const exported = runCreatorCommand({
    command: 'export-bundle',
    dataDir
  })

  assert.equal(exported.status, 0)
  assert.equal(exported.json.ok, true)
  assert.equal(fs.existsSync(exported.json.bundle.path), true)
  assert.match(exported.json.message, new RegExp(petRun.json.run.runId))
})

test('creator studio import-approved-pet skips action-only runs when inferring latest run', async () => {
  const { createRun, updateRunStatus } = require('../../examples/plugins/creator-studio/lib/run-store')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-import-pet-filter-'))

  const petRun = runCreatorCommand({
    command: 'create-run',
    dataDir,
    payload: { petName: 'Import Pet Cat', prompt: 'A pet bundle cat' }
  })
  runCreatorCommand({
    command: 'run-step',
    dataDir,
    payload: { runId: petRun.json.run.runId }
  })
  runCreatorCommand({
    command: 'approve-run',
    dataDir,
    payload: { runId: petRun.json.run.runId }
  })
  const actionRun = createRun({
    dataDir,
    input: {
      petName: 'Action Only Cat',
      petId: 'action-only-cat',
      backend: 'cloud',
      prompt: '点击害羞转圈',
      generationTask: {
        mode: 'single-action',
        targetPet: 'current',
        styleSource: 'currentPet',
        actions: [{
          actionId: 'shy-spin',
          name: '害羞转圈',
          motionPrompt: '点击害羞转圈',
          frameCount: 8,
          triggerProposal: { type: 'click', binding: 'clickAction' }
        }]
      }
    },
    now: () => '2026-06-20T00:00:00.000Z'
  })
  updateRunStatus({
    dataDir,
    runId: actionRun.runId,
    status: 'approved',
    patch: {
      reviewStatus: 'approved',
      currentStep: 'approved',
      artifacts: {
        actionFrames: {
          actionId: 'shy-spin',
          framesDir: path.join(dataDir, 'runs', actionRun.runId, 'frames', 'actions', 'shy-spin')
        }
      }
    },
    now: () => '2026-06-20T00:01:00.000Z'
  })
  const { server, requests } = createBridgeServer({
    routes: [
      {
        path: '/creator/pet-pack/inspect-output',
        handler: () => ({ body: { ok: true, inspection: { valid: true, selectionId: 'selection-1' } } })
      },
      {
        path: '/creator/pet-pack/import-output',
        handler: () => ({ body: { ok: true, imported: { pack: { id: 'import-pet-cat' } }, activated: { activePackId: 'import-pet-cat' } } })
      }
    ]
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const imported = await runCreatorCommandAsync({
      command: 'import-approved-pet',
      dataDir,
      env: {
        OPENPET_BRIDGE_URL: `http://127.0.0.1:${port}`,
        OPENPET_BRIDGE_TOKEN: 'bridge-token'
      }
    })

    assert.equal(imported.status, 0)
    assert.equal(imported.json.ok, true)
    assert.equal(imported.json.run.runId, petRun.json.run.runId)
    assert.equal(imported.json.run.importedPackId, 'import-pet-cat')
    assert.deepEqual(requests.map((entry) => entry.url), [
      '/creator/pet-pack/inspect-output',
      '/creator/pet-pack/import-output'
    ])
  } finally {
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio import-approved-action skips pet-pack runs when inferring latest run', async () => {
  const { createRun, readRun, updateRunStatus } = require('../../examples/plugins/creator-studio/lib/run-store')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-import-action-filter-'))
  const actionRun = createRun({
    dataDir,
    input: {
      petName: 'Action Import Cat',
      petId: 'action-import-cat',
      backend: 'cloud',
      prompt: '点击害羞转圈',
      generationTask: {
        mode: 'single-action',
        targetPet: 'current',
        styleSource: 'currentPet',
        actions: [{
          actionId: 'shy-spin',
          name: '害羞转圈',
          motionPrompt: '点击害羞转圈',
          frameCount: 1,
          triggerProposal: { type: 'click', binding: 'clickAction' }
        }]
      }
    },
    now: () => '2026-06-20T00:00:00.000Z'
  })
  const framesDir = path.join(dataDir, 'runs', actionRun.runId, 'frames', 'actions', 'shy-spin')
  const qaDir = path.join(dataDir, 'runs', actionRun.runId, 'qa')
  fs.mkdirSync(framesDir, { recursive: true })
  fs.mkdirSync(qaDir, { recursive: true })
  await sharp({
    create: {
      width: 192,
      height: 208,
      channels: 4,
      background: { r: 240, g: 120, b: 140, alpha: 1 }
    }
  }).png().toFile(path.join(framesDir, '0001.png'))
  fs.writeFileSync(
    path.join(qaDir, 'action-frame-validation.json'),
    `${JSON.stringify(createActionFrameQa(), null, 2)}\n`
  )
  updateRunStatus({
    dataDir,
    runId: actionRun.runId,
    status: 'approved',
    patch: {
      reviewStatus: 'approved',
      currentStep: 'approved',
      artifacts: {
        actionFrames: {
          actionId: 'shy-spin',
          name: '害羞转圈',
          framesDir,
          qa: path.join(qaDir, 'action-frame-validation.json'),
          frameCount: 1,
          frameWidth: 192,
          frameHeight: 208,
          triggerProposal: { type: 'click', binding: 'clickAction' }
        }
      }
    },
    now: () => '2026-06-20T00:01:00.000Z'
  })
  const petRun = createRun({
    dataDir,
    input: { petName: 'Approved Pet Cat', petId: 'approved-pet-cat', backend: 'fixture', prompt: 'A pet run' },
    now: () => '2026-06-20T00:02:00.000Z'
  })
  updateRunStatus({
    dataDir,
    runId: petRun.runId,
    status: 'approved',
    patch: {
      reviewStatus: 'approved',
      currentStep: 'approved',
      artifacts: { outputDir: path.join(dataDir, 'runs', petRun.runId, 'outputs') }
    },
    now: () => '2026-06-20T00:03:00.000Z'
  })
  const { server, requests } = createBridgeServer({
    routes: [{
      path: '/creator/assets/import-frames',
      handler: () => ({ body: { ok: true, result: { importedAction: { id: 'shy-spin' } } } })
    }]
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const imported = await runCreatorCommandAsync({
      command: 'import-approved-action',
      dataDir,
      env: {
        OPENPET_BRIDGE_URL: `http://127.0.0.1:${port}`,
        OPENPET_BRIDGE_TOKEN: 'bridge-token'
      }
    })
    const storedActionRun = readRun({ dataDir, runId: actionRun.runId })

    assert.equal(imported.status, 0)
    assert.equal(imported.json.ok, true)
    assert.equal(imported.json.run.runId, actionRun.runId)
    assert.equal(storedActionRun.importStatus, 'imported')
    assert.equal(requests[0].payload.dataRelativePath, `runs/${actionRun.runId}/frames/actions/shy-spin`)
  } finally {
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio dashboard asset exists and service script is declared', () => {
  const dashboardPath = path.join(pluginRoot, 'web', 'dashboard', 'index.html')
  const servicePath = path.join(pluginRoot, 'service', 'studio-service.js')
  const html = fs.readFileSync(dashboardPath, 'utf-8')
  assert.equal(fs.existsSync(dashboardPath), true)
  assert.equal(fs.existsSync(servicePath), true)
  assert.match(html, /Creator Studio/)
  assert.match(html, /id="prompt-input"/)
  assert.match(html, /id="task-preview"/)
  assert.match(html, /id="run-snapshot-panel"/)
  assert.match(html, /id="action-lane-panel"/)
  assert.match(html, /id="next-step-panel"/)
  assert.match(html, /id="trigger-panel"/)
  assert.match(html, /id="action-review"/)
  assert.match(html, /id="run-select"/)
  assert.match(html, /id="reload-runs-button"/)
  assert.match(html, /id="approve-button"/)
  assert.match(html, /renderImportHandoff/)
  assert.match(html, /handoff\.commandTitle/)
  assert.match(html, /fetch\('\/api\/runs'\)/)
  assert.match(html, /DOMContentLoaded/)
  assert.match(html, /Loaded latest run/)
  assert.match(html, /contact-sheet-preview/)
  assert.match(html, /contactSheetUrl/)
  assert.match(html, /action-frame-validation\.json/)
  assert.match(html, /id="recovery-panel"/)
  assert.match(html, /id="prompt-provenance-panel"/)
  assert.match(html, /id="workflow-guidance-panel"/)
  assert.match(html, /Estimated generation cost:/)
  assert.match(html, /Retry generation/)
  assert.match(html, /developerPrompt/)
  assert.match(html, /Test saved image Provider/)
  assert.match(html, /Prompt snapshot/)
  assert.match(html, /Action Lane/)
  assert.match(html, /Button availability/)
  assert.match(html, /Next Step/)
  assert.match(html, /Wizard Steps/)
  assert.match(html, /id="wizard-steps-panel"/)
  assert.match(html, /id="run-logs"/)
  assert.match(html, /id="playback-panel"/)
  assert.match(html, /renderPlaybackPanel/)
  assert.match(html, /playback-preview/)
  assert.match(html, /timeline/)
  assert.match(html, /id="full-pet-review-panel"/)
  assert.match(html, /renderFullPetReview/)
  assert.match(html, /spritesheet-preview/)
  assert.equal(html.includes('safe fixture output for import'), false)
  assert.equal(html.includes('apiKey'), false)
  assert.equal(/\bsk-[A-Za-z0-9_-]+/.test(html), false)
})

test('creator studio dashboard asset includes full-pet import review messaging', () => {
  const dashboardPath = path.join(pluginRoot, 'web', 'dashboard', 'index.html')
  const html = fs.readFileSync(dashboardPath, 'utf-8')

  assert.match(html, /Review the generated pet-pack output and approve the run before host-owned pet import\./)
  assert.match(html, /Generate and approve the pet-pack output to unlock host-owned pet import\./)
})

test('creator studio dashboard keeps full-pet review state when loading run detail', () => {
  const dashboardPath = path.join(pluginRoot, 'web', 'dashboard', 'index.html')
  const html = fs.readFileSync(dashboardPath, 'utf-8')

  assert.match(
    html,
    /const state = \{ run: null, actionReview: null, fullPetReview: null, runs: \[], playbackTimer: null, playbackSession: 0 \}/
  )
  assert.match(
    html,
    /state\.fullPetReview = payload\.fullPetReview \|\| null/
  )
})

test('creator studio dashboard asset includes full-pet mode copy for generation and review states', () => {
  const dashboardPath = path.join(pluginRoot, 'web', 'dashboard', 'index.html')
  const html = fs.readFileSync(dashboardPath, 'utf-8')

  assert.match(html, /Generate pet-pack output to inspect full-pet review artifacts\./)
  assert.match(html, /Generated pet-pack review artifacts and atlas QA will appear here before import\./)
  assert.match(html, /Generate pet pack/)
})

test('creator studio dashboard asset renders full-pet source and qa review details', () => {
  const dashboardPath = path.join(pluginRoot, 'web', 'dashboard', 'index.html')
  const html = fs.readFileSync(dashboardPath, 'utf-8')

  assert.match(html, /Source image:/)
  assert.match(html, /Source QA:/)
  assert.match(html, /Atlas QA summary:/)
  assert.match(html, /Source image preview/)
  assert.match(html, /Full pet spritesheet preview/)
})

test('creator studio dashboard asset includes full-pet task preview summary copy', () => {
  const dashboardPath = path.join(pluginRoot, 'web', 'dashboard', 'index.html')
  const html = fs.readFileSync(dashboardPath, 'utf-8')

  assert.match(html, /Character brief:/)
  assert.match(html, /Planned actions:/)
  assert.match(html, /Trigger plan:/)
})

test('creator studio dashboard asset uses mode-neutral entry copy', () => {
  const dashboardPath = path.join(pluginRoot, 'web', 'dashboard', 'index.html')
  const html = fs.readFileSync(dashboardPath, 'utf-8')

  assert.match(html, /Describe an OpenPet generation task/)
  assert.match(html, /Generation prompt/)
  assert.match(html, /Generate output to inspect review artifacts\./)
  assert.match(html, /Generated review artifacts and QA will appear here before import\./)
  assert.match(html, /Generate and approve a run to unlock host-owned import\./)
})

test('creator studio dashboard asset uses mode-neutral review section titles', () => {
  const dashboardPath = path.join(pluginRoot, 'web', 'dashboard', 'index.html')
  const html = fs.readFileSync(dashboardPath, 'utf-8')

  assert.match(html, /<h2>Review Preview<\/h2>/)
  assert.match(html, /<h2>Preview Playback<\/h2>/)
  assert.match(html, /<h2>Generation Review<\/h2>/)
  assert.equal(html.includes('Single Action Review'), false)
})

test('creator studio service exposes full-pet review details for dashboard clients', async () => {
  const { createRun, updateRunStatus } = require('../../examples/plugins/creator-studio/lib/run-store')
  const { createCreatorStudioServer } = require('../../examples/plugins/creator-studio/service/studio-service')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-full-pet-review-'))
  const dashboardPath = path.join(pluginRoot, 'web', 'dashboard', 'index.html')
  const reviewTask = {
    mode: 'full-pet',
    targetPet: 'new',
    styleSource: 'textOnly',
    characterBrief: '一只软乎乎的橘猫桌宠。',
    actions: [{
      actionId: 'idle',
      name: 'Idle',
      motionPrompt: 'neutral idle pose',
      loop: true,
      frameCount: 12,
      triggerProposal: { type: 'state', binding: 'idle' }
    }]
  }
  const run = createRun({
    dataDir,
    input: {
      petName: 'Review Pet Cat',
      petId: 'review-pet-cat',
      prompt: '生成一只完整的新桌宠。',
      originalPrompt: '生成一只完整的新桌宠。',
      backend: 'fixture',
      generationTask: reviewTask
    },
    now: () => '2026-06-26T00:20:00.000Z'
  })
  const outputDir = path.join(dataDir, 'runs', run.runId, 'outputs')
  const qaDir = path.join(dataDir, 'runs', run.runId, 'qa')
  const sourceDir = path.join(dataDir, 'runs', run.runId, 'frames', 'base')
  fs.mkdirSync(outputDir, { recursive: true })
  fs.mkdirSync(qaDir, { recursive: true })
  fs.mkdirSync(sourceDir, { recursive: true })
  await sharp({
    create: {
      width: 192,
      height: 208,
      channels: 4,
      background: { r: 240, g: 140, b: 80, alpha: 1 }
    }
  }).png().toFile(path.join(sourceDir, '0001.png'))
  fs.writeFileSync(path.join(outputDir, 'spritesheet.webp'), createMinimalWebp())
  fs.writeFileSync(path.join(outputDir, 'pet.json'), `${JSON.stringify({
    id: 'review-pet-cat',
    displayName: 'Review Pet Cat',
    spritesheetPath: 'spritesheet.webp'
  }, null, 2)}\n`)
  fs.writeFileSync(path.join(outputDir, 'review-pet-cat.codex-pet.zip'), Buffer.from('fake-bundle'))
  fs.writeFileSync(path.join(qaDir, 'atlas-validation.json'), `${JSON.stringify({
    ok: true,
    width: 1536,
    height: 1872,
    visiblePixels: 6400,
    warnings: []
  }, null, 2)}\n`)
  fs.writeFileSync(path.join(qaDir, 'source-image-validation.json'), `${JSON.stringify({
    ok: true,
    sourceRelativePath: `runs/${run.runId}/frames/base/0001.png`,
    width: 1024,
    height: 1024,
    visiblePixels: 1000,
    warnings: []
  }, null, 2)}\n`)
  fs.writeFileSync(path.join(qaDir, 'action-generation-task.json'), `${JSON.stringify({
    ok: true,
    mode: 'full-pet',
    targetPet: 'new',
    styleSource: 'textOnly'
  }, null, 2)}\n`)
  updateRunStatus({
    dataDir,
    runId: run.runId,
    status: 'ready_for_review',
    patch: {
      taskStatus: 'confirmed',
      currentStep: 'review',
      reviewStatus: 'pending',
      artifacts: {
        outputDir,
        petJson: path.join(outputDir, 'pet.json'),
        spritesheet: path.join(outputDir, 'spritesheet.webp'),
        bundle: path.join(outputDir, 'review-pet-cat.codex-pet.zip'),
        qa: path.join(qaDir, 'atlas-validation.json'),
        sourceImageQa: path.join(qaDir, 'source-image-validation.json'),
        actionTaskQa: path.join(qaDir, 'action-generation-task.json')
      }
    },
    now: () => '2026-06-26T00:20:30.000Z'
  })
  const server = createCreatorStudioServer({ dataDir, dashboardPath })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const detail = await fetch(`http://127.0.0.1:${port}/api/runs/${run.runId}`).then((response) => response.json())
    const spritesheetResponse = await fetch(`http://127.0.0.1:${port}${detail.fullPetReview.spritesheetUrl}`)
    const spritesheetBytes = Buffer.from(await spritesheetResponse.arrayBuffer())
    const serialized = JSON.stringify(detail)

    assert.equal(detail.ok, true)
    assert.equal(detail.actionReview, null)
    assert.equal(detail.fullPetReview.petId, 'review-pet-cat')
    assert.equal(detail.fullPetReview.bundle, `runs/${run.runId}/outputs/review-pet-cat.codex-pet.zip`)
    assert.equal(detail.fullPetReview.petJson, `runs/${run.runId}/outputs/pet.json`)
    assert.equal(detail.fullPetReview.spritesheet, `runs/${run.runId}/outputs/spritesheet.webp`)
    assert.equal(detail.fullPetReview.qa, `runs/${run.runId}/qa/atlas-validation.json`)
    assert.equal(detail.fullPetReview.sourceImageQa, `runs/${run.runId}/qa/source-image-validation.json`)
    assert.equal(detail.fullPetReview.actionTaskQa, `runs/${run.runId}/qa/action-generation-task.json`)
    assert.equal(detail.fullPetReview.sourceImage, `runs/${run.runId}/frames/base/0001.png`)
    assert.equal(detail.fullPetReview.spritesheetUrl, `/api/runs/${encodeURIComponent(run.runId)}/spritesheet.webp`)
    assert.equal(detail.fullPetReview.sourceImageUrl, `/api/runs/${encodeURIComponent(run.runId)}/source-image.png`)
    assert.deepEqual(detail.fullPetReview.sourceImageValidation, {
      ok: true,
      sourceRelativePath: `runs/${run.runId}/frames/base/0001.png`,
      width: 1024,
      height: 1024,
      visiblePixels: 1000,
      warnings: []
    })
    assert.deepEqual(detail.fullPetReview.atlasValidation, {
      ok: true,
      width: 1536,
      height: 1872,
      visiblePixels: 6400,
      warnings: []
    })
    assert.equal(spritesheetResponse.status, 200)
    assert.equal(spritesheetResponse.headers.get('content-type'), 'image/webp')
    assert.equal(spritesheetBytes.slice(0, 4).toString('utf-8'), 'RIFF')
    assert.equal(serialized.includes(dataDir), false)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio service exposes run detail and logs for dashboard clients', async () => {
  const { appendRunLog, createRun, updateRunStatus } = require('../../examples/plugins/creator-studio/lib/run-store')
  const { createCreatorStudioServer } = require('../../examples/plugins/creator-studio/service/studio-service')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-service-'))
  const dashboardPath = path.join(pluginRoot, 'web', 'dashboard', 'index.html')
  const run = createRun({
    dataDir,
    input: {
      petName: 'Service Cat',
      prompt: 'Visible in dashboard',
      backend: 'fixture',
      generationTask: {
        mode: 'single-action',
        targetPet: 'current',
        styleSource: 'currentPet',
        actions: [{
          actionId: 'shy-spin',
          name: '害羞转圈',
          motionPrompt: '点击后害羞转圈',
          frameCount: 8,
          triggerProposal: { type: 'click', binding: 'clickAction' }
        }]
      }
    },
    now: () => '2026-06-19T00:00:00.000Z'
  })
  updateRunStatus({
    dataDir,
    runId: run.runId,
    status: 'ready_for_review',
    patch: {
      artifacts: {
        generatedImage: {
          ok: true,
          backend: 'fixture',
          model: 'fixture-image',
          generatedAt: '2026-06-19T00:00:00.000Z',
          outputs: [{
            dataRelativePath: `runs/${run.runId}/frames/base/0001.png`,
            mimeType: 'image/png',
            sha256: 'service-source-sha'
          }]
        },
        actionFrames: {
          actionId: 'shy-spin',
          name: '害羞转圈',
          framesDir: path.join(dataDir, 'runs', run.runId, 'frames', 'actions', 'shy-spin'),
          qa: path.join(dataDir, 'runs', run.runId, 'qa', 'action-frame-validation.json'),
          frameCount: 8,
          frameWidth: 192,
          frameHeight: 208,
          triggerProposal: { type: 'click', binding: 'clickAction' }
        }
      }
    },
    now: () => '2026-06-19T00:00:30.000Z'
  })
  const sourceDir = path.join(dataDir, 'runs', run.runId, 'frames', 'base')
  const framesDir = path.join(dataDir, 'runs', run.runId, 'frames', 'actions', 'shy-spin')
  fs.mkdirSync(sourceDir, { recursive: true })
  fs.mkdirSync(framesDir, { recursive: true })
  await sharp({
    create: {
      width: 192,
      height: 208,
      channels: 4,
      background: { r: 120, g: 80, b: 220, alpha: 1 }
    }
  }).png().toFile(path.join(sourceDir, '0001.png'))
  fs.writeFileSync(path.join(framesDir, '0001.png'), Buffer.from('broken-frame'))
  const qaPath = path.join(dataDir, 'runs', run.runId, 'qa', 'action-frame-validation.json')
  appendRunLog({
    dataDir,
    runId: run.runId,
    level: 'info',
    event: 'run.created',
    message: `Run created in ${framesDir}`,
    data: {
      outputDir: framesDir,
      nested: {
        qaPath,
        samples: [framesDir, 42]
      }
    },
    now: () => '2026-06-19T00:01:00.000Z'
  })
  const server = createCreatorStudioServer({ dataDir, dashboardPath })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const runs = await fetch(`http://127.0.0.1:${port}/api/runs`).then((response) => response.json())
    const detail = await fetch(`http://127.0.0.1:${port}/api/runs/${run.runId}`).then((response) => response.json())
    const logs = await fetch(`http://127.0.0.1:${port}/api/runs/${run.runId}/logs`).then((response) => response.json())

    assert.equal(runs.ok, true)
    assert.equal(runs.runs[0].artifacts.actionFrames.framesDir, undefined)
    assert.equal(JSON.stringify(runs).includes(dataDir), false)
    assert.equal(detail.ok, true)
    assert.equal(detail.run.runId, run.runId)
    assert.equal(detail.actionReview.actionId, 'shy-spin')
    assert.equal(detail.actionReview.frameCount, 8)
    assert.equal(detail.actionReview.triggerProposal.type, 'click')
    assert.equal(detail.actionReview.previewFrames.length, 8)
    assert.equal(detail.actionReview.previewFrames[0].fileName, '0001.png')
    assert.equal(detail.actionReview.previewFrames[0].url, `/api/runs/${encodeURIComponent(run.runId)}/action-frames/shy-spin/0001.png`)
    assert.equal(detail.actionReview.playback.loop, false)
    assert.equal(detail.actionReview.playback.totalDurationMs, 1060)
    assert.equal(detail.actionReview.playback.holdLastFrameMs, 220)
    assert.equal(detail.actionReview.playback.frameDurationsMs.length, 8)
    assert.equal(detail.actionReview.playback.frameDurationsMs[0], 120)
    assert.equal(detail.actionReview.playback.frameDurationsMs[7], 220)
    assert.equal(detail.actionReview.playback.timeline.length, 8)
    assert.deepEqual(detail.actionReview.playback.timeline[0], {
      fileName: '0001.png',
      frameIndex: 0,
      durationMs: 120,
      startMs: 0,
      endMs: 120
    })
    assert.deepEqual(detail.actionReview.playback.timeline[7], {
      fileName: '0008.png',
      frameIndex: 7,
      durationMs: 220,
      startMs: 840,
      endMs: 1060
    })
    assert.equal(detail.actionReview.qa, `runs/${run.runId}/qa/action-frame-validation.json`)
    assert.equal(detail.run.artifacts.actionFrames.framesDir, undefined)
    assert.equal(detail.run.artifacts.actionFrames.qa, `runs/${run.runId}/qa/action-frame-validation.json`)
    assert.equal(detail.run.artifacts.generatedImage, undefined)
    assert.equal(JSON.stringify(detail).includes(dataDir), false)
    assert.equal(logs.ok, true)
    assert.deepEqual(logs.logs.map((entry) => entry.event), ['run.created'])
    assert.equal(JSON.stringify(logs).includes(dataDir), false)
    assert.equal(logs.logs[0].message, `Run created in OPENPET_DATA_DIR/runs/${run.runId}/frames/actions/shy-spin`)
    assert.equal(logs.logs[0].data.outputDir, `runs/${run.runId}/frames/actions/shy-spin`)
    assert.equal(logs.logs[0].data.nested.qaPath, `runs/${run.runId}/qa/action-frame-validation.json`)
    assert.deepEqual(logs.logs[0].data.nested.samples, [`runs/${run.runId}/frames/actions/shy-spin`, 42])

    const invalidFrame = await fetch(`http://127.0.0.1:${port}/api/runs/${run.runId}/action-frames/shy-spin/not-a-frame.png`)

    assert.equal(invalidFrame.status, 404)

    const repaired = await fetch(`http://127.0.0.1:${port}/api/runs/${run.runId}/action-frames/shy-spin/0001.png/repair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    }).then((response) => response.json())
    const frameResponse = await fetch(`http://127.0.0.1:${port}${detail.actionReview.previewFrames[0].url}`)
    const frameBytes = Buffer.from(await frameResponse.arrayBuffer())
    const contactSheetResponse = await fetch(`http://127.0.0.1:${port}${repaired.actionReview.contactSheetUrl}`)
    const contactSheetBytes = Buffer.from(await contactSheetResponse.arrayBuffer())
    const repairedQa = JSON.parse(fs.readFileSync(path.join(dataDir, 'runs', run.runId, 'qa', 'action-frame-validation.json'), 'utf-8'))
    const logsAfterRepair = await fetch(`http://127.0.0.1:${port}/api/runs/${run.runId}/logs`).then((response) => response.json())
    const failedApprovalResponse = await fetch(`http://127.0.0.1:${port}/api/runs/${run.runId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    })
    const failedApproval = await failedApprovalResponse.json()
    for (let index = 2; index <= 8; index += 1) {
      fs.copyFileSync(path.join(framesDir, '0001.png'), path.join(framesDir, `${String(index).padStart(4, '0')}.png`))
    }
    fs.writeFileSync(qaPath, `${JSON.stringify(createActionFrameQa({
      actionId: 'shy-spin',
      frameCount: 8
    }), null, 2)}\n`)
    const actionApproved = await fetch(`http://127.0.0.1:${port}/api/runs/${run.runId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    }).then((response) => response.json())
    const logsAfterApprove = await fetch(`http://127.0.0.1:${port}/api/runs/${run.runId}/logs`).then((response) => response.json())

    assert.equal(repaired.ok, true)
    assert.equal(frameResponse.status, 200)
    assert.equal(frameResponse.headers.get('content-type'), 'image/png')
    assert.equal(frameBytes.slice(1, 4).toString('utf-8'), 'PNG')
    assert.equal(contactSheetResponse.status, 200)
    assert.equal(contactSheetResponse.headers.get('content-type'), 'image/png')
    assert.equal(contactSheetBytes.slice(1, 4).toString('utf-8'), 'PNG')
    assert.equal(repaired.repair.fileName, '0001.png')
    assert.equal(repaired.repair.contactSheet, `runs/${run.runId}/qa/action-frame-contact-sheet.png`)
    assert.equal(repaired.repair.qa, `runs/${run.runId}/qa/action-frame-validation.json`)
    assert.equal(repaired.actionReview.contactSheet, `runs/${run.runId}/qa/action-frame-contact-sheet.png`)
    assert.equal(repaired.actionReview.contactSheetUrl, `/api/runs/${encodeURIComponent(run.runId)}/action-frames/shy-spin/contact-sheet.png`)
    assert.equal(repaired.actionReview.previewFrames[0].fileName, '0001.png')
    assert.equal(JSON.stringify(repaired).includes(dataDir), false)
    assert.equal(repairedQa.frames[0].visiblePixels > 0, true)
    assert.equal(repairedQa.contactSheetRelativePath, `runs/${run.runId}/qa/action-frame-contact-sheet.png`)
    assert.equal(repairedQa.repairs[0].fileName, '0001.png')
    assert.deepEqual(logsAfterRepair.logs.map((entry) => entry.event), ['run.created', 'action-frame.repaired'])
    assert.equal(failedApprovalResponse.status, 400)
    assert.equal(failedApproval.ok, false)
    assert.match(failedApproval.error, /QA must pass/)
    assert.equal(actionApproved.ok, true)
    assert.equal(actionApproved.run.status, 'approved')
    assert.equal(actionApproved.importCommand, 'import-approved-action')
    assert.equal(actionApproved.actionReview.importStatus, 'not-imported')
    assert.equal(actionApproved.run.artifacts.actionFrames.framesDir, undefined)
    assert.equal(JSON.stringify(actionApproved).includes(dataDir), false)
    assert.deepEqual(logsAfterApprove.logs.map((entry) => entry.event), ['run.created', 'action-frame.repaired', 'run.approved'])
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio service exposes task review routes for dashboard clients', async () => {
  const { createCreatorStudioServer } = require('../../examples/plugins/creator-studio/service/studio-service')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-service-task-'))
  const dashboardPath = path.join(pluginRoot, 'web', 'dashboard', 'index.html')
  const server = createCreatorStudioServer({ dataDir, dashboardPath })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const postJsonResponse = async (pathname, body = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    return { response, body: await response.json() }
  }
  const postJson = (pathname, body = {}) => fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then((response) => response.json())

  try {
    const draft = await postJson('/api/tasks/draft', {
      prompt: '新增一个自定义动作：原地打滚，动作要循环。',
      backend: 'fixture'
    })
    const earlyApproval = await postJsonResponse(`/api/runs/${draft.run.runId}/approve`)
    const answered = await postJson(`/api/runs/${draft.run.runId}/questions/trigger/answer`, {
      answer: 'click'
    })
    const confirmed = await postJson(`/api/runs/${draft.run.runId}/confirm`)
    const generated = await postJson(`/api/runs/${draft.run.runId}/generate-action`)
    const approved = await postJson(`/api/runs/${draft.run.runId}/approve`)
    const logs = await fetch(`http://127.0.0.1:${port}/api/runs/${draft.run.runId}/logs`).then((response) => response.json())

    assert.equal(draft.ok, true)
    assert.equal(draft.run.taskStatus, 'needs_input')
    assert.equal(draft.run.generationTask.questions[0].id, 'trigger')
    assert.equal(draft.run.wizardState.phase, 'needs-input')
    assert.match(draft.run.wizardState.summary, /Answer the pending follow-up/i)
    assert.match(draft.run.wizardState.prompt, /原地打滚/)
    assert.deepEqual(draft.run.wizardState.steps.map((step) => `${step.key}:${step.status}`), [
      'draft:complete',
      'follow-up:current',
      'confirm:upcoming',
      'generate:upcoming',
      'review:upcoming',
      'import:upcoming'
    ])
    assert.equal(draft.run.wizardState.nextStep.label, 'Answer follow-up')
    assert.equal(draft.run.wizardState.nextStep.blocked, false)
    assert.equal(earlyApproval.response.status, 400)
    assert.equal(earlyApproval.body.ok, false)
    assert.match(earlyApproval.body.error, /ready_for_review/)
    assert.equal(answered.ok, true)
    assert.equal(answered.run.taskStatus, 'ready_for_confirmation')
    assert.equal(answered.run.generationTask.questions.length, 0)
    assert.equal(answered.run.wizardState.phase, 'ready-for-confirmation')
    assert.match(answered.run.wizardState.summary, /Confirm the drafted task/i)
    assert.deepEqual(answered.run.wizardState.steps.map((step) => `${step.key}:${step.status}`), [
      'draft:complete',
      'follow-up:complete',
      'confirm:current',
      'generate:upcoming',
      'review:upcoming',
      'import:upcoming'
    ])
    assert.equal(answered.run.wizardState.nextStep.label, 'Confirm task')
    assert.equal(answered.run.wizardState.nextStep.blocked, false)
    assert.equal(confirmed.ok, true)
    assert.equal(confirmed.run.taskStatus, 'confirmed')
    assert.equal(confirmed.run.wizardState.phase, 'ready-to-generate')
    assert.match(confirmed.run.wizardState.summary, /Run Generate action/i)
    assert.deepEqual(confirmed.run.wizardState.steps.map((step) => `${step.key}:${step.status}`), [
      'draft:complete',
      'follow-up:complete',
      'confirm:complete',
      'generate:current',
      'review:upcoming',
      'import:upcoming'
    ])
    assert.equal(confirmed.run.wizardState.nextStep.label, 'Generate action')
    assert.equal(confirmed.run.wizardState.nextStep.blocked, false)
    assert.equal(generated.ok, true)
    assert.equal(generated.run.status, 'ready_for_review')
    assert.equal(generated.run.wizardState.phase, 'ready-for-review')
    assert.match(generated.run.wizardState.summary, /Review QA artifacts/i)
    assert.deepEqual(generated.run.wizardState.steps.map((step) => `${step.key}:${step.status}`), [
      'draft:complete',
      'follow-up:complete',
      'confirm:complete',
      'generate:complete',
      'review:current',
      'import:upcoming'
    ])
    assert.equal(generated.run.wizardState.nextStep.label, 'Approve run')
    assert.equal(generated.run.wizardState.nextStep.blocked, false)
    assert.equal(generated.run.artifacts.actionTaskQa.endsWith('action-generation-task.json'), true)
    assert.equal(fs.existsSync(path.join(dataDir, generated.run.artifacts.actionTaskQa)), true)
    assert.equal(JSON.stringify(generated).includes(dataDir), false)
    assert.equal(approved.ok, true)
    assert.equal(approved.run.status, 'approved')
    assert.equal(approved.run.reviewStatus, 'approved')
    assert.equal(approved.run.currentStep, 'approved')
    assert.equal(approved.run.wizardState.phase, 'approved')
    assert.match(approved.run.wizardState.summary, /Run the host-owned import command/i)
    assert.deepEqual(approved.run.wizardState.steps.map((step) => `${step.key}:${step.status}`), [
      'draft:complete',
      'follow-up:complete',
      'confirm:complete',
      'generate:complete',
      'review:complete',
      'import:blocked'
    ])
    assert.equal(approved.run.wizardState.nextStep.label, 'Import Approved Pet')
    assert.equal(approved.run.wizardState.nextStep.blocked, true)
    assert.match(approved.run.wizardState.nextStep.reason, /Control Center -> Plugins/i)
    assert.equal(approved.run.artifacts.generatedImage, undefined)
    assert.equal(approved.importCommand, 'import-approved-pet')
    assert.equal(approved.actionReview, null)
    assert.equal(JSON.stringify(approved).includes(dataDir), false)
    assert.equal(logs.logs.at(-1).event, 'run.approved')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio service returns full-pet specific wizard and dashboard labels', async () => {
  const { createCreatorStudioServer } = require('../../examples/plugins/creator-studio/service/studio-service')
  const { createRun, updateRunStatus } = require('../../examples/plugins/creator-studio/lib/run-store')
  const { normalizeGenerationTask } = require('../../examples/plugins/creator-studio/lib/generation-task')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-service-full-pet-copy-'))
  const dashboardPath = path.join(pluginRoot, 'web', 'dashboard', 'index.html')
  const server = createCreatorStudioServer({ dataDir, dashboardPath })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const petTask = normalizeGenerationTask({
      mode: 'full-pet',
      targetPet: 'new',
      styleSource: 'textOnly',
      characterBrief: '一只软乎乎的橘猫桌宠。',
      actions: [{
        actionId: 'idle',
        name: 'Idle',
        motionPrompt: 'neutral idle pose',
        loop: true,
        frameCount: 12,
        triggerProposal: { type: 'state', binding: 'idle' }
      }]
    })
    const run = createRun({
      dataDir,
      input: {
        petName: 'Full Pet Copy Cat',
        prompt: '生成一只完整的新桌宠。',
        originalPrompt: '生成一只完整的新桌宠。',
        backend: 'fixture',
        generationTask: petTask
      },
      now: () => '2026-06-26T00:30:00.000Z'
    })

    updateRunStatus({
      dataDir,
      runId: run.runId,
      status: 'draft',
      patch: {
        taskStatus: 'confirmed',
        currentStep: 'confirm'
      },
      now: () => '2026-06-26T00:31:00.000Z'
    })

    const confirmedDetail = await fetch(`http://127.0.0.1:${port}/api/runs/${run.runId}`).then((response) => response.json())

    assert.equal(confirmedDetail.ok, true)
    assert.match(confirmedDetail.run.wizardState.summary, /Run Generate pet pack/i)
    assert.equal(confirmedDetail.run.wizardState.nextStep.label, 'Generate pet pack')
    assert.equal(confirmedDetail.run.actionLane.dashboardAction.label, 'Generate pet pack')
    assert.equal(confirmedDetail.run.actionLane.buttonStates.generate.label, 'Generate pet pack')

    updateRunStatus({
      dataDir,
      runId: run.runId,
      status: 'ready_for_review',
      patch: {
        currentStep: 'review',
        reviewStatus: 'pending',
        artifacts: {
          outputDir: path.join(dataDir, 'runs', run.runId, 'outputs'),
          petJson: path.join(dataDir, 'runs', run.runId, 'outputs', 'pet.json'),
          spritesheet: path.join(dataDir, 'runs', run.runId, 'outputs', 'spritesheet.webp'),
          bundle: path.join(dataDir, 'runs', run.runId, 'outputs', 'full-pet-copy-cat.codex-pet.zip'),
          qa: path.join(dataDir, 'runs', run.runId, 'qa', 'atlas-validation.json'),
          sourceImageQa: path.join(dataDir, 'runs', run.runId, 'qa', 'source-image-validation.json'),
          actionTaskQa: path.join(dataDir, 'runs', run.runId, 'qa', 'action-generation-task.json')
        }
      },
      now: () => '2026-06-26T00:32:00.000Z'
    })

    const reviewDetail = await fetch(`http://127.0.0.1:${port}/api/runs/${run.runId}`).then((response) => response.json())

    assert.equal(reviewDetail.ok, true)
    assert.equal(reviewDetail.actionReview, null)
    assert.match(reviewDetail.run.workflowGuidance.import.summary, /pet-pack output/i)
    assert.equal(reviewDetail.run.actionLane.buttonStates.generate.label, 'Generate pet pack')
    assert.equal(reviewDetail.run.actionLane.buttonStates.approve.label, 'Approve run')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio dashboard task preview renders full-pet brief and action summary', () => {
  const dashboardPath = path.join(pluginRoot, 'web', 'dashboard', 'index.html')
  const html = fs.readFileSync(dashboardPath, 'utf-8')

  assert.match(html, /isFullPetRun\(run\) && run\.generationTask\.characterBrief/)
  assert.match(html, /actionSummaries/)
  assert.match(html, /triggerSummaries/)
})

test('creator studio dashboard asset exposes task edit controls before confirmation', () => {
  const dashboardPath = path.join(pluginRoot, 'web', 'dashboard', 'index.html')
  const html = fs.readFileSync(dashboardPath, 'utf-8')

  assert.match(html, /id="task-edit-panel"/)
  assert.match(html, /id="save-task-button"/)
  assert.match(html, /Action name/)
  assert.match(html, /Motion description/)
  assert.match(html, /Loop behavior/)
  assert.match(html, /Trigger type/)
  assert.match(html, /Character brief/)
})

test('creator studio service rejects unknown api routes instead of falling back to dashboard html', async () => {
  const { createCreatorStudioServer } = require('../../examples/plugins/creator-studio/service/studio-service')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-service-route-guard-'))
  const dashboardPath = path.join(pluginRoot, 'web', 'dashboard', 'index.html')
  const server = createCreatorStudioServer({ dataDir, dashboardPath })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const healthCheckResponse = await fetch(`http://127.0.0.1:${port}/api/model-health-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    })
    const importResponse = await fetch(`http://127.0.0.1:${port}/api/runs/demo-run/import-approved-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    })
    const healthCheckBody = await healthCheckResponse.json()
    const importBody = await importResponse.json()

    assert.equal(healthCheckResponse.status, 404)
    assert.equal(healthCheckBody.ok, false)
    assert.match(healthCheckBody.error, /not found/i)
    assert.equal(importResponse.status, 404)
    assert.equal(importBody.ok, false)
    assert.match(importBody.error, /not found/i)
    assert.equal(healthCheckResponse.headers.get('content-type'), 'application/json; charset=utf-8')
    assert.equal(importResponse.headers.get('content-type'), 'application/json; charset=utf-8')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio service exposes sanitized host prompt provenance for dashboard clients', async () => {
  const { createCreatorStudioServer } = require('../../examples/plugins/creator-studio/service/studio-service')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-service-prompt-'))
  const dashboardPath = path.join(pluginRoot, 'web', 'dashboard', 'index.html')
  const server = createCreatorStudioServer({ dataDir, dashboardPath })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const bridgeRequests = []
  const bridgeServer = require('node:http').createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      const payload = body ? JSON.parse(body) : {}
      bridgeRequests.push({ url: request.url, payload })
      response.writeHead(200, {
        'Content-Type': 'application/json',
        Connection: 'close'
      })
      if (request.url.endsWith('/creator/model-settings')) {
        response.end(JSON.stringify({
          ok: true,
          config: {
            provider: 'openai-compatible',
            baseUrl: 'http://127.0.0.1:7860/v1',
            model: 'local-custom-sprite-v2',
            hasApiKey: true,
            apiKeyPreview: '••••test'
          }
        }))
        return
      }
      const dataRelativePath = `runs/${payload.output.dataRelativeDir.split('/')[1]}/frames/base/0001.png`
      const generatedPath = path.join(dataDir, dataRelativePath)
      fs.mkdirSync(path.dirname(generatedPath), { recursive: true })
      sharp({
        create: {
          width: 96,
          height: 112,
          channels: 4,
          background: { r: 140, g: 190, b: 90, alpha: 1 }
        }
      })
        .png()
        .toFile(generatedPath)
        .then(() => {
          response.end(JSON.stringify({
            ok: true,
            result: {
              ok: true,
              backend: 'local',
              model: 'local-custom-sprite-v2',
              generatedAt: '2026-06-25T00:00:00.000Z',
              outputs: [{
                dataRelativePath,
                mimeType: 'image/png',
                sha256: 'prompt-provenance-sha'
              }]
            }
          }))
        })
        .catch((error) => {
          response.end(JSON.stringify({ ok: false, error: error.message }))
        })
    })
  })
  await new Promise((resolve) => bridgeServer.listen(0, '127.0.0.1', resolve))
  const bridgePort = bridgeServer.address().port
  const previousBridgeUrl = process.env.OPENPET_BRIDGE_URL
  const previousBridgeToken = process.env.OPENPET_BRIDGE_TOKEN
  process.env.OPENPET_BRIDGE_URL = `http://127.0.0.1:${bridgePort}`
  process.env.OPENPET_BRIDGE_TOKEN = 'bridge-token'
  const postJson = (pathname, body = {}) => fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then((response) => response.json())

  try {
    const unsafePrompt = '给当前猫猫加一个“摸头撒娇”的动作，点击触发。API key sk-test-secret at /Users/mango/private/ref.png via http://127.0.0.1:8317/v1 and bridge-token.'
    const draft = await postJson('/api/tasks/draft', {
      prompt: unsafePrompt,
      backend: 'local'
    })
    await postJson(`/api/runs/${draft.run.runId}/confirm`)
    await postJson(`/api/runs/${draft.run.runId}/generate-action`)
    const detail = await fetch(`http://127.0.0.1:${port}/api/runs/${draft.run.runId}`).then((response) => response.json())
    const serializedDetail = JSON.stringify(detail)

    assert.equal(detail.ok, true)
    assert.equal(detail.run.status, 'ready_for_review')
    assert.equal(detail.run.developerPrompt.available, true)
    assert.equal(detail.run.developerPrompt.source, 'host-model-bridge')
    assert.equal(detail.run.developerPrompt.promptBuilder.version, 1)
    assert.equal(detail.run.developerPrompt.promptBuilder.mode, 'single-action')
    assert.equal(detail.run.developerPrompt.promptBuilder.actionId, detail.run.generationTask.actions[0].actionId)
    assert.equal(detail.run.developerPrompt.promptBuilder.warnings.includes('creative_brief_sanitized'), true)
    assert.equal(detail.run.developerPrompt.promptPreview.truncated, false)
    assert.match(detail.run.developerPrompt.promptPreview.text, /OpenPet desktop pet sprite asset/)
    assert.match(detail.run.developerPrompt.promptPreview.text, /\[redacted-secret\]/)
    assert.equal(serializedDetail.includes('sk-test-secret'), false)
    assert.equal(serializedDetail.includes('/Users/mango/private/ref.png'), false)
    assert.equal(serializedDetail.includes('127.0.0.1:8317'), false)
    assert.equal(serializedDetail.includes('127.0.0.1:7860'), false)
    assert.equal(serializedDetail.includes('bridge-token'), false)
    assert.equal(serializedDetail.includes(dataDir), false)
    assert.equal(bridgeRequests.at(-1).payload.prompt.includes('sk-test-secret'), false)
  } finally {
    if (previousBridgeUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousBridgeUrl
    if (previousBridgeToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousBridgeToken
    bridgeServer.closeAllConnections?.()
    await new Promise((resolve) => bridgeServer.close(resolve))
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio service exposes workflow guidance for fixture and imported provider runs', async () => {
  const { createCreatorStudioServer } = require('../../examples/plugins/creator-studio/service/studio-service')
  const { createRun, updateRunStatus } = require('../../examples/plugins/creator-studio/lib/run-store')
  const { normalizeGenerationTask } = require('../../examples/plugins/creator-studio/lib/generation-task')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-service-guidance-'))
  const dashboardPath = path.join(pluginRoot, 'web', 'dashboard', 'index.html')
  const server = createCreatorStudioServer({ dataDir, dashboardPath })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const generationTask = normalizeGenerationTask({
      mode: 'single-action',
      targetPet: 'current',
      styleSource: 'currentPet',
      actions: [{
        actionId: 'shy-spin',
        name: '害羞转圈',
        motionPrompt: '点击后害羞转圈',
        loop: false,
        frameCount: 16,
        triggerProposal: { type: 'click', binding: 'clickAction', notes: 'User selected click trigger.' }
      }]
    })
    const fixtureRun = createRun({
      dataDir,
      input: {
        petName: 'Fixture Guidance Cat',
        prompt: '新增一个自定义动作：害羞转圈，点击触发。',
        originalPrompt: '新增一个自定义动作：害羞转圈，点击触发。',
        backend: 'fixture',
        generationTask
      },
      now: () => '2026-06-26T00:00:00.000Z'
    })
    const importedRun = createRun({
      dataDir,
      input: {
        petName: 'Imported Guidance Cat',
        prompt: '新增一个自定义动作：害羞转圈，点击触发。',
        originalPrompt: '新增一个自定义动作：害羞转圈，点击触发。',
        backend: 'local',
        generationTask
      },
      now: () => '2026-06-26T00:01:00.000Z'
    })
    updateRunStatus({
      dataDir,
      runId: fixtureRun.runId,
      status: 'ready_for_review',
      patch: {
        taskStatus: 'confirmed',
        currentStep: 'review',
        reviewStatus: 'pending',
        artifacts: {
          actionFrames: {
            actionId: 'shy-spin',
            name: '害羞转圈',
            qa: path.join(dataDir, 'runs', fixtureRun.runId, 'qa', 'action-frame-validation.json'),
            contactSheet: path.join(dataDir, 'runs', fixtureRun.runId, 'qa', 'action-frame-contact-sheet.png'),
            frameCount: 16,
            frameWidth: 192,
            frameHeight: 208,
            triggerProposal: { type: 'click', binding: 'clickAction' }
          }
        }
      },
      now: () => '2026-06-26T00:02:00.000Z'
    })
    updateRunStatus({
      dataDir,
      runId: importedRun.runId,
      status: 'imported',
      patch: {
        taskStatus: 'confirmed',
        currentStep: 'imported',
        reviewStatus: 'approved',
        importStatus: 'imported',
        importedActionId: 'shy-spin',
        modelSnapshot: {
          backend: 'local',
          provider: 'openai-compatible',
          model: 'local-custom-sprite-v2',
          baseUrlHost: '127.0.0.1:7860'
        },
        triggerProposalSubmission: {
          ok: true,
          proposal: {
            id: 'proposal:click:shy-spin:test'
          }
        },
        artifacts: {
          generatedImage: {
            ok: true,
            backend: 'local',
            model: 'local-custom-sprite-v2',
            generatedAt: '2026-06-26T00:02:00.000Z',
            usage: {
              estimatedCostUsd: 0.012345
            },
            outputs: [{
              dataRelativePath: `runs/${importedRun.runId}/frames/base/0001.png`,
              mimeType: 'image/png',
              sha256: 'imported-provider-sha'
            }]
          },
          actionFrames: {
            actionId: 'shy-spin',
            name: '害羞转圈',
            qa: path.join(dataDir, 'runs', importedRun.runId, 'qa', 'action-frame-validation.json'),
            contactSheet: path.join(dataDir, 'runs', importedRun.runId, 'qa', 'action-frame-contact-sheet.png'),
            frameCount: 16,
            frameWidth: 192,
            frameHeight: 208,
            triggerProposal: { type: 'click', binding: 'clickAction' }
          }
        }
      },
      now: () => '2026-06-26T00:03:00.000Z'
    })

    const fixtureDetail = await fetch(`http://127.0.0.1:${port}/api/runs/${fixtureRun.runId}`).then((response) => response.json())
    const importedDetail = await fetch(`http://127.0.0.1:${port}/api/runs/${importedRun.runId}`).then((response) => response.json())
    const importedSerialized = JSON.stringify(importedDetail)

    assert.equal(fixtureDetail.ok, true)
    assert.equal(fixtureDetail.run.workflowGuidance.generation.mode, 'fixture-preview')
    assert.match(fixtureDetail.run.workflowGuidance.generation.summary, /workflow QA/i)
    assert.equal(fixtureDetail.run.workflowGuidance.generation.smokeChecklist.some((entry) => /provider generation/i.test(entry)), true)
    assert.equal(fixtureDetail.run.workflowGuidance.generation.usageSummary.available, false)
    assert.equal(fixtureDetail.run.workflowGuidance.generation.usageSummary.displayCost, '')

    assert.equal(importedDetail.ok, true)
    assert.equal(importedDetail.run.workflowGuidance.generation.mode, 'host-provider')
    assert.match(importedDetail.run.workflowGuidance.generation.summary, /host-owned image Provider/i)
    assert.equal(importedDetail.run.backend, 'provider')
    assert.equal(importedDetail.run.workflowGuidance.generation.smokeChecklist.some((entry) => /Control Center/i.test(entry)), true)
    assert.equal(importedDetail.run.workflowGuidance.generation.usageSummary.available, true)
    assert.equal(importedDetail.run.workflowGuidance.generation.usageSummary.estimatedCostUsd, 0.012345)
    assert.match(importedDetail.run.workflowGuidance.generation.usageSummary.displayCost, /\$0\.0123/)
    assert.equal(importedDetail.run.workflowGuidance.import.status, 'imported')
    assert.equal(importedDetail.run.workflowGuidance.import.command, 'import-approved-action')
    assert.match(importedDetail.run.workflowGuidance.import.summary, /Imported action/i)
    assert.equal(importedDetail.run.workflowGuidance.import.triggerProposalStatus, 'submitted')
    assert.match(importedDetail.run.workflowGuidance.import.triggerProposalSummary, /Trigger Proposal Inbox/i)
    assert.equal(importedDetail.run.wizardState.phase, 'imported')
    assert.deepEqual(importedDetail.run.wizardState.steps.map((step) => `${step.key}:${step.status}`), [
      'draft:complete',
      'follow-up:complete',
      'confirm:complete',
      'generate:complete',
      'review:complete',
      'import:complete'
    ])
    assert.equal(importedDetail.run.wizardState.nextStep.label, 'Review imported result')
    assert.equal(importedDetail.run.wizardState.nextStep.blocked, true)
    assert.equal(importedSerialized.includes('127.0.0.1:7860'), false)
    assert.equal(importedSerialized.includes(dataDir), false)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio service exposes safe import handoff guidance for approved dashboard runs', async () => {
  const { createCreatorStudioServer } = require('../../examples/plugins/creator-studio/service/studio-service')
  const { createRun, updateRunStatus } = require('../../examples/plugins/creator-studio/lib/run-store')
  const { normalizeGenerationTask } = require('../../examples/plugins/creator-studio/lib/generation-task')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-service-import-handoff-'))
  const dashboardPath = path.join(pluginRoot, 'web', 'dashboard', 'index.html')
  const server = createCreatorStudioServer({ dataDir, dashboardPath })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const actionTask = normalizeGenerationTask({
      mode: 'single-action',
      targetPet: 'current',
      styleSource: 'currentPet',
      actions: [{
        actionId: 'shy-spin',
        name: '害羞转圈',
        motionPrompt: '点击后害羞转圈',
        loop: false,
        frameCount: 16,
        triggerProposal: { type: 'click', binding: 'clickAction', notes: 'User selected click trigger.' }
      }]
    })
    const actionRun = createRun({
      dataDir,
      input: {
        petName: 'Approved Action Cat',
        prompt: '新增一个自定义动作：害羞转圈，点击触发。',
        originalPrompt: '新增一个自定义动作：害羞转圈，点击触发。',
        backend: 'local',
        generationTask: actionTask
      },
      now: () => '2026-06-26T00:10:00.000Z'
    })
    updateRunStatus({
      dataDir,
      runId: actionRun.runId,
      status: 'approved',
      patch: {
        taskStatus: 'confirmed',
        currentStep: 'approved',
        reviewStatus: 'approved',
        artifacts: {
          actionFrames: {
            actionId: 'shy-spin',
            name: '害羞转圈',
            qa: path.join(dataDir, 'runs', actionRun.runId, 'qa', 'action-frame-validation.json'),
            contactSheet: path.join(dataDir, 'runs', actionRun.runId, 'qa', 'action-frame-contact-sheet.png'),
            frameCount: 16,
            frameWidth: 192,
            frameHeight: 208,
            triggerProposal: { type: 'click', binding: 'clickAction' }
          }
        }
      },
      now: () => '2026-06-26T00:11:00.000Z'
    })

    const petTask = normalizeGenerationTask({
      mode: 'full-pet',
      targetPet: 'new',
      styleSource: 'textOnly',
      characterBrief: '一只软乎乎的橘猫桌宠。',
      actions: [{
        actionId: 'idle',
        name: 'Idle',
        motionPrompt: 'neutral idle pose',
        loop: true,
        frameCount: 12,
        triggerProposal: { type: 'state', binding: 'idle' }
      }]
    })
    const petRun = createRun({
      dataDir,
      input: {
        petName: 'Approved Pet Cat',
        prompt: '生成一只完整的新桌宠。',
        originalPrompt: '生成一只完整的新桌宠。',
        backend: 'fixture',
        generationTask: petTask
      },
      now: () => '2026-06-26T00:12:00.000Z'
    })
    updateRunStatus({
      dataDir,
      runId: petRun.runId,
      status: 'approved',
      patch: {
        taskStatus: 'confirmed',
        currentStep: 'approved',
        reviewStatus: 'approved',
        artifacts: {
          outputDir: path.join(dataDir, 'runs', petRun.runId, 'output'),
          bundle: path.join(dataDir, 'runs', petRun.runId, 'output', 'approved-pet.codex-pet.zip')
        }
      },
      now: () => '2026-06-26T00:13:00.000Z'
    })

    const actionDetail = await fetch(`http://127.0.0.1:${port}/api/runs/${actionRun.runId}`).then((response) => response.json())
    const petDetail = await fetch(`http://127.0.0.1:${port}/api/runs/${petRun.runId}`).then((response) => response.json())
    const actionHandoff = actionDetail.run.workflowGuidance.import.handoff
    const petHandoff = petDetail.run.workflowGuidance.import.handoff
    const serialized = JSON.stringify({ actionDetail, petDetail })

    assert.equal(actionDetail.ok, true)
    assert.equal(actionHandoff.ready, true)
    assert.equal(actionHandoff.runId, actionRun.runId)
    assert.equal(actionHandoff.commandId, 'import-approved-action')
    assert.equal(actionHandoff.commandTitle, 'Import Approved Action')
    assert.match(actionHandoff.location, /Control Center -> Plugins/i)
    assert.match(actionHandoff.reason, /bridge token is command-scoped/i)
    assert.equal(actionHandoff.dashboardCanImport, false)
    assert.equal(actionDetail.run.actionLane.dashboardAction.available, false)
    assert.equal(actionDetail.run.actionLane.hostAction.required, true)
    assert.equal(actionDetail.run.actionLane.hostAction.label, 'Import Approved Action')
    assert.match(actionDetail.run.actionLane.hostAction.location, /Control Center -> Plugins/i)
    assert.match(actionDetail.run.actionLane.buttonStates.approve.reason, /already approved/i)

    assert.equal(petDetail.ok, true)
    assert.equal(petHandoff.ready, true)
    assert.equal(petHandoff.runId, petRun.runId)
    assert.equal(petHandoff.commandId, 'import-approved-pet')
    assert.equal(petHandoff.commandTitle, 'Import Approved Pet')
    assert.match(petHandoff.location, /Control Center -> Plugins/i)
    assert.match(petHandoff.reason, /bridge token is command-scoped/i)
    assert.equal(petHandoff.dashboardCanImport, false)
    assert.equal(petDetail.run.actionLane.dashboardAction.available, false)
    assert.equal(petDetail.run.actionLane.hostAction.required, true)
    assert.equal(petDetail.run.actionLane.hostAction.label, 'Import Approved Pet')

    assert.equal(serialized.includes(dataDir), false)
    assert.equal(serialized.includes('bridge-token'), false)
    assert.equal(serialized.includes('sk-'), false)
    assert.equal(serialized.includes('OPENPET_BRIDGE_TOKEN'), false)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio service exposes failed generation recovery and retries the same run', async () => {
  const { createCreatorStudioServer } = require('../../examples/plugins/creator-studio/service/studio-service')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-service-retry-'))
  const dashboardPath = path.join(pluginRoot, 'web', 'dashboard', 'index.html')
  const server = createCreatorStudioServer({ dataDir, dashboardPath })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  let generationAttempts = 0
  const bridgeServer = require('node:http').createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      const payload = body ? JSON.parse(body) : {}
      response.writeHead(200, {
        'Content-Type': 'application/json',
        Connection: 'close'
      })
      if (request.url.endsWith('/creator/model-settings')) {
        response.end(JSON.stringify({
          ok: true,
          config: {
            provider: 'openai-compatible',
            baseUrl: 'http://127.0.0.1:7860/v1',
            model: 'local-custom-sprite-v2'
          }
        }))
        return
      }
      generationAttempts += 1
      if (generationAttempts === 1) {
        response.end(JSON.stringify({
          ok: false,
          error: 'Provider queue overloaded'
        }))
        return
      }
      const dataRelativePath = `runs/${payload.output.dataRelativeDir.split('/')[1]}/frames/base/0001.png`
      const generatedPath = path.join(dataDir, dataRelativePath)
      fs.mkdirSync(path.dirname(generatedPath), { recursive: true })
      sharp({
        create: {
          width: 96,
          height: 112,
          channels: 4,
          background: { r: 80, g: 150, b: 220, alpha: 1 }
        }
      })
        .png()
        .toFile(generatedPath)
        .then(() => {
          response.end(JSON.stringify({
            ok: true,
            result: {
              ok: true,
              backend: 'local',
              model: 'local-custom-sprite-v2',
              generatedAt: '2026-06-25T00:00:00.000Z',
              outputs: [{
                dataRelativePath,
                mimeType: 'image/png',
                sha256: 'retry-sha'
              }]
            }
          }))
        })
        .catch((error) => {
          response.end(JSON.stringify({ ok: false, error: error.message }))
        })
    })
  })
  await new Promise((resolve) => bridgeServer.listen(0, '127.0.0.1', resolve))
  const bridgePort = bridgeServer.address().port
  const previousBridgeUrl = process.env.OPENPET_BRIDGE_URL
  const previousBridgeToken = process.env.OPENPET_BRIDGE_TOKEN
  process.env.OPENPET_BRIDGE_URL = `http://127.0.0.1:${bridgePort}`
  process.env.OPENPET_BRIDGE_TOKEN = 'bridge-token'
  const postJsonResponse = async (pathname, body = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    return { response, body: await response.json() }
  }

  try {
    const draft = await postJsonResponse('/api/tasks/draft', {
      prompt: '新增一个自定义动作：开心挥手，动作要循环，点击触发。',
      backend: 'local'
    })
    const runId = draft.body.run.runId
    await postJsonResponse(`/api/runs/${runId}/confirm`)
    const failed = await postJsonResponse(`/api/runs/${runId}/generate-action`)
    const retried = await postJsonResponse(`/api/runs/${runId}/generate-action`)
    const logs = await fetch(`http://127.0.0.1:${port}/api/runs/${runId}/logs`).then((response) => response.json())

    assert.equal(failed.response.status, 500)
    assert.equal(failed.body.ok, false)
    assert.match(failed.body.error, /Provider queue overloaded/)
    assert.equal(failed.body.run.runId, runId)
    assert.equal(failed.body.run.status, 'failed')
    assert.equal(failed.body.run.recovery.canRetryGeneration, true)
    assert.equal(failed.body.run.recovery.actionLabel, 'Retry generation')
    assert.equal(failed.body.run.wizardState.nextStep.label, 'Retry generation')
    assert.equal(failed.body.run.wizardState.nextStep.blocked, false)
    assert.equal(failed.body.run.actionLane.dashboardAction.available, true)
    assert.equal(failed.body.run.actionLane.dashboardAction.label, 'Retry generation')
    assert.equal(failed.body.run.actionLane.buttonStates.generate.enabled, true)
    assert.deepEqual(failed.body.run.wizardState.steps.map((step) => `${step.key}:${step.status}`), [
      'draft:complete',
      'follow-up:complete',
      'confirm:complete',
      'generate:blocked',
      'review:upcoming',
      'import:upcoming'
    ])
    assert.equal(failed.body.run.recovery.backend.state, 'failed')
    assert.match(failed.body.run.recovery.backend.message, /Provider queue overloaded/)
    assert.equal(retried.response.status, 200)
    assert.equal(retried.body.ok, true)
    assert.equal(retried.body.run.runId, runId)
    assert.equal(retried.body.run.status, 'ready_for_review')
    assert.equal(retried.body.run.recovery.canRetryGeneration, false)
    assert.equal(retried.body.run.wizardState.nextStep.label, 'Approve run')
    assert.equal(retried.body.run.actionLane.dashboardAction.available, true)
    assert.equal(retried.body.run.actionLane.dashboardAction.label, 'Approve run')
    assert.equal(retried.body.run.actionLane.buttonStates.approve.enabled, true)
    assert.deepEqual(retried.body.run.wizardState.steps.map((step) => `${step.key}:${step.status}`), [
      'draft:complete',
      'follow-up:complete',
      'confirm:complete',
      'generate:complete',
      'review:current',
      'import:upcoming'
    ])
    assert.equal(generationAttempts, 2)
    assert.deepEqual(logs.logs.map((entry) => entry.event), [
      'task.drafted',
      'task.confirmed',
      'generate.start',
      'generate.failed',
      'generate.start',
      'generate.complete'
    ])
  } finally {
    if (previousBridgeUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousBridgeUrl
    if (previousBridgeToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousBridgeToken
    bridgeServer.closeAllConnections?.()
    await new Promise((resolve) => bridgeServer.close(resolve))
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio service rejects invalid dashboard JSON bodies', async () => {
  const { createCreatorStudioServer } = require('../../examples/plugins/creator-studio/service/studio-service')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-service-invalid-json-'))
  const dashboardPath = path.join(pluginRoot, 'web', 'dashboard', 'index.html')
  const server = createCreatorStudioServer({ dataDir, dashboardPath })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/tasks/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json'
    })
    const body = await response.json()

    assert.equal(response.status, 400)
    assert.equal(body.ok, false)
    assert.match(body.error, /valid JSON/)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio service lets dashboard update a drafted single-action task before confirmation', async () => {
  const { createCreatorStudioServer } = require('../../examples/plugins/creator-studio/service/studio-service')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-task-edit-'))
  const dashboardPath = path.join(pluginRoot, 'web', 'dashboard', 'index.html')
  const server = createCreatorStudioServer({ dataDir, dashboardPath })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const postJson = (pathname, body = {}) => fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then((response) => response.json())

  try {
    const draft = await postJson('/api/tasks/draft', {
      prompt: '新增一个自定义动作：原地打滚，动作要循环。',
      backend: 'fixture'
    })
    const updated = await postJson(`/api/runs/${draft.run.runId}/task`, {
      actionName: '害羞打滚',
      motionPrompt: '先缩起来再慢慢打滚一圈',
      loop: false,
      triggerType: 'manual'
    })

    assert.equal(updated.ok, true)
    assert.equal(updated.run.taskStatus, 'ready_for_confirmation')
    assert.equal(updated.run.generationTask.actions[0].name, '害羞打滚')
    assert.equal(updated.run.generationTask.actions[0].motionPrompt, '先缩起来再慢慢打滚一圈')
    assert.equal(updated.run.generationTask.actions[0].loop, false)
    assert.equal(updated.run.generationTask.actions[0].triggerProposal.type, 'manual')
    assert.equal(updated.run.generationTask.questions.length, 0)

    const stored = await fetch(`http://127.0.0.1:${port}/api/runs/${draft.run.runId}`).then((response) => response.json())
    assert.equal(stored.ok, true)
    assert.equal(stored.run.generationTask.actions[0].name, '害羞打滚')
    assert.equal(stored.run.generationTask.actions[0].triggerProposal.type, 'manual')
    assert.equal(JSON.stringify(stored).includes(dataDir), false)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio service lets dashboard update a drafted full-pet task before confirmation', async () => {
  const { createCreatorStudioServer } = require('../../examples/plugins/creator-studio/service/studio-service')
  const { normalizeGenerationTask } = require('../../examples/plugins/creator-studio/lib/generation-task')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-full-pet-task-edit-'))
  const dashboardPath = path.join(pluginRoot, 'web', 'dashboard', 'index.html')
  const server = createCreatorStudioServer({ dataDir, dashboardPath })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const postJson = (pathname, body = {}) => fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then((response) => response.json())

  try {
    const draft = await postJson('/api/tasks/draft', {
      prompt: '生成一只完整的新桌宠。',
      backend: 'fixture',
      generationTask: normalizeGenerationTask({
        mode: 'full-pet',
        targetPet: 'new',
        styleSource: 'textOnly',
        characterBrief: '一只软乎乎的橘猫桌宠。',
        actions: [
          {
            actionId: 'idle',
            name: 'Idle',
            motionPrompt: 'neutral idle pose',
            loop: true,
            frameCount: 12,
            triggerProposal: { type: 'state', binding: 'idle' }
          },
          {
            actionId: 'shy-spin',
            name: 'Shy Spin',
            motionPrompt: 'spin shyly after click',
            loop: false,
            frameCount: 16,
            triggerProposal: { type: 'click', binding: 'clickAction' }
          }
        ]
      })
    })

    const updated = await postJson(`/api/runs/${draft.run.runId}/task`, {
      characterBrief: '一只更圆润、软乎乎、奶油橘色的桌宠。',
      actions: [
        {
          actionId: 'idle',
          actionName: 'Lazy Idle',
          motionPrompt: 'slow breathing with tiny ear flicks',
          loop: true,
          triggerType: 'state'
        },
        {
          actionId: 'shy-spin',
          actionName: 'Shy Twirl',
          motionPrompt: 'curl up first, then twirl bashfully once',
          loop: false,
          triggerType: 'manual'
        }
      ]
    })

    assert.equal(updated.ok, true)
    assert.equal(updated.run.taskStatus, 'ready_for_confirmation')
    assert.equal(updated.run.generationTask.characterBrief, '一只更圆润、软乎乎、奶油橘色的桌宠。')
    assert.equal(updated.run.generationTask.actions[0].name, 'Lazy Idle')
    assert.equal(updated.run.generationTask.actions[0].motionPrompt, 'slow breathing with tiny ear flicks')
    assert.equal(updated.run.generationTask.actions[0].triggerProposal.type, 'state')
    assert.equal(updated.run.generationTask.actions[1].name, 'Shy Twirl')
    assert.equal(updated.run.generationTask.actions[1].motionPrompt, 'curl up first, then twirl bashfully once')
    assert.equal(updated.run.generationTask.actions[1].triggerProposal.type, 'manual')

    const stored = await fetch(`http://127.0.0.1:${port}/api/runs/${draft.run.runId}`).then((response) => response.json())
    assert.equal(stored.ok, true)
    assert.equal(stored.run.generationTask.characterBrief, '一只更圆润、软乎乎、奶油橘色的桌宠。')
    assert.equal(stored.run.generationTask.actions[1].name, 'Shy Twirl')
    assert.equal(JSON.stringify(stored).includes(dataDir), false)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio service exposes full-pet validation recovery guidance for dashboard clients', async () => {
  const { createCreatorStudioServer } = require('../../examples/plugins/creator-studio/service/studio-service')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-full-pet-validation-retry-'))
  const dashboardPath = path.join(pluginRoot, 'web', 'dashboard', 'index.html')
  const server = createCreatorStudioServer({ dataDir, dashboardPath })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const bridgeServer = require('node:http').createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      const payload = body ? JSON.parse(body) : {}
      response.writeHead(200, {
        'Content-Type': 'application/json',
        Connection: 'close'
      })
      if (request.url.endsWith('/creator/model-settings')) {
        response.end(JSON.stringify({
          ok: true,
          config: {
            provider: 'openai-compatible',
            baseUrl: 'http://127.0.0.1:7860/v1',
            model: 'local-custom-sprite-v2'
          }
        }))
        return
      }
      const dataRelativePath = `runs/${payload.output.dataRelativeDir.split('/')[1]}/frames/base/0001.png`
      const generatedPath = path.join(dataDir, dataRelativePath)
      fs.mkdirSync(path.dirname(generatedPath), { recursive: true })
      sharp({
        create: {
          width: 96,
          height: 112,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      })
        .png()
        .toFile(generatedPath)
        .then(() => {
          response.end(JSON.stringify({
            ok: true,
            result: {
              ok: true,
              backend: 'local',
              model: 'local-custom-sprite-v2',
              generatedAt: '2026-06-26T01:00:00.000Z',
              outputs: [{
                dataRelativePath,
                mimeType: 'image/png',
                sha256: 'invalid-visible-pixels-sha'
              }]
            }
          }))
        })
        .catch((error) => {
          response.end(JSON.stringify({ ok: false, error: error.message }))
        })
    })
  })
  await new Promise((resolve) => bridgeServer.listen(0, '127.0.0.1', resolve))
  const bridgePort = bridgeServer.address().port
  const previousBridgeUrl = process.env.OPENPET_BRIDGE_URL
  const previousBridgeToken = process.env.OPENPET_BRIDGE_TOKEN
  process.env.OPENPET_BRIDGE_URL = `http://127.0.0.1:${bridgePort}`
  process.env.OPENPET_BRIDGE_TOKEN = 'bridge-token'

  const postJsonResponse = async (pathname, body = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    return { response, body: await response.json() }
  }

  try {
    const draft = await postJsonResponse('/api/tasks/draft', {
      prompt: '帮我做一只软乎乎的橘猫桌宠，平时懒懒的，被点击会害羞转圈，偶尔会打哈欠。',
      backend: 'local'
    })
    const runId = draft.body.run.runId
    await postJsonResponse(`/api/runs/${runId}/confirm`)
    const failed = await postJsonResponse(`/api/runs/${runId}/generate-action`)

    assert.equal(failed.response.status, 500)
    assert.equal(failed.body.ok, false)
    assert.match(failed.body.error, /Generated image contains no visible pixels/)
    assert.equal(failed.body.run.generationTask.mode, 'full-pet')
    assert.equal(failed.body.run.recovery.canRetryGeneration, true)
    assert.equal(failed.body.run.recovery.actionLabel, 'Retry generation')
    assert.equal(failed.body.run.recovery.failureKind, 'validation')
    assert.equal(
      failed.body.run.recovery.guidance,
      'The generated source image was empty. Adjust the prompt or model settings, then retry generation on this same run.'
    )
    assert.equal(failed.body.run.recovery.qaFocus, 'Check source image validation expectations before retrying.')
  } finally {
    if (previousBridgeUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousBridgeUrl
    if (previousBridgeToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousBridgeToken
    bridgeServer.closeAllConnections?.()
    await new Promise((resolve) => bridgeServer.close(resolve))
    await new Promise((resolve) => server.close(resolve))
  }
})
