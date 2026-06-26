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
    triggerRules: [],
    triggerProposalInbox: [],
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
    triggerRules: [],
    triggerProposalInbox: [],
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
  assert.throws(
    () => service.applyCreatorActionMutation({
      defaultAction: 'missing',
      actions: [{ id: 'bad/id', sprite: '../outside.png', frameCount: 0, frameMs: 5, frameWidth: 0, frameHeight: 0 }]
    }),
    /Creator action mutation is invalid/
  )
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

test('action service accepts review-only trigger proposals and persists host rules where needed', () => {
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
  assert.equal(state.code, 'rule_saved')
  assert.equal(state.preview.rule.type, 'state')
  assert.equal(state.sourcePluginId, '')
  assert.equal(state.sourceRunId.length, 160)
  assert.equal(savedConfig.triggerRules.length, 1)
  assert.equal(service.getConfig().clickAction, 'idle')
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

test('action service persists accepted host-rule and rejected inbox proposals', () => {
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
  assert.equal(accepted.triggerProposal.code, 'rule_saved')
  assert.equal(accepted.proposal.status, 'accepted')
  assert.equal(rejected.proposal.status, 'rejected')
  assert.equal(rejected.proposal.rejectionReason, 'Not for this pet.')
  assert.equal(savedConfig.clickAction, 'idle')
  assert.equal(savedConfig.triggerRules.length, 1)
  assert.deepEqual(
    savedConfig.triggerProposalInbox.map((proposal) => proposal.status),
    ['accepted', 'rejected']
  )
})

test('action service accepts random state and event trigger proposals by persisting validated host rules', () => {
  let savedConfig = null
  const service = createActionService({
    projectRoot: '/app/openpet',
    now: () => '2026-06-23T10:03:00.000Z',
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
        },
        {
          id: 'sleep',
          label: 'Sleep',
          kind: 'custom',
          loop: true,
          frameCount: 8,
          frameMs: 120,
          frameWidth: 192,
          frameHeight: 208,
          sprite: 'cat_anime/sprites/sleep.png'
        }
      ],
      triggerProposalInbox: []
    }),
    saveLegacyAnimations: (config) => {
      savedConfig = config
      return config
    }
  })

  const randomProposal = service.submitTriggerProposal({
    id: 'proposal:random:wave:test',
    actionId: 'wave',
    type: 'random',
    message: 'Use wave in idle rotation.'
  })
  const stateProposal = service.submitTriggerProposal({
    id: 'proposal:state:sleep:test',
    actionId: 'sleep',
    type: 'state',
    message: 'Use sleep while pet is resting.'
  })
  const eventProposal = service.submitTriggerProposal({
    id: 'proposal:event:wave:test',
    actionId: 'wave',
    type: 'event',
    message: 'Use wave after greeting event.'
  })

  const acceptedRandom = service.acceptTriggerProposalItem(randomProposal.proposal.id)
  const acceptedState = service.acceptTriggerProposalItem(stateProposal.proposal.id)
  const acceptedEvent = service.acceptTriggerProposalItem(eventProposal.proposal.id)

  assert.equal(acceptedRandom.triggerProposal.applied, false)
  assert.equal(acceptedRandom.triggerProposal.code, 'rule_saved')
  assert.equal(acceptedRandom.proposal.status, 'accepted')
  assert.equal(acceptedRandom.triggerProposal.preview.rule.type, 'random')
  assert.equal(acceptedState.triggerProposal.preview.rule.type, 'state')
  assert.equal(acceptedEvent.triggerProposal.preview.rule.type, 'event')
  assert.equal(savedConfig.triggerRules.length, 3)
  assert.deepEqual(
    savedConfig.triggerRules.map((rule) => ({
      type: rule.type,
      actionId: rule.actionId
    })),
    [
      { type: 'random', actionId: 'wave' },
      { type: 'state', actionId: 'sleep' },
      { type: 'event', actionId: 'wave' }
    ]
  )
  assert.deepEqual(
    savedConfig.triggerProposalInbox.map((proposal) => proposal.status),
    ['accepted', 'accepted', 'accepted']
  )
})

test('action service does not persist duplicate host trigger rules for the same proposal semantics', () => {
  let savedConfig = null
  const service = createActionService({
    projectRoot: '/app/openpet',
    now: () => '2026-06-23T10:04:00.000Z',
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
      ],
      triggerRules: []
    }),
    saveLegacyAnimations: (config) => {
      savedConfig = config
      return config
    }
  })

  const first = service.acceptTriggerProposal({
    actionId: 'wave',
    type: 'state',
    condition: {
      stateKey: 'posture',
      equals: 'resting'
    }
  })
  const second = service.acceptTriggerProposal({
    actionId: 'wave',
    type: 'state',
    condition: {
      stateKey: 'posture',
      equals: 'resting'
    }
  })

  assert.equal(first.code, 'rule_saved')
  assert.equal(second.code, 'rule_saved')
  assert.equal(savedConfig.triggerRules.length, 1)
  assert.deepEqual(savedConfig.triggerRules[0], {
    id: 'rule:state:wave',
    type: 'state',
    actionId: 'wave',
    enabled: true,
    condition: {
      stateKey: 'posture',
      equals: 'resting'
    }
  })
})

test('action service previews host trigger rules before persistence', () => {
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
      triggerRules: []
    })
  })

  const preview = service.previewTriggerProposal({
    actionId: 'wave',
    type: 'state',
    message: 'Use wave when focused.'
  })

  assert.equal(preview.ok, true)
  assert.equal(preview.applied, false)
  assert.equal(preview.code, 'preview_ready')
  assert.equal(preview.preview.rule.type, 'state')
  assert.equal(preview.preview.rule.actionId, 'wave')
  assert.match(preview.message, /Preview/)
})

test('action service removes persisted trigger rules by id', () => {
  let savedConfig = null
  const service = createActionService({
    projectRoot: '/app/openpet',
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
      ],
      triggerRules: [{
        id: 'rule:state:wave',
        type: 'state',
        actionId: 'wave',
        enabled: true,
        condition: { stateKey: 'posture', equals: 'resting' }
      }]
    }),
    saveLegacyAnimations: (config) => {
      savedConfig = config
      return config
    }
  })

  const result = service.removeTriggerRule('rule:state:wave')

  assert.equal(result.triggerRules.length, 0)
  assert.equal(savedConfig.triggerRules.length, 0)
})

test('action service toggles persisted trigger rules by id', () => {
  let savedConfig = null
  const service = createActionService({
    projectRoot: '/app/openpet',
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
      ],
      triggerRules: [{
        id: 'rule:state:wave',
        type: 'state',
        actionId: 'wave',
        enabled: true,
        condition: { stateKey: 'posture', equals: 'resting' }
      }]
    }),
    saveLegacyAnimations: (config) => {
      savedConfig = config
      return config
    }
  })

  const disabled = service.setTriggerRuleEnabled('rule:state:wave', false)
  const enabled = service.setTriggerRuleEnabled('rule:state:wave', true)

  assert.equal(disabled.triggerRules[0].enabled, false)
  assert.equal(enabled.triggerRules[0].enabled, true)
  assert.equal(savedConfig.triggerRules[0].enabled, true)
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
    () => service.previewTriggerProposal({ actionId: 'idle', type: 'state', binding: 'clickAction' }),
    /Unsupported state trigger binding/
  )
  assert.throws(
    () => service.removeTriggerRule('../bad'),
    /safe id/
  )
  assert.throws(
    () => service.setTriggerRuleEnabled('../bad', true),
    /safe id/
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
