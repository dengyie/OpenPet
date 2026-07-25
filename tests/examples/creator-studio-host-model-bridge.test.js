const test = require('node:test')
const assert = require('node:assert/strict')

const {
  __testInternals,
  generateViaHostModelBridge
} = require('../../examples/plugins/creator-studio/lib/host-model-bridge')
const { buildCharacterAnchorPrompt } = require('../../examples/plugins/creator-studio/lib/anchor-prompt-builder')

test('host model bridge clamps provider stages to the remaining workflow budget', () => {
  assert.equal(__testInternals.resolveGenerationStageTimeout({
    requestedTimeoutMs: 600000,
    deadlineMs: 11000,
    nowMs: 10000
  }), 1000)
  assert.throws(() => __testInternals.resolveGenerationStageTimeout({
    requestedTimeoutMs: 600000,
    deadlineMs: 10000,
    nowMs: 10000
  }), /exceeded the full-pet workflow time budget/i)
})

test('host model bridge preserves the configured 120 second provider timeout', () => {
  assert.equal(__testInternals.resolveCreatorProviderTimeout(120000), 120000)
  assert.equal(__testInternals.resolveCreatorProviderTimeout(0), 120000)
})

test('host model bridge rejects the removed legacy full-pet entry point', async () => {
  await assert.rejects(() => generateViaHostModelBridge({
    backend: 'provider',
    dataDir: '/tmp/not-used',
    run: {
      runId: 'legacy-full-pet',
      generationTask: { mode: 'full-pet', pipeline: 'legacy-keyframe-v1' }
    }
  }), (error) => {
    assert.equal(error?.code, 'legacy_full_pet_pipeline_removed')
    assert.match(error?.message || '', /quality-first-v1/)
    return true
  })
})

test('host model bridge delegates transient retry policy to the Host without resending the request', async () => {
  const requests = []
  let failure = null
  try {
    await __testInternals.generateWithModelFallback({
      prompt: 'wave',
      requestedTimeoutMs: 300000,
      referenceImages: [{ role: 'canonical-reference' }],
      runId: 'run-transient-retry',
      dataRelativeDir: 'runs/run-transient-retry/keyframes/start',
      settings: { creatorWorkflowModelPolicy: { verifiedModels: ['gpt-image-2'], fallbackModels: [] } },
      preferredModel: 'gpt-image-2',
      callHostImageGenerateImpl: async (request) => {
        requests.push(request)
        throw new Error('Image Provider generation failed with HTTP 524')
      }
    })
  } catch (error) {
    failure = error
  }

  assert.match(String(failure?.message || ''), /HTTP 524/)
  assert.equal(requests.length, 1)
  assert.equal(Object.hasOwn(requests[0], 'model'), false)
  assert.equal(requests[0].expectedModel, 'gpt-image-2')
  assert.deepEqual(failure.modelAttempts.map((attempt) => ({ model: attempt.model, ok: attempt.ok })), [
    { model: 'gpt-image-2', ok: false }
  ])
})

test('host model bridge preserves structured Host model failure attempts', async () => {
  const hostFailure = new Error('Image Provider generation failed with HTTP 524')
  hostFailure.code = 'provider_http_error'
  hostFailure.modelAttempts = [{
    model: 'gpt-image-2',
    ok: false,
    errorCode: 'provider_http_error',
    httpStatus: 524,
    timeoutMs: 120000,
    durationMs: 119000,
    requestId: 'request-524'
  }, {
    model: 'gpt-image-1',
    ok: false,
    errorCode: 'provider_timeout',
    httpStatus: 0,
    timeoutMs: 45000,
    durationMs: 45000,
    requestId: 'request-timeout'
  }]

  await assert.rejects(() => __testInternals.generateWithModelFallback({
    prompt: 'keep identity',
    requestedTimeoutMs: 120000,
    referenceImages: [{ role: 'canonical-reference' }],
    settings: { creatorWorkflowModelPolicy: { verifiedModels: ['gpt-image-2'], fallbackModels: [] } },
    preferredModel: 'gpt-image-2',
    callHostImageGenerateImpl: async () => { throw hostFailure }
  }), (error) => {
    assert.equal(error.code, 'provider_http_error')
    assert.deepEqual(error.modelAttempts.map((attempt) => ({
      model: attempt.model,
      errorCode: attempt.errorCode,
      httpStatus: attempt.httpStatus,
      requestId: attempt.requestId
    })), [{
      model: 'gpt-image-2',
      errorCode: 'provider_http_error',
      httpStatus: 524,
      requestId: 'request-524'
    }, {
      model: 'gpt-image-1',
      errorCode: 'provider_timeout',
      httpStatus: 0,
      requestId: 'request-timeout'
    }])
    return true
  })
})

