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

test('creator studio example manifest declares hybrid creator workflow entries', () => {
  const manifest = normalizePluginManifest(
    JSON.parse(fs.readFileSync(path.join(pluginRoot, 'plugin.json'), 'utf-8')),
    { source: 'local', basePath: pluginRoot }
  )

  assert.equal(manifest.id, 'openpet.creator-studio')
  assert.equal(manifest.profile, 'hybrid')
  assert.deepEqual(manifest.permissions, ['pet-pack:import', 'pet:say', 'model:image-generate', 'assets:generate'])
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
  assert.deepEqual(schema.properties.find((field) => field.key === 'backend').enum, ['fixture', 'cloud', 'local'])
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
    backend: 'cloud',
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
    backend: 'local',
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
    backend: 'cloud',
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

test('creator studio backend runner records unavailable cloud backend without fixture fallback', async () => {
  const { createRun, readRun, readRunLogs } = require('../../examples/plugins/creator-studio/lib/run-store')
  const { runGenerationStep } = require('../../examples/plugins/creator-studio/lib/backend-runner')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-cloud-'))
  const run = createRun({
    dataDir,
    input: { petName: 'Cloud Cat', prompt: 'A cloud generated cat', backend: 'cloud' },
    now: () => '2026-06-19T00:00:00.000Z'
  })

  await assert.rejects(
    runGenerationStep({ dataDir, runId: run.runId }),
    /Cloud backend is not configured/
  )
  const failed = readRun({ dataDir, runId: run.runId })
  assert.equal(failed.status, 'failed')
  assert.equal(failed.currentStep, 'generate')
  assert.equal(failed.backendStatus.backend, 'cloud')
  assert.equal(failed.backendStatus.state, 'not_configured')
  assert.match(failed.error, /Cloud backend is not configured/)
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

test('creator studio run-step command fails unavailable local backend with persisted run state', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-local-command-'))

  const created = runCreatorCommand({
    command: 'create-run',
    dataDir,
    payload: { petName: 'Local Cat', prompt: 'A local generated cat', backend: 'local' },
    config: { backend: 'local' }
  })
  const generated = runCreatorCommand({
    command: 'run-step',
    dataDir,
    payload: { runId: created.json.run.runId },
    config: { backend: 'local' }
  })
  const run = JSON.parse(fs.readFileSync(path.join(dataDir, 'runs', created.json.run.runId, 'run.json'), 'utf-8'))

  assert.equal(created.status, 0)
  assert.equal(generated.status, 1)
  assert.equal(generated.json.ok, false)
  assert.match(generated.json.error, /Local backend is not configured/)
  assert.equal(run.status, 'failed')
  assert.equal(run.backendStatus.backend, 'local')
  assert.equal(run.backendStatus.state, 'not_configured')
})

test('creator studio run-step command uses host bridge for local backend generation when available', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-local-bridge-'))
  const requests = []
  const created = runCreatorCommand({
    command: 'create-run',
    dataDir,
    payload: { petName: 'Local Cat', prompt: '新增一个自定义动作：原地打滚，动作要循环，点击触发。', backend: 'local' },
    config: { backend: 'local' }
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
                backend: 'local',
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
      if (request.url.endsWith('/creator/model-health-check')) {
        response.end(JSON.stringify({
          ok: true,
          result: {
            ok: true,
            backend: 'local',
            code: 'endpoint_healthy',
            message: 'Local endpoint is reachable'
          }
        }))
        return
      }
      response.end(JSON.stringify({
        ok: true,
        config: {
          defaultBackend: 'local',
          cloud: {
            provider: 'openai',
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-image-1',
            apiKeyRef: 'secret:model.image.openai.apiKey',
            hasApiKey: false,
            apiKeyPreview: '',
            apiKeyLabel: 'Image API Key'
          },
          local: {
            endpoint: 'http://127.0.0.1:7860/generate',
            healthUrl: 'http://127.0.0.1:7860/health',
            model: 'local-pet-sprite',
            timeoutMs: 120000,
            maxConcurrentJobs: 1
          }
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
      config: { backend: 'local' },
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
    assert.equal(generated.json.run.backendStatus.backend, 'local')
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
    assert.equal(JSON.stringify(frameQa).includes(dataDir), false)
    assert.match(requests[0].payload.prompt, /OpenPet desktop pet sprite asset/)
    assert.match(requests[0].payload.prompt, /Canvas And Boundary Rules/)
    assert.match(requests[0].payload.prompt, /Action name: 原地打滚/)
    assert.match(requests[0].payload.prompt, /Loop policy: looping/)
    assert.notEqual(requests[0].payload.prompt, '新增一个自定义动作：原地打滚，动作要循环，点击触发。')
    assert.equal(requests[0].payload.prompt.includes('bridge-token'), false)
    assert.equal(run.artifacts.generatedImage.promptBuilder.version, 1)
    assert.equal(run.artifacts.generatedImage.promptBuilder.mode, 'single-action')
    assert.deepEqual(run.artifacts.generatedImage.promptBuilder.warnings, [])
    assert.deepEqual(requests.map((entry) => entry.url), ['/creator/model-image-generate'])
  } finally {
    bridgeServer.closeAllConnections?.()
    await new Promise((resolve) => bridgeServer.close(resolve))
  }
})

test('creator studio run-step command fails and persists run state when bridge image generation times out', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-cloud-timeout-'))
  const created = runCreatorCommand({
    command: 'create-run',
    dataDir,
    payload: {
      petName: 'Cloud Timeout Cat',
      prompt: '新增一个自定义动作：原地打滚，动作要循环，点击触发。',
      backend: 'cloud'
    },
    config: { backend: 'cloud' }
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
          error: 'Cloud image generation timed out after 120000ms'
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
      config: { backend: 'cloud' },
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
    assert.equal(run.backendStatus.backend, 'cloud')
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
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-cloud-business-error-'))
  const created = runCreatorCommand({
    command: 'create-run',
    dataDir,
    payload: {
      petName: 'Cloud Business Error Cat',
      prompt: '新增一个自定义动作：开心挥手，动作要循环，点击触发。',
      backend: 'cloud'
    },
    config: { backend: 'cloud' }
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
      config: { backend: 'cloud' },
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
    assert.equal(run.backendStatus.backend, 'cloud')
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
  fs.writeFileSync(path.join(qaDir, 'action-frame-validation.json'), `${JSON.stringify({ ok: true, actionId: 'shy-spin' }, null, 2)}\n`)
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

    assert.equal(imported.status, 0)
    assert.equal(imported.json.ok, true)
    assert.equal(imported.json.run.status, 'imported')
    assert.equal(imported.json.run.importedActionId, 'shy-spin')
    assert.equal(imported.json.triggerProposal.type, 'click')
    assert.equal(stored.importStatus, 'imported')
    assert.equal(requests[0].url, '/creator/assets/import-frames')
    assert.equal(requests[0].payload.dataRelativePath, 'runs/demo/frames/actions/shy-spin')
    assert.equal(requests[0].payload.actionId, 'shy-spin')
    assert.equal(requests[0].payload.label, '害羞转圈')
    assert.equal(JSON.stringify(requests[0].payload).includes(dataDir), false)
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

test('creator studio dashboard asset exists and service script is declared', () => {
  const dashboardPath = path.join(pluginRoot, 'web', 'dashboard', 'index.html')
  const servicePath = path.join(pluginRoot, 'service', 'studio-service.js')
  const html = fs.readFileSync(dashboardPath, 'utf-8')
  assert.equal(fs.existsSync(dashboardPath), true)
  assert.equal(fs.existsSync(servicePath), true)
  assert.match(html, /Creator Studio/)
  assert.match(html, /id="prompt-input"/)
  assert.match(html, /id="task-preview"/)
  assert.match(html, /id="trigger-panel"/)
  assert.match(html, /id="run-logs"/)
  assert.equal(html.includes('apiKey'), false)
  assert.equal(/\bsk-[A-Za-z0-9_-]+/.test(html), false)
})

test('creator studio service exposes run detail and logs for dashboard clients', async () => {
  const { appendRunLog, createRun } = require('../../examples/plugins/creator-studio/lib/run-store')
  const { createCreatorStudioServer } = require('../../examples/plugins/creator-studio/service/studio-service')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-studio-service-'))
  const dashboardPath = path.join(pluginRoot, 'web', 'dashboard', 'index.html')
  const run = createRun({
    dataDir,
    input: { petName: 'Service Cat', prompt: 'Visible in dashboard', backend: 'fixture' },
    now: () => '2026-06-19T00:00:00.000Z'
  })
  appendRunLog({
    dataDir,
    runId: run.runId,
    level: 'info',
    event: 'run.created',
    message: 'Run created',
    now: () => '2026-06-19T00:01:00.000Z'
  })
  const server = createCreatorStudioServer({ dataDir, dashboardPath })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const detail = await fetch(`http://127.0.0.1:${port}/api/runs/${run.runId}`).then((response) => response.json())
    const logs = await fetch(`http://127.0.0.1:${port}/api/runs/${run.runId}/logs`).then((response) => response.json())

    assert.equal(detail.ok, true)
    assert.equal(detail.run.runId, run.runId)
    assert.equal(logs.ok, true)
    assert.deepEqual(logs.logs.map((entry) => entry.event), ['run.created'])
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
    const answered = await postJson(`/api/runs/${draft.run.runId}/questions/trigger/answer`, {
      answer: 'click'
    })
    const confirmed = await postJson(`/api/runs/${draft.run.runId}/confirm`)
    const generated = await postJson(`/api/runs/${draft.run.runId}/generate-action`)

    assert.equal(draft.ok, true)
    assert.equal(draft.run.taskStatus, 'needs_input')
    assert.equal(draft.run.generationTask.questions[0].id, 'trigger')
    assert.equal(answered.ok, true)
    assert.equal(answered.run.taskStatus, 'ready_for_confirmation')
    assert.equal(answered.run.generationTask.questions.length, 0)
    assert.equal(confirmed.ok, true)
    assert.equal(confirmed.run.taskStatus, 'confirmed')
    assert.equal(generated.ok, true)
    assert.equal(generated.run.status, 'ready_for_review')
    assert.equal(generated.run.artifacts.actionTaskQa.endsWith('action-generation-task.json'), true)
    assert.equal(fs.existsSync(generated.run.artifacts.actionTaskQa), true)
  } finally {
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
