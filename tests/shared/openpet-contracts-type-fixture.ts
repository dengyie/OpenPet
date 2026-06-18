import type {
  CatalogInstallSelection,
  CreatorActionsMutationResult,
  CreatorActionsReadResponse,
  CreatorAssetsImportFramesRequest,
  CreatorAssetsImportFramesResponse,
  CreatorAssetsInspectFramesRequest,
  CreatorAssetsInspectFramesResponse,
  CreatorPackManifestMutationRequest,
  CreatorPackManifestMutationResult,
  CreatorPackManifestReadResponse,
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
