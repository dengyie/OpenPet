const test = require('node:test')
const assert = require('node:assert/strict')

const { createActionService } = require('../../src/main/services/action-service')

test('action service returns legacy animation config as runtime actions', () => {
  const service = createActionService({
    projectRoot: '/app/openpet',
    loadLegacyAnimations: () => ({
      defaultAction: 'idle',
      clickAction: 'eat',
      actions: [
        { id: 'idle', label: '待机', loop: true, frameCount: 16, frameMs: 95, frameWidth: 191, frameHeight: 453, sprite: 'sprites/idle.png' },
        { id: 'eat', label: '喂食', loop: false, frameCount: 16, frameMs: 85, frameWidth: 381, frameHeight: 253, sprite: 'sprites/eat.png' }
      ]
    })
  })

  assert.deepEqual(service.getConfig(), {
    defaultAction: 'idle',
    clickAction: 'eat',
    triggerProposalInbox: [],
    triggerRules: [],
    actions: [
      {
        id: 'idle',
        label: '待机',
        kind: 'idle',
        loop: true,
        frameCount: 16,
        frameMs: 95,
        frameWidth: 191,
        frameHeight: 453,
        sprite: 'file:///app/openpet/sprites/idle.png'
      },
      {
        id: 'eat',
        label: '喂食',
        kind: 'click',
        loop: false,
        frameCount: 16,
        frameMs: 85,
        frameWidth: 381,
        frameHeight: 253,
        sprite: 'file:///app/openpet/sprites/eat.png'
      }
    ]
  })
  assert.deepEqual(service.listActions().map((action) => action.id), ['idle', 'eat'])
  assert.equal(service.getAction('eat').label, '喂食')
})

test('action service can expose the normalized pet pack while preserving animation config shape', () => {
  const service = createActionService({
    projectRoot: '/app/openpet',
    loadPetPack: () => ({
      rootPath: '/packs/cat',
      manifest: {
        id: 'cat',
        displayName: 'Cat',
        defaultAction: 'idle',
        clickAction: 'eat',
        actions: [
          { id: 'idle', sprite: 'sprites/idle.png' },
          { id: 'eat', sprite: 'sprites/eat.png' }
        ]
      }
    })
  })

  assert.equal(service.getPetPack().manifest.id, 'cat')
  assert.deepEqual(service.getConfig(), {
    defaultAction: 'idle',
    clickAction: 'eat',
    triggerProposalInbox: [],
    triggerRules: [],
    actions: [
      { id: 'idle', sprite: 'file:///packs/cat/sprites/idle.png' },
      { id: 'eat', sprite: 'file:///packs/cat/sprites/eat.png' }
    ]
  })
})

test('action service resolves active pet pack sprites for the desktop renderer', () => {
  const service = createActionService({
    projectRoot: '/app/openpet',
    loadPetPack: () => ({
      rootPath: '/app/openpet/assets/pet-packs/duodong',
      manifest: {
        id: 'duodong',
        displayName: '多栋',
        defaultAction: 'idle',
        clickAction: 'waving',
        actions: [
          {
            id: 'idle',
            label: 'Idle',
            sprite: 'spritesheet.webp',
            frameWidth: 192,
            frameHeight: 208,
            atlas: { columns: 8, rows: 9 }
          }
        ]
      }
    })
  })

  assert.equal(
    service.getConfig().actions[0].sprite,
    'file:///app/openpet/assets/pet-packs/duodong/spritesheet.webp'
  )
})

test('action service can expose preview-safe file urls for sprites', () => {
  const service = createActionService({
    projectRoot: '/app/openpet',
    loadLegacyAnimations: () => ({
      defaultAction: 'idle',
      clickAction: 'idle',
      actions: [
        { id: 'idle', label: '待机', frameCount: 16, frameMs: 95, frameWidth: 191, frameHeight: 453, sprite: 'cat_anime/sprites/idle.png' }
      ]
    })
  })

  assert.deepEqual(service.getPreviewConfig().actions.map((action) => ({
    id: action.id,
    sprite: action.sprite,
    previewSprite: action.previewSprite
  })), [
    {
      id: 'idle',
      sprite: 'file:///app/openpet/cat_anime/sprites/idle.png',
      previewSprite: 'file:///app/openpet/cat_anime/sprites/idle.png'
    }
  ])
})

