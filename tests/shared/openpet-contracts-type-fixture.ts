import type {
  ActionTriggerProposalPreviewResult,
  AiProviderSmokeReport,
  ControlCenterSettings,
  CatalogInstallSelection,
  CreatorActionsMutationResult,
  CreatorActionsReadResponse,
  CreatorAssetsImportFramesRequest,
  CreatorAssetsImportFramesResponse,
  CreatorAssetsInspectFramesRequest,
  CreatorAssetsInspectFramesResponse,
  CreatorAssetsPickFramesImportResponse,
  CreatorAssetsPickFramesInspectResponse,
  CreatorAssetsPickFramesRequest,
  CreatorPackManifestMutationRequest,
  CreatorPackManifestMutationResult,
  CreatorPackManifestReadResponse,
  CreatorStudioProviderSmokeReport,
  DesktopPickerArchiveManifest,
  DesktopPickerSmokeReport,
  DesktopPickerEvidenceSummary,
  MacosReleaseEvidenceArtifactArchiveManifest,
  MacosReleaseEvidenceCommand,
  MacosReleaseEvidenceSummary,
  PackagedPluginCleanupEvidenceRunResult,
  PackagedPluginCleanupRuntimeArtifact,
  PackagedRuntimeSmokeEvidence,
  PackagedRuntimeSmokeReport,
  PluginCommunitySourceInvitationSummary,
  PluginCommunitySourceSubmissionEvidenceSummary,
  PluginCleanupEvidenceArchiveManifest,
  PluginCleanupEvidenceChecklistReport,
  PluginCleanupEvidenceCollectorRun,
  PluginCleanupEvidenceReport,
  PluginCleanupEvidenceRunResult,
  PluginCommandRunResultViewState,
  PluginMaintainerApprovalRecord,
  PluginPackageReviewViewState,
  PluginRealWorldSubmissionRehearsalSummary,
  PluginRemoteSourceSubmissionRehearsalSummary,
  PluginSubmissionBundleSummary,
  PluginSetupRunResultViewState,
  ReleaseEvidenceArchiveManifest,
  ReleaseEvidenceArchiveSummary,
  SignedReleaseClosureReport,
  SignedReleaseClaimSummary,
  WindowsSmokeArchiveManifest,
  WindowsSmokeReport,
  WindowsSmokeEvidenceSummary
} from '../../src/shared/openpet-contracts'

const controlCenterSettingsFixture = {
  scale: 1,
  walkSpeed: 2,
  walkDuration: 15000,
  bubbleDuration: 6000,
  menuPosition: 'auto',
  autoStart: false,
  selectedCursorId: 'system',
  customCursor: {
    enabled: false,
    assetPath: '',
    assetUrl: '',
    fileName: '',
    width: 0,
    height: 0,
    hotspotX: 0,
    hotspotY: 0
  },
  customCursors: [],
  grounded: true,
  home: {
    enabled: true,
    radius: 'medium',
    hasAnchor: true
  },
  petBubbleChat: {
    enabled: true,
    autoPopup: true,
    autoHide: true,
    pinOnInteraction: true
  }
} satisfies ControlCenterSettings

const pluginReviewFixture = {
  installMode: 'install',
  existingVersion: '',
  riskLevel: 'review',
  plugin: {
    id: 'openpet.fixture.plugin',
    name: 'Fixture Plugin',
    version: '1.0.0',
    permissions: ['pet:say'],
    commands: [{ id: 'run', title: 'Run' }],
    entries: {
      setup: [{ id: 'install-deps', title: 'Install Dependencies', command: 'npm install', cwd: '.', runtime: { status: 'not-run' } }],
      commands: [{ id: 'run', title: 'Run', command: 'node ./index.js', cwd: '.' }],
      services: [{
        id: 'svc',
        title: 'Service',
        command: 'npm run service:start',
        cwd: '.',
        health: { type: 'http', url: 'http://127.0.0.1:8787/health' },
        healthPolicy: { enabled: true, intervalMs: 30000 }
      }],
      dashboards: [{ id: 'main', title: 'Dashboard', url: 'http://127.0.0.1:8787' }]
    }
  },
  permissionDiff: {
    permissions: {
      added: ['pet:say'],
      removed: [],
      unchanged: []
    },
    networkAllowlist: {
      added: [],
      removed: [],
      unchanged: []
    }
  },
  signature: {
    status: 'unsigned',
    label: 'Unsigned plugin',
    errors: []
  },
  blockStatus: {
    blocked: false,
    reasons: []
  },
  packageHash: 'a'.repeat(64),
  fileCount: 3,
  byteSize: 2048
} satisfies PluginPackageReviewViewState

const catalogSelectionFixture = {
  kind: 'plugin',
  itemId: 'openpet.fixture.plugin',
  selectionId: 'fixture-selection',
  sourcePackageHash: pluginReviewFixture.packageHash,
  pluginReview: pluginReviewFixture
} satisfies CatalogInstallSelection

const pluginSetupRunFixture = {
  ok: true,
  pluginId: 'openpet.fixture.plugin',
  setupId: 'install-deps',
  runtime: {
    status: 'succeeded',
    lastRunAt: '2026-06-17T00:00:00.000Z',
    exitCode: 0,
    error: ''
  }
} satisfies PluginSetupRunResultViewState

const pluginCommandRunFixture = {
  ok: true,
  pluginId: 'openpet.fixture.plugin',
  commandId: 'run',
  exitCode: 0,
  result: {
    ok: true,
    message: 'Command completed'
  }
} satisfies PluginCommandRunResultViewState

