import type {
  CatalogInstallSelection,
  PluginPackageReviewViewState,
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
    commands: [{ id: 'run', title: 'Run' }]
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
  releaseArchiveManifestFixture,
  releaseArchiveFixture,
  signedReleaseClosureReportFixture,
  signedReleaseClaimFixture
}