test('action service validates and applies bounded creator action mutations for legacy actions', () => {
  let savedConfig = null
  const service = createActionService({
    projectRoot: '/app/openpet',
    loadLegacyAnimations: () => ({
      defaultAction: 'idle',
      clickAction: 'wave',
      actions: [
        {
          id: 'idle',
          label: 'Idle',
          kind: 'idle',
          loop: true,
          frameCount: 16,
          frameMs: 95,
          frameWidth: 191,
          frameHeight: 453,
          sprite: 'cat_anime/sprites/idle.png'
        },
        {
          id: 'wave',
          label: 'Wave',
          kind: 'greeting',
          loop: false,
          frameCount: 12,
          frameMs: 90,
          frameWidth: 191,
          frameHeight: 453,
          sprite: 'cat_anime/sprites/wave.png'
        }
      ]
    }),
    saveLegacyAnimations: (config) => {
      savedConfig = config
      return config
    }
  })

  const validation = service.validateCreatorActionMutation({
    defaultAction: 'idle',
    clickAction: 'wave',
    actions: [
      {
        id: 'wave',
        label: 'Wave Hello',
        kind: 'greeting',
        loop: false,
        frameCount: 12,
        frameMs: 90,
        frameWidth: 191,
        frameHeight: 453,
        sprite: 'cat_anime/sprites/wave.png'
      }
    ]
  })

  assert.equal(validation.ok, true)
  assert.deepEqual(validation.errors, [])

  const applied = service.applyCreatorActionMutation({
    defaultAction: 'idle',
    clickAction: 'wave',
    actions: [
      {
        id: 'wave',
        label: 'Wave Hello',
        kind: 'greeting',
        loop: false,
        frameCount: 12,
        frameMs: 90,
        frameWidth: 191,
        frameHeight: 453,
        sprite: 'cat_anime/sprites/wave.png'
      }
    ]
  })

  assert.equal(savedConfig.clickAction, 'wave')
  assert.equal(savedConfig.actions.find((action) => action.id === 'wave').label, 'Wave Hello')
  assert.equal(applied.actions.find((action) => action.id === 'wave').label, 'Wave Hello')
})

test('action service rejects invalid creator action mutations before apply', () => {
  const service = createActionService({
    projectRoot: '/app/openpet',
    loadLegacyAnimations: () => ({
      defaultAction: 'idle',
      clickAction: 'idle',
      actions: [
        {
          id: 'idle',
          label: 'Idle',
          kind: 'idle',
          loop: true,
          frameCount: 16,
          frameMs: 95,
          frameWidth: 191,
          frameHeight: 453,
          sprite: 'cat_anime/sprites/idle.png'
        }
      ]
    }),
    saveLegacyAnimations: () => {
      throw new Error('should not save invalid config')
    }
  })

  const validation = service.validateCreatorActionMutation({
    defaultAction: 'missing',
    actions: [
      {
        id: 'bad/id',
        label: 'Bad',
        frameCount: 0,
        frameMs: 5,
        frameWidth: 0,
        frameHeight: 0,
        sprite: '../outside.png'
      }
    ]
  })

  assert.equal(validation.ok, false)
  assert.match(validation.errors.join('\n'), /defaultAction/)
  assert.match(validation.errors.join('\n'), /safe id/)
  assert.match(validation.errors.join('\n'), /frameMs must be an integer between 16 and 5000/)
  assert.throws(
    () => service.applyCreatorActionMutation({
      defaultAction: 'missing',
      actions: [{ id: 'bad/id', sprite: '../outside.png', frameCount: 0, frameMs: 5, frameWidth: 0, frameHeight: 0 }]
    }),
    /Creator action mutation is invalid/
  )
})

test('action service rejects creator frameMs outside the pet-pack timing bounds', () => {
  const service = createActionService({
    projectRoot: '/app/openpet',
    loadLegacyAnimations: () => ({
      defaultAction: 'idle',
      clickAction: 'idle',
      actions: [
        {
          id: 'idle',
          label: 'Idle',
          kind: 'idle',
          loop: true,
          frameCount: 16,
          frameMs: 95,
          frameWidth: 191,
          frameHeight: 453,
          sprite: 'cat_anime/sprites/idle.png'
        }
      ]
    }),
    saveLegacyAnimations: () => {
      throw new Error('should not save out-of-range frameMs')
    }
  })

  const tooSlow = service.validateCreatorActionMutation({
    defaultAction: 'idle',
    actions: [
      {
        id: 'idle',
        label: 'Idle',
        kind: 'idle',
        loop: true,
        frameCount: 16,
        frameMs: 6000,
        frameWidth: 191,
        frameHeight: 453,
        sprite: 'cat_anime/sprites/idle.png'
      }
    ]
  })
  assert.equal(tooSlow.ok, false)
  assert.match(tooSlow.errors.join('\n'), /frameMs must be an integer between 16 and 5000/)

  const tooFast = service.validateCreatorActionMutation({
    defaultAction: 'idle',
    actions: [
      {
        id: 'idle',
        label: 'Idle',
        kind: 'idle',
        loop: true,
        frameCount: 16,
        frameMs: 1,
        frameWidth: 191,
        frameHeight: 453,
        sprite: 'cat_anime/sprites/idle.png'
      }
    ]
  })
  assert.equal(tooFast.ok, false)
  assert.match(tooFast.errors.join('\n'), /frameMs must be an integer between 16 and 5000/)
})

