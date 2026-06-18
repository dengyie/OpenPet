import type {
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
  DesktopPickerArchiveManifest,
  DesktopPickerSmokeReport,
  DesktopPickerEvidenceSummary,
  MacosReleaseEvidenceArtifactArchiveManifest,
  MacosReleaseEvidenceCommand,
  MacosReleaseEvidenceSummary,
  PackagedRuntimeSmokeEvidence,
  PackagedRuntimeSmokeReport,
  PluginCleanupEvidenceArchiveManifest,
  PluginCleanupEvidenceChecklistReport,
  PluginCleanupEvidenceCollectorRun,
  PluginCleanupEvidenceReport,
  PluginCleanupEvidenceRunResult,
  PluginCommandRunResultViewState,
  PluginPackageReviewViewState,
  PluginSetupRunResultViewState,
  ReleaseEvidenceArchiveManifest,
  ReleaseEvidenceArchiveSummary,
  SignedReleaseClosureReport,
  SignedReleaseClaimSummary,
  WindowsSmokeArchiveManifest,
  WindowsSmokeEvidenceSummary
} from '../../src/shared/openpet-contracts'

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
      actions: [
        { id: 'idle', label: 'Idle', sprite: 'file:///packs/cat/sprites/idle.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 },
        { id: 'wave', label: 'Wave Updated', sprite: 'file:///packs/cat/sprites/wave.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 }
      ]
    }
  },
  actions: {
    defaultAction: 'idle',
    clickAction: 'wave',
    actions: [
      { id: 'idle', label: 'Idle', sprite: 'file:///packs/cat/sprites/idle.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 },
      { id: 'wave', label: 'Wave Updated', sprite: 'file:///packs/cat/sprites/wave.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 }
    ]
  }
} satisfies CreatorActionsMutationResult

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
      bubble: {
        visible: true,
        text: '喂食'
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
  pluginSetupRunFixture,
  releaseArchiveManifestFixture,
  releaseArchiveFixture,
  signedReleaseClosureReportFixture,
  signedReleaseClaimFixture
}
