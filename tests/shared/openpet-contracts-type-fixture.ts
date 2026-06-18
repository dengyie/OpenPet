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
  SignedReleaseClaimSummary
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