test('action service rejects duplicate creator action ids in a mutation payload', () => {
  const service = createActionService({
    projectRoot: '/app/openpet',
    loadLegacyAnimations: () => ({
      defaultAction: 'idle',
      clickAction: 'idle',
      actions: [
        {
          id: 'idle',
          label: 'Idle',
          kind: 'idle',
          loop: true,
          frameCount: 16,
          frameMs: 95,
          frameWidth: 191,
          frameHeight: 453,
          sprite: 'cat_anime/sprites/idle.png'
        }
      ]
    })
  })

  const validation = service.validateCreatorActionMutation({
    actions: [
      {
        id: 'wave',
        label: 'Wave A',
        kind: 'greeting',
        loop: false,
        frameCount: 12,
        frameMs: 90,
        frameWidth: 191,
        frameHeight: 453,
        sprite: 'cat_anime/sprites/wave.png'
      },
      {
        id: 'wave',
        label: 'Wave B',
        kind: 'greeting',
        loop: false,
        frameCount: 12,
        frameMs: 90,
        frameWidth: 191,
        frameHeight: 453,
        sprite: 'cat_anime/sprites/wave.png'
      }
    ]
  })

  assert.equal(validation.ok, false)
  assert.match(validation.errors.join('\n'), /duplicated in mutation/)
})

test('action service applies creator action mutations through pet pack persistence when available', () => {
  let savedManifest = null
  const petPackService = {
    getActivePetPack: () => ({
      rootPath: '/packs/community-weather-cat',
      source: { type: 'user-installed', path: '/packs/community-weather-cat' },
      manifest: {
        id: 'community-weather-cat',
        displayName: 'Community Weather Cat',
        version: '1.0.0',
        defaultAction: 'idle',
        clickAction: 'wave',
        actions: [
          {
            id: 'idle',
            label: 'Idle',
            kind: 'idle',
            loop: true,
            frameCount: 16,
            frameMs: 95,
            frameWidth: 191,
            frameHeight: 453,
            sprite: 'sprites/idle.png'
          },
          {
            id: 'wave',
            label: 'Wave',
            kind: 'greeting',
            loop: false,
            frameCount: 12,
            frameMs: 90,
            frameWidth: 191,
            frameHeight: 453,
            sprite: 'sprites/wave.png'
          }
        ]
      }
    }),
    updateActivePetPackManifest: (manifest) => {
      savedManifest = manifest
      return manifest
    }
  }
  const service = createActionService({ petPackService, projectRoot: '/app/openpet' })

  service.applyCreatorActionMutation({
    defaultAction: 'idle',
    clickAction: 'wave',
    actions: [
      {
        id: 'wave',
        label: 'Wave Updated',
        kind: 'greeting',
        loop: false,
        frameCount: 12,
        frameMs: 90,
        frameWidth: 191,
        frameHeight: 453,
        sprite: 'sprites/wave.png'
      }
    ]
  })

  assert.equal(savedManifest.defaultAction, 'idle')
  assert.equal(savedManifest.clickAction, 'wave')
  assert.equal(savedManifest.actions.find((action) => action.id === 'wave').label, 'Wave Updated')
  assert.equal(savedManifest.actions.find((action) => action.id === 'wave').sprite, 'sprites/wave.png')
})

test('action service prefers active installed pack persistence over legacy save hook', () => {
  let savedManifest = null
  let legacySaveCalls = 0
  const petPackService = {
    getActivePetPack: () => ({
      rootPath: '/packs/installed-cat',
      source: { type: 'user-installed', path: '/packs/installed-cat' },
      manifest: {
        id: 'installed-cat',
        displayName: 'Installed Cat',
        version: '1.0.0',
        defaultAction: 'idle',
        clickAction: 'wave',
        actions: [
          { id: 'idle', label: 'Idle', kind: 'idle', loop: true, frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32, sprite: 'sprites/idle.png' },
          { id: 'wave', label: 'Wave', kind: 'greeting', loop: false, frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32, sprite: 'sprites/wave.png' }
        ]
      }
    }),
    updateActivePetPackManifest: (manifest) => {
      savedManifest = manifest
      return manifest
    }
  }
  const service = createActionService({
    petPackService,
    projectRoot: '/app/openpet',
    saveLegacyAnimations: () => {
      legacySaveCalls += 1
    }
  })

  service.applyCreatorActionMutation({
    defaultAction: 'wave',
    clickAction: 'idle',
    actions: []
  })

  assert.equal(legacySaveCalls, 0)
  assert.equal(savedManifest.defaultAction, 'wave')
  assert.equal(savedManifest.clickAction, 'idle')
})