const creatorActionsReadFixture = {
  ok: true,
  actions: {
    defaultAction: 'idle',
    clickAction: 'wave',
    triggerProposalInbox: [],
    triggerRules: [],
    actions: [
      { id: 'idle', label: 'Idle', sprite: 'file:///packs/cat/sprites/idle.png', previewSprite: 'file:///packs/cat/sprites/idle.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 },
      { id: 'wave', label: 'Wave', sprite: 'file:///packs/cat/sprites/wave.png', previewSprite: 'file:///packs/cat/sprites/wave.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 }
    ]
  }
} satisfies CreatorActionsReadResponse

const creatorActionsMutationFixture = {
  ok: true,
  validation: {
    ok: true,
    errors: [],
    warnings: [],
    actions: {
      defaultAction: 'idle',
      clickAction: 'wave',
      triggerProposalInbox: [],
      triggerRules: [],
      actions: [
        { id: 'idle', label: 'Idle', sprite: 'file:///packs/cat/sprites/idle.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 },
        { id: 'wave', label: 'Wave Updated', sprite: 'file:///packs/cat/sprites/wave.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 }
      ]
    }
  },
  actions: {
    defaultAction: 'idle',
    clickAction: 'wave',
    triggerProposalInbox: [],
    triggerRules: [],
    actions: [
      { id: 'idle', label: 'Idle', sprite: 'file:///packs/cat/sprites/idle.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 },
      { id: 'wave', label: 'Wave Updated', sprite: 'file:///packs/cat/sprites/wave.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 }
    ]
  }
} satisfies CreatorActionsMutationResult

const triggerProposalPreviewFixture = {
  ok: true,
  applied: false,
  actionId: 'wave',
  type: 'state',
  binding: '',
  code: 'will_create_rule',
  message: 'Preview: a host trigger rule would be created for action: wave',
  triggerRuleId: 'preview:state:wave',
  preview: 'State trigger rule can play wave when a host state condition matches.',
  triggerRule: {
    id: 'preview:state:wave',
    actionId: 'wave',
    type: 'state',
    status: 'active',
    sourceProposalId: 'proposal:state:wave:test',
    sourcePluginId: 'openpet.creator-studio',
    sourceRunId: 'run-1',
    sourceCommandId: 'import-approved-action',
    message: 'Play when idle.',
    preview: 'State trigger rule can play wave when a host state condition matches.',
    ruleSpec: {
      schemaVersion: 1,
      type: 'state',
      summary: 'Play when idle.',
      state: {
        predicate: 'host.state.available',
        source: 'host'
      }
    },
    createdAt: '2026-06-22T10:00:00.000Z',
    updatedAt: '2026-06-22T10:00:00.000Z'
  }
} satisfies ActionTriggerProposalPreviewResult

const aiProviderSmokeFixture = {
  schemaVersion: 1,
  generatedAt: '2026-06-28T11:08:10.554Z',
  evidenceType: 'ai-provider-smoke',
  claimBoundary: 'OpenPet development gateway model discovery and chat completion smoke only; image generation was not executed.',
  provider: 'openai-compatible',
  baseUrl: 'http://127.0.0.1:8317/v1',
  chatModel: 'gpt-5.5',
  imageModel: 'gpt-image-2',
  includeImage: false,
  secret: {
    apiKeyConfigured: true,
    apiKeyPreview: 'redacted'
  },
  checks: [
    {
      id: 'models',
      status: 'pass',
      statusCode: 200,
      elapsedMs: 150,
      discoveredModelCount: 45,
      containsChatModel: true,
      containsImageModel: true,
      models: ['gpt-5.5', 'gpt-image-2'],
      message: 'selected models are present or image check is disabled'
    },
    {
      id: 'chat-completions',
      status: 'pass',
      statusCode: 200,
      elapsedMs: 2780,
      replyChars: 2,
      message: 'chat completion returned text'
    },
    {
      id: 'image-generations',
      status: 'skipped',
      message: 'image generation is opt-in; pass --include-image to run this potentially billable check'
    }
  ],
  ok: true
} satisfies AiProviderSmokeReport

const creatorStudioProviderSmokeFixture = {
  schemaVersion: 1,
  ok: true,
  generatedAt: '2026-06-28T14:06:27.408Z',
  evidenceType: 'creator-studio-provider-smoke',
  claimBoundary: 'Creator Studio host-owned provider-path validation only; generated image and action-frame artifacts still require human review before any production asset-quality claim.',
  source: 'scripts/run-creator-studio-provider-smoke.js',
  sessionId: '2026-06-28T14-06-27-403Z',
  sessionDir: 'docs/release-evidence/creator-studio-provider-smoke/2026-06-28T14-06-27-403Z',
  logPath: 'docs/release-evidence/creator-studio-provider-smoke/2026-06-28T14-06-27-403Z/logs/openpet-app.jsonl',
  resultPath: 'docs/release-evidence/creator-studio-provider-smoke/2026-06-28T14-06-27-403Z/creator-studio-provider-smoke-result.json',
  config: {
    provider: 'openai-compatible',
    baseUrl: '[redacted-local-url]',
    model: 'gpt-image-2',
    hasApiKey: true,
    timeoutMs: 420000,
    maxConcurrentJobs: 1
  },
  backend: {
    requested: 'provider'
  },
  promptBuilder: {
    version: 1,
    mode: 'single-action',
    actionId: 'provider-smoke-wave',
    sectionCount: 11,
    warnings: [],
    promptPreview: '## Intent - You are generating an OpenPet desktop pet sprite asset.',
    promptChars: 3322
  },
  action: {
    actionId: 'provider-smoke-wave',
    name: '开心挥手',
    frameCount: 16,
    loop: false,
    triggerType: 'manual'
  },
  generationConstraints: {
    width: 512,
    height: 512,
    transparent: true,
    timeoutOverrideMs: 420000
  },
  healthCheck: {
    skipped: false,
    ok: true,
    code: 'provider_healthy',
    message: 'Image Provider is reachable',
    modelsProbe: 'ok',
    availableModelCount: 46,
    currentModelDiscovered: true
  },
  generation: {
    ok: true,
    requestId: 'acd3d278-d947-4a5e-8c12-f6b6aa09c891',
    provider: 'openai-compatible',
    model: 'gpt-image-2',
    generatedAt: '2026-06-28T14:10:52.485Z',
    outputCount: 1,
    outputs: [{
      dataRelativePath: 'frames/base/0001.png',
      mimeType: 'image/png',
      sha256: '7688eec3ad612adc55662341f81b24dcbc12ca98911cdf6de6d88fa09c054bb1'
    }],
    usageEstimatedCostUsd: 0
  },
  actionFrames: {
    ok: true,
    actionId: 'provider-smoke-wave',
    frameCount: 16,
    frameWidth: 192,
    frameHeight: 208,
    framesDir: 'frames/actions/provider-smoke-wave',
    qaPath: 'qa/action-frame-validation.json',
    contactSheetPath: 'qa/action-frame-contact-sheet.png',
    visibleFrameCount: 16,
    warningCount: 0,
    warnings: []
  },
  manualReviewChecklist: [
    'Inspect the contact sheet before claiming production asset quality.',
    'Review QA JSON and generated frame readability before import or release evidence claims.',
    'Treat this smoke as provider-path validation, not automatic artistic approval.'
  ],
  logs: [
    {
      id: 'b30ef4ea-72b5-4553-ac40-84b3bb47f9ca',
      timestamp: '2026-06-28T14:06:27.412Z',
      level: 'info',
      actor: 'system',
      scope: 'image-generation',
      event: 'imageGeneration.health.started',
      message: 'Image Provider health check started',
      details: {
        requestId: '29dce617-4a7e-428b-8ecb-c35ca169fdf6',
        provider: 'openai-compatible',
        model: 'gpt-image-2',
        baseUrlHost: '127.0.0.1:8317'
      }
    }
  ]
} satisfies CreatorStudioProviderSmokeReport

const creatorAssetsInspectFramesRequestFixture = {
  relativePath: 'assets/actions/wave',
  actionId: 'wave'
} satisfies CreatorAssetsInspectFramesRequest

const creatorAssetsInspectFramesResponseFixture = {
  ok: true,
  result: {
    actionId: 'wave',
    folderName: 'wave',
    inspection: {
      valid: true,
      frameCount: 2,
      maxWidth: 8,
      maxHeight: 8,
      frames: [
        { fileName: '01_no_bg.png', width: 8, height: 8, hasAlpha: true },
        { fileName: '02_no_bg.png', width: 8, height: 8, hasAlpha: true }
      ],
      skippedFiles: [],
      errors: [],
      warnings: []
    }
  }
} satisfies CreatorAssetsInspectFramesResponse

const creatorAssetsImportFramesRequestFixture = {
  relativePath: 'assets/actions/wave',
  actionId: 'wave',
  label: 'Wave Hello'
} satisfies CreatorAssetsImportFramesRequest

const creatorAssetsImportFramesResponseFixture = {
  ok: true,
  actions: {
    defaultAction: 'idle',
    clickAction: 'wave',
    triggerProposalInbox: [],
    triggerRules: [],
    actions: [
      { id: 'idle', label: 'Idle', sprite: 'file:///packs/cat/sprites/idle.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 },
      { id: 'wave', label: 'Wave Hello', sprite: 'file:///packs/cat/sprites/wave.png', frameCount: 2, frameMs: 95, frameWidth: 8, frameHeight: 8 }
    ]
  },
  importedAction: { id: 'wave', label: 'Wave Hello', sprite: 'file:///packs/cat/sprites/wave.png', frameCount: 2, frameMs: 95, frameWidth: 8, frameHeight: 8 }
} satisfies CreatorAssetsImportFramesResponse

const creatorAssetsPickFramesRequestFixture = {
  actionId: 'picked-wave',
  label: 'Picked Wave'
} satisfies CreatorAssetsPickFramesRequest

const creatorAssetsPickFramesInspectResponseFixture = {
  ok: true,
  canceled: false,
  result: {
    actionId: 'picked-wave',
    folderName: 'picked-wave',
    inspection: creatorAssetsInspectFramesResponseFixture.result.inspection
  }
} satisfies CreatorAssetsPickFramesInspectResponse

const creatorAssetsPickFramesImportResponseFixture = {
  ok: true,
  canceled: false,
  actions: creatorAssetsImportFramesResponseFixture.actions,
  importedAction: creatorAssetsImportFramesResponseFixture.importedAction
} satisfies CreatorAssetsPickFramesImportResponse

const creatorAssetsPickFramesCanceledFixture = {
  ok: true,
  canceled: true
} satisfies CreatorAssetsPickFramesInspectResponse

const creatorPackManifestMutationRequestFixture = {
  displayName: 'Community Weather Cat Deluxe',
  version: '1.1.0',
  provenance: {
    sourceUrl: 'https://example.com/deluxe',
    assetAuthor: 'Updated Author',
    license: 'CC-BY-SA-4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/'
  }
} satisfies CreatorPackManifestMutationRequest

const creatorPackManifestReadFixture = {
  ok: true,
  manifest: {
    id: 'community-weather-cat',
    displayName: 'Community Weather Cat',
    version: '1.0.0',
    source: 'user-installed',
    provenance: {
      sourceUrl: 'https://example.com/original',
      assetAuthor: 'Original Author',
      license: 'CC-BY-4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/'
    }
  }
} satisfies CreatorPackManifestReadResponse

const creatorPackManifestMutationFixture = {
  ok: true,
  validation: {
    ok: true,
    errors: [],
    warnings: [],
    manifest: {
      id: 'community-weather-cat',
      displayName: 'Community Weather Cat Deluxe',
      version: '1.1.0',
      source: 'user-installed',
      provenance: {
        sourceUrl: 'https://example.com/deluxe',
        assetAuthor: 'Updated Author',
        license: 'CC-BY-SA-4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/'
      }
    }
  },
  manifest: {
    id: 'community-weather-cat',
    displayName: 'Community Weather Cat Deluxe',
    version: '1.1.0',
    source: 'user-installed',
    provenance: creatorPackManifestMutationRequestFixture.provenance
  }
} satisfies CreatorPackManifestMutationResult

const pluginCleanupEvidenceFixture = {
  generatedAt: '2026-06-18T10:00:00.000Z',
  ok: true,
  phase: 86,
  platform: 'darwin',
  signal: 'SIGTERM',
  cleanupAttempted: true,
  rootPid: 1234,
  rootExited: true,
  rootExitCode: 0,
  rootSignal: '',
  descendantPidsBefore: [1235],
  liveDescendantPidsAfter: [],
  descendantsExited: true,
  claimBoundary: 'single controlled host cleanup fixture; not a universal process-tree guarantee',
  warnings: [
    'This evidence only covers a controlled fixture on the current host and OS.'
  ],
  files: {
    json: 'docs/release-evidence/plugin-cleanup-evidence/session/plugin-cleanup-evidence.json',
    markdown: 'docs/release-evidence/plugin-cleanup-evidence/session/plugin-cleanup-evidence.md'
  }
} satisfies PluginCleanupEvidenceReport

const pluginCleanupEvidenceChecklistFixture = {
  schemaVersion: 'openpet-plugin-cleanup-evidence/v1',
  generatedAt: '2026-06-18T10:00:00.000Z',
  source: 'scripts/create-plugin-cleanup-evidence-report.js',
  environment: {
    platform: 'darwin',
    arch: 'arm64',
    node: 'v24.0.0',
    machine: 'cleanup-host',
    runner: 'local terminal',
    evidence: 'terminal transcript sha256:abc123'
  },
  scenario: {
    pluginId: 'openpet.cleanup-fixture',
    hostApp: 'OpenPet packaged app',
    notes: 'Fixture cleanup run'
  },
  checks: [
    {
      id: 'service-exit-confirmed-stop',
      status: 'pass',
      evidence: 'service log and process transcript'
    },
    {
      id: 'command-tree-fallback-cleanup',
      status: 'pending',
      evidence: '',
      notes: 'Pending host evidence.'
    }
  ]
} satisfies PluginCleanupEvidenceChecklistReport

const pluginCleanupEvidenceArchiveManifestFixture = {
  generatedAt: '2026-06-18T14:30:00.000Z',
  ok: true,
  cleanupReady: false,
  archive: {
    archiveDir: '/tmp/openpet-plugin-cleanup-evidence',
    outputPath: '/tmp/openpet-plugin-cleanup-evidence/plugin-cleanup-evidence-archive-manifest.json'
  },
  files: [
    {
      role: 'report',
      path: '/tmp/openpet-plugin-cleanup-evidence/plugin-cleanup-evidence-report.json',
      exists: true,
      bytes: 2048,
      sha256: '4'.repeat(64)
    },
    {
      role: 'collector',
      path: '/tmp/openpet-plugin-cleanup-evidence/plugin-cleanup-evidence-collector.sh',
      exists: true,
      bytes: 4096,
      sha256: '5'.repeat(64)
    }
  ],
  collector: {
    path: '/tmp/openpet-plugin-cleanup-evidence/plugin-cleanup-evidence-collector.sh',
    conservativeWording: true,
    avoidsPassShortcut: true
  },
  evidence: {
    evidenceDir: '/tmp/openpet-plugin-cleanup-evidence/plugin-cleanup-evidence-collected',
    requiredFiles: ['environment.txt', 'manual-checks.md'],
    requiredFilesPresent: true,
    files: [
      {
        role: 'evidence',
        file: 'collector-run.json',
        path: '/tmp/openpet-plugin-cleanup-evidence/plugin-cleanup-evidence-collected/collector-run.json',
        bytes: 512,
        sha256: '6'.repeat(64)
      }
    ]
  },
  report: {
    path: '/tmp/openpet-plugin-cleanup-evidence/plugin-cleanup-evidence-report.json',
    schemaVersion: pluginCleanupEvidenceChecklistFixture.schemaVersion,
    generatedAt: pluginCleanupEvidenceChecklistFixture.generatedAt,
    source: pluginCleanupEvidenceChecklistFixture.source,
    environment: pluginCleanupEvidenceChecklistFixture.environment,
    scenario: pluginCleanupEvidenceChecklistFixture.scenario,
    structuralValidation: {
      ok: true,
      errors: [],
      warnings: [],
      summary: {
        passed: 0,
        total: 7,
        cleanupReady: false
      }
    },
    readinessValidation: {
      ok: false,
      errors: ['required cleanup check is pending: service-exit-confirmed-stop'],
      warnings: [],
      summary: {
        passed: 0,
        total: 7,
        cleanupReady: false
      }
    }
  },
  errors: [],
  warnings: ['archive is valid but does not prove plugin cleanup readiness until every required check passes with evidence']
} satisfies PluginCleanupEvidenceArchiveManifest

const pluginCleanupEvidenceCollectorRunFixture = {
  startedAt: '2026-06-18T14:30:00.000Z',
  finishedAt: '2026-06-18T14:30:01.000Z',
  ok: true,
  command: ['bash', '/tmp/openpet-plugin-cleanup-evidence/plugin-cleanup-evidence-collector.sh'],
  cwd: '/Users/mango/project/codex/OpenPet',
  timeoutMs: 300000,
  reportPath: pluginCleanupEvidenceArchiveManifestFixture.report.path,
  evidenceDir: pluginCleanupEvidenceArchiveManifestFixture.evidence.evidenceDir,
  exitCode: 0,
  signal: '',
  error: '',
  stdoutPath: '/tmp/openpet-plugin-cleanup-evidence/plugin-cleanup-evidence-collected/collector-stdout.txt',
  stderrPath: '/tmp/openpet-plugin-cleanup-evidence/plugin-cleanup-evidence-collected/collector-stderr.txt',
  runPath: '/tmp/openpet-plugin-cleanup-evidence/plugin-cleanup-evidence-collected/collector-run.json'
} satisfies PluginCleanupEvidenceCollectorRun

const pluginCleanupEvidenceRunResultFixture = {
  ok: true,
  archiveDir: pluginCleanupEvidenceArchiveManifestFixture.archive.archiveDir,
  reportPath: pluginCleanupEvidenceArchiveManifestFixture.report.path,
  collectorPath: pluginCleanupEvidenceArchiveManifestFixture.collector.path,
  evidenceDir: pluginCleanupEvidenceArchiveManifestFixture.evidence.evidenceDir,
  manifestPath: pluginCleanupEvidenceArchiveManifestFixture.archive.outputPath,
  collectorRun: pluginCleanupEvidenceCollectorRunFixture,
  manifest: pluginCleanupEvidenceArchiveManifestFixture
} satisfies PluginCleanupEvidenceRunResult

const pluginSubmissionBundleSummaryFixture = {
  generatedAt: '2026-06-17T15:14:15.000Z',
  sourcePath: '/tmp/openpet/plugin-submission/packages/openpet.example.weather-status.openpet-plugin.zip',
  outputDir: '/tmp/openpet/plugin-submission/submission-bundle',
  readyForHumanReview: true,
  decision: 'ready-for-human-review',
  plugin: {
    id: 'openpet.example.weather-status',
    name: 'Weather Status',
    version: '1.0.0',
    description: 'Example local plugin that fetches allowlisted weather JSON and asks the pet to summarize it.',
    permissions: ['network', 'pet:say', 'storage'],
    networkAllowlist: ['api.weather.example.com'],
    commands: [
      { id: 'refresh', title: 'Refresh weather' },
      { id: 'last', title: 'Show last weather' }
    ]
  },
  package: {
    sourceType: 'zip',
    installMode: 'install',
    sha256: '9d90fc03bf24fa70b79fe8f4fbc6fffd62212df9c91d1abf384df0a571790567',
    fileCount: 4,
    byteSize: 5457,
    riskLevel: 'review',
    requiresReview: false
  },
  signature: {
    status: 'unsigned',
    label: 'Unsigned plugin',
    signer: ''
  },
  validation: {
    ok: true,
    errors: [],
    warnings: [
      'Plugin is unsigned; local testing may continue, but catalog/release review should require trusted signature evidence',
      'Package requires human review before distribution'
    ]
  },
  files: {
    report: '/tmp/openpet/plugin-submission/submission-bundle/plugin-submission-report.md',
    pr: '/tmp/openpet/plugin-submission/submission-bundle/plugin-submission-pr.md',
    summary: '/tmp/openpet/plugin-submission/submission-bundle/plugin-submission-summary.json'
  },
  nextSteps: [
    'Attach or paste plugin-submission-report.md in the plugin PR.',
    'Use plugin-submission-pr.md as the PR body with the plugin submission template.',
    'Record manual reviewer approval before merge.',
    'Do not treat this bundle as signing trust, catalog approval, or runtime smoke evidence.'
  ]
} satisfies PluginSubmissionBundleSummary

const pluginMaintainerApprovalRecordFixture = {
  generatedAt: '2026-06-17T15:14:15.000Z',
  reviewer: 'OpenPet Maintainer',
  decision: 'approved',
  notes: 'Manifest, permissions, package hash, network hosts, and submission artifacts reviewed.',
  sourceBundleDir: pluginSubmissionBundleSummaryFixture.outputDir,
  plugin: {
    id: pluginSubmissionBundleSummaryFixture.plugin.id,
    name: pluginSubmissionBundleSummaryFixture.plugin.name,
    version: pluginSubmissionBundleSummaryFixture.plugin.version
  },
  package: {
    sha256: pluginSubmissionBundleSummaryFixture.package.sha256
  },
  submissionDecision: pluginSubmissionBundleSummaryFixture.decision,
  approvalReady: true,
  files: {
    markdown: '/tmp/openpet/plugin-submission/submission-bundle/plugin-maintainer-approval.md',
    json: '/tmp/openpet/plugin-submission/submission-bundle/plugin-maintainer-approval.json'
  }
} satisfies PluginMaintainerApprovalRecord

const pluginRealWorldSubmissionRehearsalSummaryFixture = {
  generatedAt: '2026-06-17T15:14:15.000Z',
  outputDir: '/tmp/openpet/plugin-real-world-submission-rehearsal/2026-06-17T15-14-15Z',
  sourcePath: '/Users/mango/project/codex/OpenPet/examples/plugins/weather-status',
  sourcePlugin: {
    id: 'openpet.example.weather-status',
    name: 'Weather Status',
    version: '1.0.0',
    permissions: ['network', 'pet:say', 'storage'],
    networkAllowlist: ['api.weather.example.com']
  },
  sourceValidation: {
    ok: true,
    warnings: pluginSubmissionBundleSummaryFixture.validation.warnings,
    errors: [],
    riskLevel: 'review'
  },
  packagePath: '/tmp/openpet/plugin-real-world-submission-rehearsal/2026-06-17T15-14-15Z/packages/openpet.example.weather-status.openpet-plugin.zip',
  packageValidation: {
    ok: true,
    warnings: pluginSubmissionBundleSummaryFixture.validation.warnings,
    errors: [],
    riskLevel: 'review',
    sha256: pluginSubmissionBundleSummaryFixture.package.sha256
  },
  submission: {
    bundleDir: '/tmp/openpet/plugin-real-world-submission-rehearsal/2026-06-17T15-14-15Z/submission-bundle',
    bundle: pluginSubmissionBundleSummaryFixture,
    bundleValidation: {
      ok: true,
      errors: [],
      warnings: [],
      summary: {
        filesPresent: 3,
        filesTotal: 3,
        readyForHumanReview: true,
        decision: 'ready-for-human-review',
        requireReady: true
      }
    }
  },
  approval: {
    record: pluginMaintainerApprovalRecordFixture,
    validation: {
      ok: true,
      errors: [],
      warnings: [],
      summary: {
        approved: true,
        approvalReady: true,
        requireApproved: true
      }
    }
  },
  files: {
    readme: '/tmp/openpet/plugin-real-world-submission-rehearsal/2026-06-17T15-14-15Z/README.md',
    checklist: '/tmp/openpet/plugin-real-world-submission-rehearsal/2026-06-17T15-14-15Z/submission-checklist.md',
    commands: '/tmp/openpet/plugin-real-world-submission-rehearsal/2026-06-17T15-14-15Z/commands.json',
    summary: '/tmp/openpet/plugin-real-world-submission-rehearsal/2026-06-17T15-14-15Z/plugin-real-world-submission-rehearsal-summary.json'
  }
} satisfies PluginRealWorldSubmissionRehearsalSummary

const pluginRemoteSourceSubmissionRehearsalSummaryFixture = {
  generatedAt: '2026-06-17T17:33:39.420Z',
  outputDir: '/tmp/openpet/plugin-remote-source-submission-rehearsal/2026-06-18T00-30-00Z',
  sourceArchive: {
    kind: 'https-archive',
    archiveUrl: 'https://codeload.github.com/dengyie/OpenPet/zip/refs/heads/main',
    finalUrl: 'https://codeload.github.com/dengyie/OpenPet/zip/refs/heads/main',
    archiveSha256: '607bcf3f6791f228a2ccde8eb72d381d037b6d89205026536530d573748d16c6',
    archiveByteSize: 18022439,
    pluginPath: 'examples/plugins/weather-status',
    archivePluginPath: 'OpenPet-main/examples/plugins/weather-status',
    archiveRootPrefix: 'OpenPet-main',
    extractedFileHashes: {
      'README.md': 'fb27bfdeb2666eb41af6ab962ccd103fb9cb9e814d455f285684a905257f83bb',
      'config.schema.json': '26a811621e79717fbc5424507be7e8b94d41071119bd86e0b29d25583fb91320',
      'index.js': '7b6f7ace639645dc174cbd5b1cc8c412f811bcc03df970d48a3094f877e1642b',
      'plugin.json': '851c7b9d8c9487da7e79225d5572efc13307afc1bc1a44301533d11af876efff'
    },
    downloadedAt: '2026-06-17T17:33:39.420Z'
  },
  sourcePlugin: pluginRealWorldSubmissionRehearsalSummaryFixture.sourcePlugin,
  sourceValidation: pluginRealWorldSubmissionRehearsalSummaryFixture.sourceValidation,
  packagePath: '/tmp/openpet/plugin-remote-source-submission-rehearsal/2026-06-18T00-30-00Z/packages/openpet.example.weather-status.openpet-plugin.zip',
  packageValidation: pluginRealWorldSubmissionRehearsalSummaryFixture.packageValidation,
  submission: {
    bundleDir: '/tmp/openpet/plugin-remote-source-submission-rehearsal/2026-06-18T00-30-00Z/submission-bundle',
    bundle: {
      ...pluginSubmissionBundleSummaryFixture,
      generatedAt: '2026-06-17T17:33:39.420Z',
      sourcePath: '/tmp/openpet/plugin-remote-source-submission-rehearsal/2026-06-18T00-30-00Z/packages/openpet.example.weather-status.openpet-plugin.zip',
      outputDir: '/tmp/openpet/plugin-remote-source-submission-rehearsal/2026-06-18T00-30-00Z/submission-bundle',
      files: {
        report: '/tmp/openpet/plugin-remote-source-submission-rehearsal/2026-06-18T00-30-00Z/submission-bundle/plugin-submission-report.md',
        pr: '/tmp/openpet/plugin-remote-source-submission-rehearsal/2026-06-18T00-30-00Z/submission-bundle/plugin-submission-pr.md',
        summary: '/tmp/openpet/plugin-remote-source-submission-rehearsal/2026-06-18T00-30-00Z/submission-bundle/plugin-submission-summary.json'
      }
    },
    bundleValidation: pluginRealWorldSubmissionRehearsalSummaryFixture.submission.bundleValidation
  },
  approval: {
    record: {
      ...pluginMaintainerApprovalRecordFixture,
      generatedAt: '2026-06-17T17:33:39.420Z',
      notes: 'Remote source archive, manifest, package hash, and submission artifacts reviewed.',
      sourceBundleDir: '/tmp/openpet/plugin-remote-source-submission-rehearsal/2026-06-18T00-30-00Z/submission-bundle',
      files: {
        markdown: '/tmp/openpet/plugin-remote-source-submission-rehearsal/2026-06-18T00-30-00Z/submission-bundle/plugin-maintainer-approval.md',
        json: '/tmp/openpet/plugin-remote-source-submission-rehearsal/2026-06-18T00-30-00Z/submission-bundle/plugin-maintainer-approval.json'
      }
    },
    validation: pluginRealWorldSubmissionRehearsalSummaryFixture.approval.validation
  },
  files: {
    readme: '/tmp/openpet/plugin-remote-source-submission-rehearsal/2026-06-18T00-30-00Z/README.md',
    checklist: '/tmp/openpet/plugin-remote-source-submission-rehearsal/2026-06-18T00-30-00Z/submission-checklist.md',
    commands: '/tmp/openpet/plugin-remote-source-submission-rehearsal/2026-06-18T00-30-00Z/commands.json',
    provenance: '/tmp/openpet/plugin-remote-source-submission-rehearsal/2026-06-18T00-30-00Z/source-provenance.json',
    summary: '/tmp/openpet/plugin-remote-source-submission-rehearsal/2026-06-18T00-30-00Z/plugin-remote-source-submission-rehearsal-summary.json'
  }
} satisfies PluginRemoteSourceSubmissionRehearsalSummary

const pluginCommunitySourceSubmissionEvidenceSummaryFixture = {
  generatedAt: '2026-06-18T18:30:00.000Z',
  outputDir: '/tmp/openpet/plugin-community-source-submission-evidence/2026-06-18T18-30-00Z',
  communitySource: {
    kind: 'community-source',
    url: 'https://example.test/community/submission/42',
    sourceLabel: 'community',
    sourceRelation: 'independent-third-party',
    submitter: 'Example Community Author',
    independenceNotes: 'Repository is maintained outside OpenPet and reviewed as a community source.'
  },
  communityEvidenceReady: true,
  sourceArchive: {
    ...pluginRemoteSourceSubmissionRehearsalSummaryFixture.sourceArchive,
    archiveUrl: 'https://example.test/community-plugin/archive.zip',
    finalUrl: 'https://example.test/community-plugin/archive.zip',
    archiveSha256: 'c'.repeat(64),
    archiveByteSize: 8192,
    pluginPath: 'plugin',
    archivePluginPath: 'community-plugin-main/plugin',
    archiveRootPrefix: 'community-plugin-main',
    downloadedAt: '2026-06-18T18:30:00.000Z'
  },
  sourcePlugin: pluginRealWorldSubmissionRehearsalSummaryFixture.sourcePlugin,
  sourceValidation: pluginRealWorldSubmissionRehearsalSummaryFixture.sourceValidation,
  packagePath: '/tmp/openpet/plugin-community-source-submission-evidence/2026-06-18T18-30-00Z/packages/openpet.example.weather-status.openpet-plugin.zip',
  packageValidation: pluginRealWorldSubmissionRehearsalSummaryFixture.packageValidation,
  submission: {
    bundleDir: '/tmp/openpet/plugin-community-source-submission-evidence/2026-06-18T18-30-00Z/submission-bundle',
    bundle: {
      ...pluginSubmissionBundleSummaryFixture,
      generatedAt: '2026-06-18T18:30:00.000Z',
      sourcePath: '/tmp/openpet/plugin-community-source-submission-evidence/2026-06-18T18-30-00Z/packages/openpet.example.weather-status.openpet-plugin.zip',
      outputDir: '/tmp/openpet/plugin-community-source-submission-evidence/2026-06-18T18-30-00Z/submission-bundle',
      files: {
        report: '/tmp/openpet/plugin-community-source-submission-evidence/2026-06-18T18-30-00Z/submission-bundle/plugin-submission-report.md',
        pr: '/tmp/openpet/plugin-community-source-submission-evidence/2026-06-18T18-30-00Z/submission-bundle/plugin-submission-pr.md',
        summary: '/tmp/openpet/plugin-community-source-submission-evidence/2026-06-18T18-30-00Z/submission-bundle/plugin-submission-summary.json'
      }
    },
    bundleValidation: pluginRealWorldSubmissionRehearsalSummaryFixture.submission.bundleValidation
  },
  approval: {
    record: {
      ...pluginMaintainerApprovalRecordFixture,
      generatedAt: '2026-06-18T18:30:00.000Z',
      notes: 'Community source archive, provenance, package hash, and submission artifacts reviewed.',
      sourceBundleDir: '/tmp/openpet/plugin-community-source-submission-evidence/2026-06-18T18-30-00Z/submission-bundle',
      files: {
        markdown: '/tmp/openpet/plugin-community-source-submission-evidence/2026-06-18T18-30-00Z/submission-bundle/plugin-maintainer-approval.md',
        json: '/tmp/openpet/plugin-community-source-submission-evidence/2026-06-18T18-30-00Z/submission-bundle/plugin-maintainer-approval.json'
      }
    },
    validation: pluginRealWorldSubmissionRehearsalSummaryFixture.approval.validation
  },
  remoteSourceRehearsal: {
    summary: '/tmp/openpet/plugin-community-source-submission-evidence/2026-06-18T18-30-00Z/plugin-remote-source-submission-rehearsal-summary.json',
    readme: '/tmp/openpet/plugin-community-source-submission-evidence/2026-06-18T18-30-00Z/README.remote-source.md',
    checklist: '/tmp/openpet/plugin-community-source-submission-evidence/2026-06-18T18-30-00Z/submission-checklist.remote-source.md',
    commands: '/tmp/openpet/plugin-community-source-submission-evidence/2026-06-18T18-30-00Z/commands.remote-source.json',
    provenance: '/tmp/openpet/plugin-community-source-submission-evidence/2026-06-18T18-30-00Z/source-provenance.json'
  },
  boundaries: [
    'Community-source evidence records provenance and review traceability only.',
    'Maintainer approval does not prove signing trust, catalog publication, runtime safety, or release readiness.',
    'Runtime smoke, cleanup readiness, signing, and catalog publication evidence must be collected separately.'
  ],
  files: {
    readme: '/tmp/openpet/plugin-community-source-submission-evidence/2026-06-18T18-30-00Z/README.md',
    checklist: '/tmp/openpet/plugin-community-source-submission-evidence/2026-06-18T18-30-00Z/community-source-checklist.md',
    commands: '/tmp/openpet/plugin-community-source-submission-evidence/2026-06-18T18-30-00Z/commands.json',
    communityEvidence: '/tmp/openpet/plugin-community-source-submission-evidence/2026-06-18T18-30-00Z/community-source-evidence.json',
    summary: '/tmp/openpet/plugin-community-source-submission-evidence/2026-06-18T18-30-00Z/plugin-community-source-submission-evidence-summary.json'
  }
} satisfies PluginCommunitySourceSubmissionEvidenceSummary

const pluginCommunitySourceInvitationSummaryFixture = {
  generatedAt: '2026-06-18T23:59:00.000Z',
  outputDir: '/tmp/openpet/plugin-community-source-invitation-kit/2026-06-18T23-59-00Z-compatible-author-outreach',
  status: 'invitation-draft-ready',
  nextAction: 'send-invitation-and-wait-for-compatible-plugin-json-package',
  contactState: 'not-sent',
  target: {
    author: 'OpenPet-compatible extension authors',
    url: 'https://github.com/dengyie/OpenPet'
  },
  candidateContext: 'Phase 104 discovery currently has no compatible public plugin.json source.',
  requestedCapabilities: ['weather', 'pet-action', 'pet-dialogue', 'pet-personality', 'creator-tools'],
  maintainer: 'OpenPet Maintainer',
  boundaries: [
    'Invitation kits are draft outreach materials only.',
    'Invitation kits do not prove an invitation was sent or accepted.',
    'Invitation kits do not prove OpenPet plugin compatibility.',
    'Invitation kits do not prove signing trust, catalog publication, runtime safety, or release readiness.',
    'A received package must still pass Phase 104 discovery, Phase 100 intake, Phase 103 bridge, Phase 99 evidence, and maintainer review.'
  ],
  files: {
    summary: '/tmp/openpet/plugin-community-source-invitation-kit/plugin-community-source-invitation-summary.json',
    readme: '/tmp/openpet/plugin-community-source-invitation-kit/README-community-source-invitation.md',
    message: '/tmp/openpet/plugin-community-source-invitation-kit/invitation-message.md',
    checklist: '/tmp/openpet/plugin-community-source-invitation-kit/invitation-checklist.md'
  }
} satisfies PluginCommunitySourceInvitationSummary

const macosReleaseEvidenceSummaryFixture = {
  generatedAt: '2026-06-18T02:00:00.000Z',
  ok: true,
  releaseReady: false,
  appPath: '/Users/mango/project/codex/OpenPet/release/mac-arm64/OpenPet.app',
  outputDir: '/tmp/openpet-macos-release-evidence',
  statuses: {
    codesign: 'pending',
    notarization: 'pass',
    gatekeeper: 'pending'
  },
  files: {
    codesign: '/tmp/openpet-macos-release-evidence/macos-codesign.txt',
    notarization: '/tmp/openpet-macos-release-evidence/macos-notarization.txt',
    gatekeeper: '/tmp/openpet-macos-release-evidence/macos-gatekeeper.txt',
    markdownSummary: '/tmp/openpet-macos-release-evidence/macos-release-evidence-summary.md',
    jsonSummary: '/tmp/openpet-macos-release-evidence/macos-release-evidence-summary.json'
  },
  evidenceFiles: [
    {
      role: 'macosCodesignEvidence',
      path: '/tmp/openpet-macos-release-evidence/macos-codesign.txt',
      exists: true,
      bytes: 64,
      sha256: '7'.repeat(64)
    },
    {
      role: 'macosNotarizationEvidence',
      path: '/tmp/openpet-macos-release-evidence/macos-notarization.txt',
      exists: true,
      bytes: 72,
      sha256: '8'.repeat(64)
    },
    {
      role: 'macosGatekeeperEvidence',
      path: '/tmp/openpet-macos-release-evidence/macos-gatekeeper.txt',
      exists: true,
      bytes: 96,
      sha256: '9'.repeat(64)
    }
  ],
  commands: [
    {
      command: 'codesign',
      args: ['--verify', '--deep', '--strict', '--verbose=2', '/Users/mango/project/codex/OpenPet/release/mac-arm64/OpenPet.app'],
      exitCode: 0,
      ok: true,
      stdout: '',
      stderr: 'OpenPet.app: valid on disk\nOpenPet.app: satisfies its Designated Requirement\n',
      content: '$ codesign --verify --deep --strict --verbose=2 /Users/mango/project/codex/OpenPet/release/mac-arm64/OpenPet.app\nOpenPet.app: valid on disk\nOpenPet.app: satisfies its Designated Requirement\n'
    }
  ],
  warnings: ['macOS evidence is archived but does not prove official signed release readiness']
} satisfies MacosReleaseEvidenceSummary

const macosReleaseEvidenceCommandFixture = macosReleaseEvidenceSummaryFixture.commands[0] satisfies MacosReleaseEvidenceCommand

const macosReleaseEvidenceArtifactArchiveManifestFixture = {
  generatedAt: '2026-06-18T03:00:00.000Z',
  ok: true,
  macosEvidenceReady: true,
  archive: {
    archiveDir: '/tmp/openpet-macos-release-evidence-archive',
    outputPath: '/tmp/openpet-macos-release-evidence-archive/macos-release-evidence-artifact-manifest.json'
  },
  source: {
    artifactDir: '/tmp/openpet-macos-release-evidence-download',
    artifactName: 'openpet-macos-release-evidence-v1.0.1-rc.2',
    releaseTag: 'v1.0.1-rc.2',
    workflowRunUrl: 'https://github.com/dengyie/OpenPet/actions/runs/123'
  },
  files: [
    {
      role: 'macosCodesignEvidence',
      fileName: 'macos-codesign.txt',
      sourcePath: '/tmp/openpet-macos-release-evidence-download/macos-codesign.txt',
      archivedPath: '/tmp/openpet-macos-release-evidence-archive/macos-codesign.txt',
      bytes: 64,
      sha256: 'a'.repeat(64),
      status: 'pass',
      releaseReady: true
    },
    {
      role: 'macosReleaseEvidenceJsonSummary',
      fileName: 'macos-release-evidence-summary.json',
      sourcePath: '/tmp/openpet-macos-release-evidence-download/macos-release-evidence-summary.json',
      archivedPath: '/tmp/openpet-macos-release-evidence-archive/macos-release-evidence-summary.json',
      bytes: 128,
      sha256: 'b'.repeat(64)
    }
  ],
  warnings: ['macOS evidence files look passing; official release readiness still requires release archive and signed closure validation']
} satisfies MacosReleaseEvidenceArtifactArchiveManifest

const desktopPickerEvidenceSummaryFixture = {
  generatedAt: '2026-06-17T00:00:00.000Z',
  requireSigned: true,
  ok: true,
  releaseReady: false,
  evidence: {
    evidenceDir: '/tmp/openpet-desktop-picker-evidence',
    presentFiles: [
      {
        file: 'environment.txt',
        path: '/tmp/openpet-desktop-picker-evidence/environment.txt',
        bytes: 96,
        sha256: 'b'.repeat(64)
      },
      {
        file: 'signature.txt',
        path: '/tmp/openpet-desktop-picker-evidence/signature.txt',
        bytes: 80,
        sha256: 'c'.repeat(64)
      }
    ],
    presentCount: 2
  },
  report: {
    reportPath: '/tmp/openpet-desktop-picker-evidence/desktop-picker-smoke-report.json',
    platform: 'darwin',
    arch: 'arm64',
    generatedAt: '2026-06-17T00:00:00.000Z',
    artifact: {
      version: '1.0.1-rc.2',
      appPath: 'release/mac-arm64/OpenPet.app',
      installer: 'OpenPet-1.0.1-rc.2-mac.dmg',
      zip: 'OpenPet-1.0.1-rc.2-mac.zip',
      latestYml: 'latest-mac.yml',
      signed: true,
      signatureStatus: 'Valid',
      authenticodeStatus: ''
    },
    fixtures: {
      pluginPackage: 'fixtures/focus-timer.openpet-plugin.zip',
      frameFolder: 'fixtures/wave-frames',
      petPack: 'fixtures/doro.pet-pack'
    },
    checks: {
      total: 9,
      present: 9,
      counts: {
        pass: 0,
        fail: 0,
        pending: 9,
        blocked: 0
      },
      byStatus: {
        pass: [],
        fail: [],
        pending: ['packaged-launch', 'control-center-open'],
        blocked: []
      }
    },
    structuralValidation: {
      ok: true,
      errors: [],
      warnings: [],
      summary: {
        passed: 0,
        total: 9,
        smokeReady: false,
        officialReady: false
      }
    },
    readinessValidation: {
      ok: false,
      errors: ['packaged-launch must pass before desktop picker smoke readiness can be claimed'],
      warnings: [],
      summary: {
        passed: 0,
        total: 9,
        smokeReady: false,
        officialReady: false
      }
    }
  },
  errors: [],
  warnings: ['Pending or unsigned evidence cannot prove signed official desktop picker readiness']
} satisfies DesktopPickerEvidenceSummary

const desktopPickerArchiveManifestFixture = {
  generatedAt: '2026-06-17T00:00:00.000Z',
  requireSigned: true,
  ok: true,
  releaseReady: false,
  archive: {
    archiveDir: '/tmp/openpet-desktop-picker-archive',
    outputPath: '/tmp/openpet-desktop-picker-archive/desktop-picker-archive-manifest.json'
  },
  files: [
    {
      role: 'report',
      path: '/tmp/openpet-desktop-picker-archive/desktop-picker-smoke-report.json',
      exists: true,
      bytes: 2048,
      sha256: 'd'.repeat(64)
    },
    {
      role: 'runbook',
      path: '/tmp/openpet-desktop-picker-archive/desktop-picker-smoke-runbook.md',
      exists: true,
      bytes: 1024,
      sha256: 'e'.repeat(64)
    },
    {
      role: 'summary',
      path: '/tmp/openpet-desktop-picker-archive/desktop-picker-evidence-summary.md',
      exists: true,
      bytes: 1024,
      sha256: 'f'.repeat(64)
    }
  ],
  evidence: {
    evidenceDir: '/tmp/openpet-desktop-picker-archive/desktop-picker-evidence',
    ok: true,
    files: desktopPickerEvidenceSummaryFixture.evidence.presentFiles
  },
  summary: {
    path: '/tmp/openpet-desktop-picker-archive/desktop-picker-evidence-summary.md',
    format: 'markdown',
    matchesComputedSummary: true
  },
  report: {
    path: desktopPickerEvidenceSummaryFixture.report.reportPath,
    platform: desktopPickerEvidenceSummaryFixture.report.platform,
    arch: desktopPickerEvidenceSummaryFixture.report.arch,
    generatedAt: desktopPickerEvidenceSummaryFixture.report.generatedAt,
    structuralValidation: desktopPickerEvidenceSummaryFixture.report.structuralValidation,
    readinessValidation: desktopPickerEvidenceSummaryFixture.report.readinessValidation
  },
  errors: [],
  warnings: ['evidence: Pending or unsigned evidence cannot prove signed official desktop picker readiness']
} satisfies DesktopPickerArchiveManifest

const desktopPickerSmokeReportFixture = {
  platform: 'darwin',
  arch: 'arm64',
  generatedAt: '2026-06-15T00:00:00.000Z',
  source: 'scripts/create-desktop-picker-smoke-report.js',
  environment: {
    osRelease: '25.5.0',
    machine: 'mac-smoke-host',
    runner: '',
    evidence: ''
  },
  artifact: {
    version: '1.0.1-rc.2',
    releaseDir: '/Users/mango/project/codex/OpenPet/release',
    appPath: 'mac-arm64/OpenPet.app',
    installer: 'OpenPet-1.0.1-rc.1-mac.dmg',
    zip: 'OpenPet-1.0.1-rc.1-mac.zip',
    latestYml: 'latest-mac.yml',
    files: [
      {
        name: 'mac-arm64/OpenPet.app',
        size: 96
      },
      {
        name: 'OpenPet-1.0.1-rc.1-mac.dmg',
        size: 3
      }
    ],
    signed: true,
    signatureStatus: 'Valid',
    signatureEvidence: 'OpenPet.app: valid on disk\nOpenPet.app: satisfies its Designated Requirement'
  },
  fixture: {
    pluginPackage: 'Use a valid .openpet-plugin.zip fixture with a signature.json hash metadata file.',
    frameFolder: 'Use a folder containing ordered transparent PNG frames.',
    petPack: 'Use a valid pet pack directory with pet.json and sprite assets.'
  },
  checks: [
    {
      id: 'packaged-launch',
      status: 'pending',
      evidence: '',
      notes: 'Launch packaged OpenPet and keep it running. Fill with evidence from a real packaged-app native picker smoke validation run.'
    },
    {
      id: 'invalid-package-feedback',
      status: 'pending',
      evidence: '',
      notes: 'Invalid plugin or pet package shows a visible error from the packaged app. Fill with evidence from a real packaged-app native picker smoke validation run.'
    }
  ]
} satisfies DesktopPickerSmokeReport

const windowsSmokeEvidenceSummaryFixture = {
  generatedAt: '2026-06-14T00:00:00.000Z',
  requireSigned: true,
  ok: true,
  releaseReady: false,
  evidence: {
    evidenceDir: '/tmp/openpet-windows-smoke/windows-smoke-evidence',
    requiredFiles: [
      'environment.txt',
      'authenticode.txt',
      'process.txt',
      'install-registry.txt',
      'manual-checks.md',
      'update-report-commands.md'
    ],
    presentFiles: [
      {
        file: 'environment.txt',
        bytes: 128,
        sha256: 'c'.repeat(64)
      },
      {
        file: 'authenticode.txt',
        bytes: 64,
        sha256: 'd'.repeat(64)
      }
    ],
    presentCount: 2,
    requiredCount: 6,
    signed: true
  },
  report: {
    reportPath: '/tmp/openpet-windows-smoke/windows-smoke-report.json',
    platform: 'win32',
    arch: 'x64',
    generatedAt: '2026-06-14T00:00:00.000Z',
    artifact: {
      version: '1.0.1-rc.1',
      installer: 'OpenPet-1.0.1-rc.1-win32-x64.exe',
      zip: 'OpenPet-1.0.1-rc.1-win32-x64.zip',
      latestYml: 'latest.yml',
      signed: true,
      authenticodeStatus: 'Valid'
    },
    checks: {
      total: 13,
      present: 13,
      counts: {
        pass: 0,
        fail: 0,
        pending: 13,
        blocked: 0
      },
      byStatus: {
        pass: [],
        fail: [],
        pending: ['launch', 'transparent-window'],
        blocked: []
      }
    },
    structuralValidation: {
      ok: true,
      errors: [],
      warnings: [],
      summary: {
        passed: 0,
        total: 13,
        smokeReady: false,
        officialReady: false
      }
    },
    readinessValidation: {
      ok: false,
      errors: ['launch must pass before Windows smoke readiness can be claimed'],
      warnings: [],
      summary: {
        passed: 0,
        total: 13,
        smokeReady: false,
        officialReady: false
      }
    }
  },
  errors: [],
  warnings: ['Authenticode evidence is present, but pending smoke checks still cannot prove signed official readiness.']
} satisfies WindowsSmokeEvidenceSummary

const windowsSmokeArchiveManifestFixture = {
  generatedAt: '2026-06-14T00:00:00.000Z',
  requireSigned: true,
  ok: true,
  releaseReady: false,
  archive: {
    archiveDir: '/tmp/openpet-windows-smoke-archive',
    outputPath: '/tmp/openpet-windows-smoke-archive/windows-smoke-archive-manifest.json'
  },
  files: [
    {
      role: 'report',
      path: '/tmp/openpet-windows-smoke-archive/windows-smoke-report.json',
      exists: true,
      bytes: 2048,
      sha256: 'e'.repeat(64)
    },
    {
      role: 'summary',
      path: '/tmp/openpet-windows-smoke-archive/windows-smoke-evidence-summary.md',
      exists: true,
      bytes: 1024,
      sha256: 'f'.repeat(64)
    }
  ],
  evidence: {
    evidenceDir: '/tmp/openpet-windows-smoke-archive/windows-smoke-evidence',
    ok: true,
    files: windowsSmokeEvidenceSummaryFixture.evidence.presentFiles,
    signed: true
  },
  summary: {
    path: '/tmp/openpet-windows-smoke-archive/windows-smoke-evidence-summary.md',
    format: 'markdown',
    matchesComputedSummary: true
  },
  report: {
    path: windowsSmokeEvidenceSummaryFixture.report.reportPath,
    platform: windowsSmokeEvidenceSummaryFixture.report.platform,
    arch: windowsSmokeEvidenceSummaryFixture.report.arch,
    generatedAt: windowsSmokeEvidenceSummaryFixture.report.generatedAt,
    structuralValidation: windowsSmokeEvidenceSummaryFixture.report.structuralValidation,
    readinessValidation: windowsSmokeEvidenceSummaryFixture.report.readinessValidation
  },
  errors: [],
  warnings: ['summary: Pending or unsigned evidence does not prove Windows release readiness; a real Windows smoke report must pass readiness validation, and official stable releases must also pass signed Authenticode validation.']
} satisfies WindowsSmokeArchiveManifest

const windowsSmokeReportFixture = {
  platform: 'win32',
  arch: 'x64',
  generatedAt: '2026-06-14T00:00:00.000Z',
  source: 'scripts/create-windows-smoke-report.js',
  environment: {
    windowsVersion: 'Windows 10.0.22631',
    machine: 'windows-smoke-vm',
    runner: 'GitHub Actions 1',
    evidence: 'https://github.com/dengyie/OpenPet/actions/runs/12345'
  },
  artifact: {
    version: '1.0.1-rc.2',
    installer: 'OpenPet-1.0.1-rc.1-win32-x64-unsigned.exe',
    zip: 'OpenPet-1.0.1-rc.1-win32-x64-unsigned.zip',
    latestYml: 'latest.yml',
    blockmaps: ['OpenPet-1.0.1-rc.1-win32-x64.exe-unsigned.blockmap'],
    files: [
      {
        name: 'OpenPet-1.0.1-rc.1-win32-x64-unsigned.exe',
        size: 9
      },
      {
        name: 'latest.yml',
        size: 48
      }
    ],
    signed: false,
    authenticodeStatus: 'NotSigned',
    authenticodeEvidence: 'Status                 : NotSigned'
  },
  checks: [
    {
      id: 'launch',
      status: 'pending',
      evidence: '',
      notes: 'Launch the installed or unpacked Windows app successfully. Fill with evidence from a real Windows smoke validation run.'
    },
    {
      id: 'transparent-window',
      status: 'pending',
      evidence: '',
      notes: 'Pet window renders transparently with the pet visible. Fill with evidence from a real Windows smoke validation run.'
    }
  ]
} satisfies WindowsSmokeReport

const packagedRuntimeSmokeEvidenceFixture = {
  schemaVersion: 1,
  sessionId: '2026-06-16T14-52-13-074Z-darwin-arm64',
  generatedAt: '2026-06-16T14:52:15.961Z',
  appPath: '/Users/mango/project/codex/OpenPet/release/mac-arm64/OpenPet.app',
  state: {
    launch: {
      ok: true,
      pid: 52549
    },
    window: {
      ok: true,
      visible: true,
      focused: true,
      bounds: {
        x: 1130,
        y: 539,
        width: 300,
        height: 300
      },
      transparent: true,
      alwaysOnTop: true
    },
    renderer: {
      ok: true,
      bodyBackground: 'rgba(0, 0, 0, 0)',
      htmlBackground: 'rgba(0, 0, 0, 0)',
      transparentBackground: true,
      sprite: {
        visible: true,
        width: 260,
        height: 173,
        backgroundImage: 'url("file:///Users/mango/project/codex/OpenPet/release/mac-arm64/OpenPet.app/Contents/Resources/app.asar/cat_anime/sprites/eat_no_bg.png")'
      },
      legacyInlineBubble: {
        present: true,
        visible: false,
        text: ''
      },
      bubbleChat: {
        visible: true,
        hasWindow: true,
        text: '喂食',
        source: 'packaged-runtime-smoke',
        screenshotPath: '/tmp/openpet-release-evidence/screenshots/packaged-runtime-bubble-chat.png'
      },
      action: {
        current: '',
        firstPosition: '-780px',
        secondPosition: '-1560px',
        advanced: true,
        requested: 'eat_no_bg'
      }
    },
    packs: [
      {
        id: 'legacy-cat',
        ok: true,
        actionCount: 2,
        defaultAction: 'bai_no_bg',
        spriteVisible: true,
        spriteSize: {
          width: 110,
          height: 260
        }
      },
      {
        id: 'doro',
        ok: true,
        actionCount: 9,
        defaultAction: 'idle',
        spriteVisible: true,
        spriteSize: {
          width: 192,
          height: 208
        }
      }
    ],
    invalidPackage: {
      status: 'blocked',
      notes: 'Native picker invalid-package path requires a paired desktop picker smoke report.'
    },
    finalState: {
      ok: true,
      activePackId: 'legacy-cat'
    }
  },
  screenshotPath: '/Users/mango/project/codex/OpenPet/docs/release-evidence/packaged-runtime/2026-06-16T14-52-13-074Z-darwin-arm64/screenshots/packaged-runtime.png'
} satisfies PackagedRuntimeSmokeEvidence

const packagedRuntimeSmokeReportFixture = {
  platform: 'darwin',
  arch: 'arm64',
  generatedAt: '2026-06-16T14:52:13.073Z',
  source: 'scripts/create-packaged-runtime-smoke-report.js',
  environment: {
    osRelease: '25.5.0',
    machine: 'mangodeMacBook-Air.local',
    runner: '',
    evidence: ''
  },
  artifact: {
    version: '1.0.1-rc.2',
    releaseDir: '/Users/mango/project/codex/OpenPet/release',
    appPath: 'mac-arm64/OpenPet.app',
    installer: 'OpenPet-1.0.1-rc.2-mac-arm64.dmg',
    zip: 'OpenPet-1.0.1-rc.2-mac-arm64.zip',
    latestYml: 'latest-mac.yml',
    files: [
      {
        name: 'mac-arm64/OpenPet.app',
        size: 96
      },
      {
        name: 'OpenPet-1.0.1-rc.2-mac-arm64.dmg',
        size: 134799501
      }
    ],
    signed: false,
    signatureStatus: 'Unknown',
    signatureEvidence: '/Users/mango/project/codex/OpenPet/release/mac-arm64/OpenPet.app: code has no resources but signature indicates they must be present'
  },
  fixtures: {
    builtInPacks: {
      'legacy-cat': 'cat_anime/',
      doro: 'assets/pet-packs/doro/',
      duodong: 'assets/pet-packs/duodong/',
      chispa: 'assets/pet-packs/chispa/'
    },
    pluginPackage: 'Use a valid .openpet-plugin.zip fixture.',
    petPackZip: 'Use a valid .codex-pet.zip or .openpet-pet.zip fixture.',
    invalidPackage: 'Use a deliberately invalid plugin or pet package fixture.'
  },
  linkedEvidence: {
    desktopPickerSmokeReport: '',
    desktopPickerSmokeRunbook: '',
    screenshots: [
      '/Users/mango/project/codex/OpenPet/docs/release-evidence/packaged-runtime/2026-06-16T14-52-13-074Z-darwin-arm64/screenshots/packaged-runtime.png'
    ],
    recordings: []
  },
  checks: [
    {
      id: 'packaged-launch',
      status: 'pass',
      evidence: 'session 2026-06-16T14-52-13-074Z-darwin-arm64 for /Users/mango/project/codex/OpenPet/release/mac-arm64/OpenPet.app; launched with pid 52549',
      notes: 'Packaged app launched under runtime smoke mode.'
    },
    {
      id: 'pet-window-created',
      status: 'pass',
      evidence: 'Pet BrowserWindow visible=true bounds={"x":1130,"y":539,"width":300,"height":300}',
      notes: 'Main process observed the packaged pet window.'
    },
    {
      id: 'plugin-picker-evidence-linked',
      status: 'pending',
      evidence: '',
      notes: 'Native plugin picker evidence must come from a paired desktop picker smoke report.'
    },
    {
      id: 'invalid-package-feedback',
      status: 'blocked',
      evidence: '',
      notes: 'Native picker invalid-package path requires a paired desktop picker smoke report.'
    }
  ]
} satisfies PackagedRuntimeSmokeReport

const packagedPluginCleanupRuntimeArtifactFixture = {
  schemaVersion: 1,
  generatedAt: '2026-06-18T19:00:00.000Z',
  pluginId: 'openpet.cleanup-evidence-fixture',
  hostApp: 'OpenPet.app',
  setup: {
    requested: true,
    stopRequested: true,
    exitConfirmed: true,
    treeCleanupAttempted: false,
    transcriptPath: '/tmp/openpet-packaged-cleanup/setup.txt'
  },
  command: {
    requested: true,
    stopRequested: true,
    exitConfirmed: true,
    treeCleanupAttempted: false,
    transcriptPath: '/tmp/openpet-packaged-cleanup/command.txt'
  },
  service: {
    requested: true,
    stopRequested: true,
    exitConfirmed: true,
    processGroupCleanupAttempted: true,
    treeCleanupAttempted: false,
    forceStopAttempted: false,
    transcriptPath: '/tmp/openpet-packaged-cleanup/service.txt'
  },
  logPath: '/tmp/openpet-packaged-cleanup/packaged-plugin-cleanup-logs.json'
} satisfies PackagedPluginCleanupRuntimeArtifact

const packagedPluginCleanupEvidenceRunResultFixture = {
  ok: true,
  archiveDir: '/tmp/openpet-packaged-cleanup',
  reportPath: '/tmp/openpet-packaged-cleanup/plugin-cleanup-evidence-report.json',
  collectorPath: '/tmp/openpet-packaged-cleanup/plugin-cleanup-evidence-collector.sh',
  evidenceDir: '/tmp/openpet-packaged-cleanup/plugin-cleanup-evidence-collected',
  manifestPath: '/tmp/openpet-packaged-cleanup/plugin-cleanup-evidence-archive-manifest.json',
  runtimeArtifactPath: '/tmp/openpet-packaged-cleanup/packaged-plugin-cleanup-runtime.json',
  updatedReport: pluginCleanupEvidenceChecklistFixture,
  reportValidation: {
    ok: true,
    errors: [],
    warnings: [],
    summary: {
      passed: 7,
      total: 8,
      cleanupReady: false
    }
  },
  manifest: pluginCleanupEvidenceArchiveManifestFixture,
  errors: []
} satisfies PackagedPluginCleanupEvidenceRunResult

const releaseArchiveFixture = {
  generatedAt: '2026-06-17T00:00:00.000Z',
  archiveDir: '/tmp/openpet-release-evidence',
  releaseReady: false,
  files: [
    {
      path: 'signed-release-closure-report.json',
      sha256: 'b'.repeat(64),
      byteSize: 1024
    }
  ],
  blockers: ['Windows signed smoke evidence is missing.']
} satisfies ReleaseEvidenceArchiveSummary

const releaseArchiveFileFixture = {
  role: 'windowsSmokeReport',
  path: '/tmp/openpet-release-evidence/windows-smoke-report.json',
  exists: true,
  bytes: 4096,
  sha256: 'c'.repeat(64)
}

const releaseArchiveReportSectionFixture = {
  file: releaseArchiveFileFixture,
  report: {
    platform: 'win32',
    arch: 'x64',
    generatedAt: releaseArchiveFixture.generatedAt,
    artifact: {
      installer: 'OpenPet Setup.exe'
    },
    linkedEvidence: {
      desktopPickerSmokeReport: '/tmp/openpet-release-evidence/desktop-picker-smoke-report.json',
      desktopPickerSmokeRunbook: '/tmp/openpet-release-evidence/desktop-picker-smoke-runbook.md',
      screenshots: ['/tmp/openpet-release-evidence/screenshots/runtime.png'],
      recordings: []
    }
  },
  structuralValidation: {
    ok: true,
    errors: [],
    warnings: [],
    summary: {
      officialReady: false
    }
  },
  readinessValidation: {
    ok: false,
    errors: ['windows smoke evidence is pending'],
    warnings: [],
    summary: {
      officialReady: false
    }
  },
  releaseReady: false,
  errors: [],
  warnings: ['windowsSmokeReport is archived but not release-ready']
}

const releaseArchiveManifestFixture = {
  generatedAt: releaseArchiveFixture.generatedAt,
  requireSigned: true,
  ok: false,
  releaseReady: false,
  archive: {
    archiveDir: releaseArchiveFixture.archiveDir,
    outputPath: '/tmp/openpet-release-evidence/release-evidence-archive-manifest.json'
  },
  files: [
    releaseArchiveFileFixture,
    {
      role: 'macosCodesignEvidence',
      path: '/tmp/openpet-release-evidence/macos-codesign.txt',
      exists: false,
      bytes: 0,
      sha256: ''
    }
  ],
  macos: {
    releaseReady: false,
    codesign: {
      status: 'missing',
      file: {
        role: 'macosCodesignEvidence',
        path: '/tmp/openpet-release-evidence/macos-codesign.txt',
        exists: false,
        bytes: 0,
        sha256: ''
      }
    },
    notarization: {
      status: 'pending',
      file: {
        role: 'macosNotarizationEvidence',
        path: '/tmp/openpet-release-evidence/macos-notarization.txt',
        exists: true,
        bytes: 128,
        sha256: 'd'.repeat(64)
      }
    },
    gatekeeper: {
      status: 'pass',
      file: {
        role: 'macosGatekeeperEvidence',
        path: '/tmp/openpet-release-evidence/macos-gatekeeper.txt',
        exists: true,
        bytes: 128,
        sha256: 'e'.repeat(64)
      }
    }
  },
  reports: {
    releaseReady: false,
    windowsSmoke: releaseArchiveReportSectionFixture,
    desktopPicker: {
      ...releaseArchiveReportSectionFixture,
      file: {
        role: 'desktopPickerReport',
        path: '/tmp/openpet-release-evidence/desktop-picker-smoke-report.json',
        exists: true,
        bytes: 2048,
        sha256: 'f'.repeat(64)
      },
      report: {
        ...releaseArchiveReportSectionFixture.report,
        platform: 'darwin'
      }
    },
    packagedRuntime: {
      ...releaseArchiveReportSectionFixture,
      file: {
        role: 'packagedRuntimeReport',
        path: '/tmp/openpet-release-evidence/packaged-runtime-smoke-report.json',
        exists: true,
        bytes: 2048,
        sha256: '1'.repeat(64)
      },
      report: {
        ...releaseArchiveReportSectionFixture.report,
        platform: 'darwin',
        artifact: {
          appBundle: 'OpenPet.app'
        }
      }
    }
  },
  archives: {
    releaseReady: false,
    windowsSmoke: {
      file: {
        role: 'windowsSmokeArchiveManifest',
        path: '/tmp/openpet-release-evidence/windows-smoke-archive-manifest.json',
        exists: true,
        bytes: 1024,
        sha256: '3'.repeat(64)
      },
      path: '/tmp/openpet-release-evidence/windows-smoke-archive-manifest.json',
      archiveDir: '/tmp/openpet-release-evidence',
      outputPath: '/tmp/openpet-release-evidence/windows-smoke-archive-manifest.json',
      ok: true,
      releaseReady: false,
      reportPath: '/tmp/openpet-release-evidence/windows-smoke-report.json',
      reportSha256: releaseArchiveReportSectionFixture.file.sha256,
      summaryPath: '/tmp/openpet-release-evidence/windows-smoke-evidence-summary.md',
      matchesReport: true,
      errors: [],
      warnings: ['windowsSmokeArchiveManifest is archived but not release-ready']
    },
    desktopPicker: {
      file: {
        role: 'desktopPickerArchiveManifest',
        path: '/tmp/openpet-release-evidence/desktop-picker-archive-manifest.json',
        exists: true,
        bytes: 1024,
        sha256: '2'.repeat(64)
      },
      path: '/tmp/openpet-release-evidence/desktop-picker-archive-manifest.json',
      archiveDir: '/tmp/openpet-release-evidence',
      outputPath: '/tmp/openpet-release-evidence/desktop-picker-archive-manifest.json',
      ok: true,
      releaseReady: false,
      reportPath: '/tmp/openpet-release-evidence/desktop-picker-smoke-report.json',
      reportSha256: 'f'.repeat(64),
      summaryPath: '/tmp/openpet-release-evidence/desktop-picker-evidence-summary.md',
      matchesReport: true,
      errors: [],
      warnings: ['desktopPickerArchiveManifest is archived but not release-ready']
    }
  },
  errors: ['missing macOS codesign evidence'],
  warnings: ['packagedRuntimeReport is archived but not release-ready']
} satisfies ReleaseEvidenceArchiveManifest

const signedReleaseClosureReportFixture = {
  schemaVersion: 1,
  generatedAt: releaseArchiveFixture.generatedAt,
  releaseReady: false,
  manifest: {
    ok: releaseArchiveManifestFixture.ok,
    releaseReady: releaseArchiveManifestFixture.releaseReady,
    requireSigned: releaseArchiveManifestFixture.requireSigned,
    archiveDir: releaseArchiveManifestFixture.archive.archiveDir,
    outputPath: releaseArchiveManifestFixture.archive.outputPath
  },
  claims: {
    officialDesktopRelease: {
      key: 'officialDesktopRelease',
      status: 'not-ready',
      claim: 'Do not claim official signed desktop release readiness for this evidence set.',
      blockers: releaseArchiveManifestFixture.errors
    },
    macos: {
      key: 'macos',
      status: 'not-ready',
      claim: 'Do not claim macOS signed release readiness for this archived artifact.',
      blockers: ['macOS codesign evidence is missing']
    },
    windows: {
      key: 'windows',
      status: 'not-ready',
      claim: 'Do not claim Windows release readiness for this archived artifact.',
      blockers: ['Windows packaged runtime evidence platform is not win32']
    }
  },
  smartScreen: {
    status: 'not-proven',
    claim: 'SmartScreen reputation must be documented as an observed result only; Authenticode and smoke evidence do not prove reputation trust.'
  },
  nextActions: ['Capture signed macOS and Windows evidence before changing release wording.']
} satisfies SignedReleaseClosureReport

const signedReleaseClaimFixture = {
  generatedAt: releaseArchiveFixture.generatedAt,
  officialDesktopReleaseReady: false,
  macosReleaseReady: false,
  windowsReleaseReady: false,
  blockers: releaseArchiveFixture.blockers
} satisfies SignedReleaseClaimSummary

export {
  catalogSelectionFixture,
  pluginReviewFixture,
  pluginSubmissionBundleSummaryFixture,
  pluginMaintainerApprovalRecordFixture,
  pluginRealWorldSubmissionRehearsalSummaryFixture,
  pluginRemoteSourceSubmissionRehearsalSummaryFixture,
  pluginCommunitySourceSubmissionEvidenceSummaryFixture,
  pluginCommunitySourceInvitationSummaryFixture,
  pluginSetupRunFixture,
  releaseArchiveManifestFixture,
  releaseArchiveFixture,
  signedReleaseClosureReportFixture,
  signedReleaseClaimFixture
}