test('host model bridge sends model-matched prompt variants for Host fallback', async () => {
  const requests = []
  const result = await __testInternals.generateWithModelFallback({
    prompt: 'opaque primary prompt',
    promptCompiler: { modelCapabilityProfile: 'gpt-image-2-v1', backgroundStrategy: 'solid-background-then-local-removal' },
    constraints: { width: 1024, height: 1024, transparent: false },
    requestedTimeoutMs: 300000,
    referenceImages: [{ role: 'canonical-reference' }],
    runId: 'run-model-aware-fallback',
    dataRelativeDir: 'runs/run-model-aware-fallback/keyframes/start',
    settings: {
      creatorWorkflowModelPolicy: {
        verifiedModels: ['gpt-image-2', 'gpt-image-1.5'],
        fallbackModels: ['gpt-image-1.5']
      }
    },
    preferredModel: 'gpt-image-2',
    buildPromptForModel: (model) => buildCharacterAnchorPrompt({ model, appearanceIntent: ['small mint-colored character'] }),
    callHostImageGenerateImpl: async (request) => {
      requests.push(request)
      return {
        result: {
          model: 'gpt-image-1.5',
          modelAttempts: [
            { model: 'gpt-image-2', ok: false },
            { model: 'gpt-image-1.5', ok: true }
          ]
        }
      }
    }
  })

  assert.equal(requests.length, 1)
  assert.equal(requests[0].expectedModel, 'gpt-image-2')
  assert.equal(Object.hasOwn(requests[0], 'model'), false)
  assert.equal(requests[0].promptVariants.length, 2)
  assert.equal(requests[0].promptVariants[0].model, 'gpt-image-2')
  assert.equal(requests[0].promptVariants[0].promptCompiler.modelCapabilityProfile, 'gpt-image-2-v1')
  assert.equal(requests[0].promptVariants[0].constraints.transparent, false)
  assert.doesNotMatch(requests[0].promptVariants[0].prompt, /transparent/i)
  assert.equal(requests[0].promptVariants[1].model, 'gpt-image-1.5')
  assert.equal(requests[0].promptVariants[1].promptCompiler.modelCapabilityProfile, 'gpt-image-edit-transparent-v1')
  assert.equal(requests[0].promptVariants[1].constraints.transparent, true)
  assert.match(requests[0].promptVariants[1].prompt, /fully transparent/i)
  assert.equal(result.selectedModel, 'gpt-image-1.5')
})

test('host model bridge prefers provider-safe prompt text over legacy builder text', async () => {
  const requests = []
  await __testInternals.generateWithModelFallback({
    prompt: 'safe primary prompt',
    promptCompiler: { modelCapabilityProfile: 'gpt-image-2-v1' },
    constraints: { width: 1024, height: 1024, transparent: false },
    requestedTimeoutMs: 300000,
    referenceImages: [{ role: 'canonical-reference' }],
    settings: { creatorWorkflowModelPolicy: { verifiedModels: ['gpt-image-2'], fallbackModels: [] } },
    preferredModel: 'gpt-image-2',
    buildPromptForModel: () => ({
      prompt: 'Create an OpenPet asset with internal workflow language.',
      providerPrompt: 'Create one complete full-body character image.',
      promptCompiler: { width: 1024, height: 1024, backgroundStrategy: 'solid-background-then-local-removal', modelCapabilityProfile: 'gpt-image-2-v1' }
    }),
    callHostImageGenerateImpl: async (request) => {
      requests.push(request)
      return { result: { model: 'gpt-image-2' } }
    }
  })

  assert.equal(requests[0].prompt, 'Create one complete full-body character image.')
  assert.equal(requests[0].promptVariants[0].prompt, 'Create one complete full-body character image.')
  assert.doesNotMatch(requests[0].promptVariants[0].prompt, /OpenPet|workflow/i)
})

test('host model bridge does not resend non-transient provider failures', async () => {
  const requests = []
  await assert.rejects(() => __testInternals.generateWithModelFallback({
    prompt: 'wave',
    requestedTimeoutMs: 300000,
    referenceImages: [{ role: 'canonical-reference' }],
    settings: { creatorWorkflowModelPolicy: { verifiedModels: ['gpt-image-2'], fallbackModels: [] } },
    preferredModel: 'gpt-image-2',
    callHostImageGenerateImpl: async (request) => {
      requests.push(request)
      throw new Error('Image Provider generation failed with HTTP 400')
    }
  }), /HTTP 400/)
  assert.equal(requests.length, 1)
})