test('action service rejects installed pack mutations when pack persistence is unavailable', () => {
  let legacySaveCalls = 0
  const service = createActionService({
    petPackService: {
      getActivePetPack: () => ({
        rootPath: '/packs/installed-cat',
        source: { type: 'user-installed', path: '/packs/installed-cat' },
        manifest: {
          id: 'installed-cat',
          displayName: 'Installed Cat',
          version: '1.0.0',
          defaultAction: 'idle',
          clickAction: 'wave',
          actions: [
            { id: 'idle', label: 'Idle', kind: 'idle', loop: true, frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32, sprite: 'sprites/idle.png' },
            { id: 'wave', label: 'Wave', kind: 'greeting', loop: false, frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32, sprite: 'sprites/wave.png' }
          ]
        }
      })
    },
    projectRoot: '/app/openpet',
    saveLegacyAnimations: () => {
      legacySaveCalls += 1
    }
  })

  assert.throws(
    () => service.applyCreatorActionMutation({ defaultAction: 'wave', clickAction: 'idle', actions: [] }),
    /persistence is not available/
  )
  assert.equal(legacySaveCalls, 0)
})

test('action service rejects action mutations for non-legacy built-in packs instead of writing legacy config', () => {
  let legacySaveCalls = 0
  const service = createActionService({
    petPackService: {
      getActivePetPack: () => ({
        rootPath: '/app/openpet/assets/pet-packs/starter',
        source: { type: 'built-in', path: '/app/openpet/assets/pet-packs/starter' },
        manifest: {
          id: 'starter',
          displayName: 'Starter',
          version: '1.0.0',
          defaultAction: 'idle',
          clickAction: 'wave',
          actions: [
            { id: 'idle', label: 'Idle', kind: 'idle', loop: true, frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32, sprite: 'sprites/idle.png' },
            { id: 'wave', label: 'Wave', kind: 'greeting', loop: false, frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32, sprite: 'sprites/wave.png' }
          ]
        }
      }),
      updateActivePetPackManifest: () => {
        throw new Error('should not write bundled pack')
      }
    },
    projectRoot: '/app/openpet',
    saveLegacyAnimations: () => {
      legacySaveCalls += 1
    }
  })

  assert.throws(
    () => service.applyCreatorActionMutation({ defaultAction: 'wave', clickAction: 'idle', actions: [] }),
    /read-only/
  )
  assert.equal(legacySaveCalls, 0)
})

test('action service accepts click trigger proposals by applying clickAction', () => {
  let savedConfig = null
  const service = createActionService({
    projectRoot: '/app/openpet',
    now: () => '2026-06-22T10:00:00.000Z',
    loadLegacyAnimations: () => savedConfig || ({
      defaultAction: 'idle',
      clickAction: 'idle',
      actions: [
        {
          id: 'idle',
          label: 'Idle',
          kind: 'idle',
          loop: true,
          frameCount: 16,
          frameMs: 95,
          frameWidth: 191,
          frameHeight: 453,
          sprite: 'cat_anime/sprites/idle.png'
        },
        {
          id: 'wave',
          label: 'Wave',
          kind: 'custom',
          loop: false,
          frameCount: 8,
          frameMs: 90,
          frameWidth: 192,
          frameHeight: 208,
          sprite: 'cat_anime/sprites/wave.png'
        }
      ]
    }),
    saveLegacyAnimations: (config) => {
      savedConfig = config
      return config
    }
  })

  const result = service.acceptTriggerProposal({
    actionId: 'wave',
    type: 'click',
    binding: 'clickAction',
    sourcePluginId: 'openpet.creator-studio',
    sourceRunId: 'run-1',
    sourceCommandId: 'import-approved-action'
  })

  assert.deepEqual(result, {
    ok: true,
    applied: true,
    actionId: 'wave',
    type: 'click',
    binding: 'clickAction',
    code: 'applied',
    message: 'Click trigger now uses action: wave',
    acceptedAt: '2026-06-22T10:00:00.000Z',
    sourcePluginId: 'openpet.creator-studio',
    sourceRunId: 'run-1',
    sourceCommandId: 'import-approved-action'
  })
  assert.equal(savedConfig.clickAction, 'wave')
  assert.equal(service.getConfig().clickAction, 'wave')
})

test('action service accepts review-only trigger proposals and creates host trigger rules', () => {
  let savedConfig = null
  const service = createActionService({
    projectRoot: '/app/openpet',
    now: () => '2026-06-22T10:01:00.000Z',
    loadLegacyAnimations: () => ({
      defaultAction: 'idle',
      clickAction: 'idle',
      actions: [
        {
          id: 'idle',
          label: 'Idle',
          kind: 'idle',
          loop: true,
          frameCount: 16,
          frameMs: 95,
          frameWidth: 191,
          frameHeight: 453,
          sprite: 'cat_anime/sprites/idle.png'
        },
        {
          id: 'wave',
          label: 'Wave',
          kind: 'custom',
          loop: false,
          frameCount: 8,
          frameMs: 90,
          frameWidth: 192,
          frameHeight: 208,
          sprite: 'cat_anime/sprites/wave.png'
        }
      ]
    }),
    saveLegacyAnimations: (config) => {
      savedConfig = config
      return config
    }
  })

  const manual = service.acceptTriggerProposal({ actionId: 'wave', type: 'manual' })
  const state = service.acceptTriggerProposal({
    actionId: 'wave',
    type: 'state',
    sourcePluginId: { id: 'object-source' },
    sourceRunId: 'x'.repeat(200)
  })

  assert.equal(manual.applied, false)
  assert.equal(manual.code, 'no_binding_required')
  assert.equal(state.applied, false)
  assert.equal(state.code, 'rule_created')
  assert.equal(state.triggerRule.actionId, 'wave')
  assert.equal(state.triggerRule.type, 'state')
  assert.equal(state.triggerRule.status, 'active')
  assert.equal(state.triggerRule.sourcePluginId, '')
  assert.equal(state.triggerRule.sourceRunId.length, 160)
  assert.equal(state.triggerRuleId, 'rule:state:wave:20260622T100100000Z')
  assert.match(state.preview, /State trigger rule can play wave/)
  assert.equal(state.sourcePluginId, '')
  assert.equal(state.sourceRunId.length, 160)
  assert.equal(savedConfig.triggerRules.length, 1)
  assert.equal(service.getConfig().clickAction, 'idle')
  assert.equal(service.getConfig().triggerRules[0].id, state.triggerRuleId)
})

test('action service previews non-click trigger proposals without persisting rules', () => {
  let savedConfig = null
  const service = createActionService({
    projectRoot: '/app/openpet',
    loadLegacyAnimations: () => ({
      defaultAction: 'idle',
      clickAction: 'idle',
      actions: [
        { id: 'idle', label: 'Idle', kind: 'idle', loop: true, frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32, sprite: 'cat_anime/sprites/idle.png' },
        { id: 'wave', label: 'Wave', kind: 'greeting', loop: false, frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32, sprite: 'cat_anime/sprites/wave.png' }
      ]
    }),
    saveLegacyAnimations: (config) => {
      savedConfig = config
      return config
    },
    now: () => '2026-06-22T10:02:00.000Z'
  })

  const preview = service.previewTriggerProposal({
    actionId: 'wave',
    type: 'state',
    notes: 'Play when the pet looks idle.'
  })

  assert.equal(preview.ok, true)
  assert.equal(preview.applied, false)
  assert.equal(preview.actionId, 'wave')
  assert.equal(preview.type, 'state')
  assert.equal(preview.code, 'will_create_rule')
  assert.equal(preview.triggerRuleId, 'preview:state:wave')
  assert.equal(preview.triggerRule.id, 'preview:state:wave')
  assert.equal(preview.message, 'Preview: a host trigger rule would be created for action: wave')
  assert.match(preview.preview, /State trigger rule can play wave/)
  assert.equal(savedConfig, null)
  assert.equal(service.getConfig().triggerRules.length, 0)
  assert.throws(
    () => service.previewTriggerProposal({ actionId: 'wave', type: 'click', binding: 'defaultAction' }),
    /Unsupported click trigger binding/
  )
})

test('action service persists trigger proposals through inbox submit and accept', () => {
  let savedConfig = null
  const service = createActionService({
    projectRoot: '/app/openpet',
    now: () => '2026-06-22T10:02:00.000Z',
    loadLegacyAnimations: () => savedConfig || ({
      defaultAction: 'idle',
      clickAction: 'idle',
      actions: [
        {
          id: 'idle',
          label: 'Idle',
          kind: 'idle',
          loop: true,
          frameCount: 16,
          frameMs: 95,
          frameWidth: 191,
          frameHeight: 453,
          sprite: 'cat_anime/sprites/idle.png'
        },
        {
          id: 'wave',
          label: 'Wave',
          kind: 'custom',
          loop: false,
          frameCount: 8,
          frameMs: 90,
          frameWidth: 192,
          frameHeight: 208,
          sprite: 'cat_anime/sprites/wave.png'
        }
      ]
    }),
    saveLegacyAnimations: (config) => {
      savedConfig = config
      return config
    }
  })

  const submitted = service.submitTriggerProposal({
    actionId: 'wave',
    type: 'click',
    sourcePluginId: 'openpet.creator-studio',
    sourceRunId: 'run-42',
    sourceCommandId: 'import-approved-action',
    message: 'User asked for click trigger.'
  })

  assert.equal(submitted.proposal.status, 'pending')
  assert.equal(submitted.proposal.binding, 'clickAction')
  assert.equal(submitted.proposal.message, 'User asked for click trigger.')
  assert.equal(savedConfig.triggerProposalInbox.length, 1)

  const accepted = service.acceptTriggerProposalItem(submitted.proposal.id)

  assert.equal(accepted.triggerProposal.applied, true)
  assert.equal(accepted.triggerProposal.code, 'applied')
  assert.equal(accepted.proposal.status, 'applied')
  assert.equal(accepted.proposal.resultCode, 'applied')
  assert.equal(accepted.proposal.resultMessage, 'Click trigger now uses action: wave')
  assert.equal(savedConfig.clickAction, 'wave')
  assert.equal(savedConfig.triggerProposalInbox[0].status, 'applied')
  assert.equal(service.getConfig().triggerProposalInbox[0].status, 'applied')
})

test('action service stores preview text on submitted non-click trigger proposals', () => {
  const service = createActionService({
    projectRoot: '/app/openpet',
    loadLegacyAnimations: () => ({
      defaultAction: 'idle',
      clickAction: 'idle',
      actions: [
        { id: 'idle', label: 'Idle', kind: 'idle', loop: true, frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32, sprite: 'cat_anime/sprites/idle.png' },
        { id: 'wave', label: 'Wave', kind: 'greeting', loop: false, frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32, sprite: 'cat_anime/sprites/wave.png' }
      ]
    }),
    saveLegacyAnimations: (config) => config,
    now: () => '2026-06-22T10:02:30.000Z'
  })

  const submitted = service.submitTriggerProposal({
    actionId: 'wave',
    type: 'state',
    message: 'Play when the pet looks idle.',
    ruleSpec: {
      summary: 'Play when idle. API key sk-test-secret should not persist.',
      state: {
        predicate: 'pet.idle && cursor.nearby',
        source: 'creator-studio'
      }
    }
  })

  assert.equal(submitted.proposal.preview, 'State trigger rule can play wave when a host state condition matches.')
  assert.deepEqual(submitted.proposal.ruleSpec, {
    schemaVersion: 1,
    type: 'state',
    summary: 'Play when idle. API key [redacted-secret] should not persist.',
    state: {
      predicate: 'pet.idle && cursor.nearby',
      source: 'creator-studio'
    }
  })
  assert.equal(service.getConfig().triggerProposalInbox[0].preview, submitted.proposal.preview)
  assert.deepEqual(service.getConfig().triggerProposalInbox[0].ruleSpec, submitted.proposal.ruleSpec)
})

test('action service carries structured trigger rule specs from inbox proposal to accepted host rule', () => {
  let savedConfig = null
  const service = createActionService({
    projectRoot: '/app/openpet',
    now: () => '2026-06-22T10:02:45.000Z',
    loadLegacyAnimations: () => savedConfig || ({
      defaultAction: 'idle',
      clickAction: 'idle',
      actions: [
        { id: 'idle', label: 'Idle', kind: 'idle', loop: true, frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32, sprite: 'cat_anime/sprites/idle.png' },
        { id: 'wave', label: 'Wave', kind: 'greeting', loop: false, frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32, sprite: 'cat_anime/sprites/wave.png' }
      ]
    }),
    saveLegacyAnimations: (config) => {
      savedConfig = config
      return config
    }
  })

  const submitted = service.submitTriggerProposal({
    id: 'proposal:event:wave:structured',
    actionId: 'wave',
    type: 'event',
    ruleSpec: {
      summary: 'Play when weather plugin emits sunny status.',
      event: {
        name: 'weather.sunny',
        source: 'plugin:weather'
      }
    }
  })
  const accepted = service.acceptTriggerProposalItem(submitted.proposal.id)

  assert.deepEqual(accepted.triggerProposal.triggerRule.ruleSpec, {
    schemaVersion: 1,
    type: 'event',
    summary: 'Play when weather plugin emits sunny status.',
    event: {
      name: 'weather.sunny',
      source: 'plugin:weather'
    }
  })
  assert.deepEqual(savedConfig.triggerRules[0].ruleSpec, accepted.triggerProposal.triggerRule.ruleSpec)
  assert.deepEqual(service.getConfig().triggerRules[0].ruleSpec, accepted.triggerProposal.triggerRule.ruleSpec)
})

test('action service persists host trigger rules and rejected inbox proposals', () => {
  let savedConfig = null
  const service = createActionService({
    projectRoot: '/app/openpet',
    now: () => '2026-06-22T10:03:00.000Z',
    loadLegacyAnimations: () => savedConfig || ({
      defaultAction: 'idle',
      clickAction: 'idle',
      actions: [
        {
          id: 'idle',
          label: 'Idle',
          kind: 'idle',
          loop: true,
          frameCount: 16,
          frameMs: 95,
          frameWidth: 191,
          frameHeight: 453,
          sprite: 'cat_anime/sprites/idle.png'
        },
        {
          id: 'wave',
          label: 'Wave',
          kind: 'custom',
          loop: false,
          frameCount: 8,
          frameMs: 90,
          frameWidth: 192,
          frameHeight: 208,
          sprite: 'cat_anime/sprites/wave.png'
        }
      ]
    }),
    saveLegacyAnimations: (config) => {
      savedConfig = config
      return config
    }
  })

  const stateProposal = service.submitTriggerProposal({
    id: 'proposal:state:wave:test',
    actionId: 'wave',
    type: 'state',
    sourcePluginId: 'openpet.creator-studio'
  })
  const randomProposal = service.submitTriggerProposal({
    id: 'proposal:random:wave:test',
    actionId: 'wave',
    type: 'random'
  })

  const accepted = service.acceptTriggerProposalItem(stateProposal.proposal.id)
  const rejected = service.rejectTriggerProposalItem(randomProposal.proposal.id, 'Not for this pet.')

  assert.equal(accepted.triggerProposal.applied, false)
  assert.equal(accepted.triggerProposal.code, 'rule_created')
  assert.equal(accepted.proposal.status, 'accepted')
  assert.equal(accepted.proposal.triggerRuleId, 'rule:state:wave:20260622T100300000Z')
  assert.equal(accepted.triggerProposal.triggerRule.actionId, 'wave')
  assert.equal(accepted.triggerProposal.triggerRule.type, 'state')
  assert.equal(accepted.triggerProposal.triggerRule.sourceProposalId, 'proposal:state:wave:test')
  assert.equal(rejected.proposal.status, 'rejected')
  assert.equal(rejected.proposal.rejectionReason, 'Not for this pet.')
  assert.equal(savedConfig.clickAction, 'idle')
  assert.equal(savedConfig.triggerRules.length, 1)
  assert.equal(savedConfig.triggerRules[0].id, accepted.proposal.triggerRuleId)
  assert.deepEqual(
    savedConfig.triggerProposalInbox.map((proposal) => proposal.status),
    ['accepted', 'rejected']
  )
})

test('action service can disable, re-enable, and delete host trigger rules', () => {
  let savedConfig = {
    defaultAction: 'idle',
    clickAction: 'idle',
    actions: [
      {
        id: 'idle',
        label: 'Idle',
        kind: 'idle',
        loop: true,
        frameCount: 16,
        frameMs: 95,
        frameWidth: 191,
        frameHeight: 453,
        sprite: 'cat_anime/sprites/idle.png'
      },
      {
        id: 'wave',
        label: 'Wave',
        kind: 'custom',
        loop: false,
        frameCount: 8,
        frameMs: 90,
        frameWidth: 192,
        frameHeight: 208,
        sprite: 'cat_anime/sprites/wave.png'
      }
    ],
    triggerProposalInbox: [],
    triggerRules: [
      {
        id: 'rule:state:wave:test',
        actionId: 'wave',
        type: 'state',
        status: 'active',
        sourceProposalId: 'proposal:state:wave:test',
        sourcePluginId: 'openpet.creator-studio',
        sourceRunId: 'run-99',
        sourceCommandId: 'import-approved-action',
        message: 'Play wave when the pet becomes alert.',
        preview: 'State trigger rule can play wave when a host state condition matches.',
        createdAt: '2026-06-22T10:04:00.000Z',
        updatedAt: '2026-06-22T10:04:00.000Z'
      }
    ]
  }

  const timestamps = [
    '2026-06-22T10:05:00.000Z',
    '2026-06-22T10:06:00.000Z'
  ]
  const service = createActionService({
    projectRoot: '/app/openpet',
    now: () => timestamps.shift() || '2026-06-22T10:07:00.000Z',
    loadLegacyAnimations: () => savedConfig,
    saveLegacyAnimations: (config) => {
      savedConfig = config
      return config
    }
  })

  const disabled = service.setTriggerRuleStatus('rule:state:wave:test', 'disabled')
  assert.equal(disabled.rule.id, 'rule:state:wave:test')
  assert.equal(disabled.rule.status, 'disabled')
  assert.equal(disabled.animations.triggerRules[0].status, 'disabled')
  assert.equal(savedConfig.triggerRules[0].updatedAt, '2026-06-22T10:05:00.000Z')

  const active = service.setTriggerRuleStatus('rule:state:wave:test', 'active')
  assert.equal(active.rule.status, 'active')
  assert.equal(savedConfig.triggerRules[0].status, 'active')
  assert.equal(savedConfig.triggerRules[0].updatedAt, '2026-06-22T10:06:00.000Z')

  const deleted = service.deleteTriggerRule('rule:state:wave:test')
  assert.equal(deleted.rule.id, 'rule:state:wave:test')
  assert.equal(savedConfig.triggerRules.length, 0)
  assert.equal(service.getConfig().triggerRules.length, 0)

  assert.throws(
    () => service.setTriggerRuleStatus('rule:missing', 'disabled'),
    /does not exist/
  )
})

test('action service updates persisted trigger rule ruleSpec and status through one host-owned mutation path', () => {
  let savedConfig = {
    defaultAction: 'idle',
    clickAction: 'idle',
    actions: [
      {
        id: 'idle',
        label: 'Idle',
        kind: 'idle',
        loop: true,
        frameCount: 16,
        frameMs: 95,
        frameWidth: 191,
        frameHeight: 453,
        sprite: 'cat_anime/sprites/idle.png'
      },
      {
        id: 'wave',
        label: 'Wave',
        kind: 'custom',
        loop: false,
        frameCount: 8,
        frameMs: 90,
        frameWidth: 192,
        frameHeight: 208,
        sprite: 'cat_anime/sprites/wave.png'
      }
    ],
    triggerProposalInbox: [],
    triggerRules: [
      {
        id: 'rule:state:wave:test',
        actionId: 'wave',
        type: 'state',
        status: 'active',
        sourceProposalId: 'proposal:state:wave:test',
        sourcePluginId: 'openpet.creator-studio',
        sourceRunId: 'run-99',
        sourceCommandId: 'import-approved-action',
        message: 'Play wave when the pet becomes alert.',
        preview: 'State trigger rule can play wave when a host state condition matches.',
        createdAt: '2026-06-22T10:04:00.000Z',
        updatedAt: '2026-06-22T10:04:00.000Z'
      }
    ]
  }

  const timestamps = [
    '2026-06-22T10:05:00.000Z',
    '2026-06-22T10:06:00.000Z'
  ]
  const service = createActionService({
    projectRoot: '/app/openpet',
    now: () => timestamps.shift() || '2026-06-22T10:07:00.000Z',
    loadLegacyAnimations: () => savedConfig,
    saveLegacyAnimations: (config) => {
      savedConfig = config
      return config
    }
  })

  const edited = service.updateTriggerRule('rule:state:wave:test', {
    ruleSpec: {
      summary: 'Play Wave when focus mode is idle.',
      state: {
        predicate: 'focus.mode === idle',
        source: 'host'
      }
    }
  })
  assert.equal(edited.rule.ruleSpec.summary, 'Play Wave when focus mode is idle.')
  assert.equal(edited.rule.ruleSpec.state.predicate, 'focus.mode === idle')
  assert.equal(edited.rule.ruleSpec.state.source, 'host')
  assert.equal(savedConfig.triggerRules[0].updatedAt, '2026-06-22T10:05:00.000Z')

  const disabled = service.updateTriggerRule('rule:state:wave:test', {
    status: 'disabled'
  })
  assert.equal(disabled.rule.status, 'disabled')
  assert.equal(savedConfig.triggerRules[0].status, 'disabled')
  assert.equal(savedConfig.triggerRules[0].ruleSpec.summary, 'Play Wave when focus mode is idle.')
  assert.equal(savedConfig.triggerRules[0].updatedAt, '2026-06-22T10:06:00.000Z')

  assert.throws(
    () => service.updateTriggerRule('rule:missing', { status: 'disabled' }),
    /does not exist/
  )
})

test('action service rejects unsafe trigger proposal inbox mutations', () => {
  const service = createActionService({
    projectRoot: '/app/openpet',
    loadLegacyAnimations: () => ({
      defaultAction: 'idle',
      clickAction: 'idle',
      actions: [
        {
          id: 'idle',
          label: 'Idle',
          kind: 'idle',
          loop: true,
          frameCount: 16,
          frameMs: 95,
          frameWidth: 191,
          frameHeight: 453,
          sprite: 'cat_anime/sprites/idle.png'
        }
      ]
    }),
    saveLegacyAnimations: () => {
      throw new Error('should not save invalid inbox proposal')
    }
  })

  assert.throws(
    () => service.submitTriggerProposal({ actionId: '../wave', type: 'click' }),
    /safe id/
  )
  assert.throws(
    () => service.submitTriggerProposal({ actionId: 'missing', type: 'click' }),
    /does not exist/
  )
  assert.throws(
    () => service.submitTriggerProposal({ actionId: 'idle', type: 'click', binding: 'defaultAction' }),
    /Unsupported click trigger binding/
  )
  assert.throws(
    () => service.rejectTriggerProposalItem('../bad'),
    /safe id/
  )
})

test('action service rejects unsafe trigger proposals before mutation', () => {
  const service = createActionService({
    projectRoot: '/app/openpet',
    loadLegacyAnimations: () => ({
      defaultAction: 'idle',
      clickAction: 'idle',
      actions: [
        {
          id: 'idle',
          label: 'Idle',
          kind: 'idle',
          loop: true,
          frameCount: 16,
          frameMs: 95,
          frameWidth: 191,
          frameHeight: 453,
          sprite: 'cat_anime/sprites/idle.png'
        }
      ]
    }),
    saveLegacyAnimations: () => {
      throw new Error('should not save invalid trigger proposal')
    }
  })

  assert.throws(
    () => service.acceptTriggerProposal({ actionId: '../wave', type: 'click' }),
    /safe id/
  )
  assert.throws(
    () => service.acceptTriggerProposal({ actionId: 'idle', type: 'shell' }),
    /Unsupported trigger proposal type/
  )
  assert.throws(
    () => service.acceptTriggerProposal({ actionId: 'missing', type: 'click' }),
    /does not exist/
  )
  assert.throws(
    () => service.acceptTriggerProposal({ actionId: 'idle', type: 'click', binding: 'defaultAction' }),
    /Unsupported click trigger binding/
  )
})
