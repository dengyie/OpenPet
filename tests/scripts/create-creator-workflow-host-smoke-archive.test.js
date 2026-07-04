const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  createCreatorWorkflowHostSmokeArchive,
  createReadme,
  parseArgs
} = require('../../scripts/create-creator-workflow-host-smoke-archive')

const fixedNow = () => new Date('2026-07-05T10:00:00.000Z')

const createSessionFixture = ({
  sessionId = '2026-07-04T21-38-29-834Z',
  reportMutator = null
} = {}) => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-workflow-host-smoke-archive-'))
  const sessionDir = path.join(rootDir, sessionId)
  fs.mkdirSync(sessionDir, { recursive: true })

  const report = {
    ok: true,
    schemaVersion: 1,
    evidenceType: 'creator-workflow-host-smoke',
    generatedAt: '2026-07-04T21:41:56.554Z',
    claimBoundary: 'Validates the real host-owned creator workflow through provider generation plus import/apply handoff.',
    sessionId,
    sessionDir: `/Users/mango/.codex/worktrees/3c34/OpenPet/release/creator-workflow-host-smoke/${sessionId}`,
    reportPath: `/Users/mango/.codex/worktrees/3c34/OpenPet/release/creator-workflow-host-smoke/${sessionId}/creator-workflow-host-smoke-report.json`,
    sourceUserDataDir: '/Users/mango/Library/Application Support/ibot',
    referenceImagePath: '/Users/mango/Downloads/正面.png',
    scenarios: [
      {
        scenario: 'new-character',
        ok: true,
        durationMs: 114453,
        providerAfter: {
          ready: true,
          code: 'provider_healthy',
          provider: 'openai-compatible',
          model: 'gpt-image-2'
        },
        result: {
          state: 'completed',
          code: 'pet_imported',
          message: '角色 smoke-mango-cat 已生成、导入并激活',
          run: {
            mode: 'full-pet',
            runId: '2026-07-04-smoke-mango-cat',
            importedPackId: 'smoke-mango-cat',
            activatedPackId: 'smoke-mango-cat'
          },
          basicActions: {
            requiredRealActionIds: ['idle', 'waving'],
            realActionIds: ['idle', 'waving'],
            fallbackActionIds: ['waiting'],
            missingRequiredActionIds: []
          },
          diagnostics: {
            conditioning: {
              mode: 'image-edit',
              endpoint: '/images/edits',
              referenceImageCount: 1,
              referenceFileNames: ['canonical-reference.png']
            }
          }
        },
        verification: {
          ok: true,
          message: 'Imported pet pack smoke-mango-cat exists in isolated userData. Reference conditioning recorded 1 image input(s) through /images/edits.'
        },
        seededSettingsSummary: {
          model: 'gpt-image-2'
        }
      },
      {
        scenario: 'existing-action',
        ok: true,
        durationMs: 92178,
        providerAfter: {
          ready: true,
          code: 'provider_healthy',
          provider: 'openai-compatible',
          model: 'gpt-image-2'
        },
        result: {
          state: 'completed',
          code: 'action_imported',
          message: '动作 smoke-wave 已生成并导入',
          run: {
            mode: 'single-action',
            runId: '2026-07-04-legacy-editable-host',
            importedActionId: 'smoke-wave'
          },
          clickActionChange: {
            previousActionId: 'eat_no_bg',
            currentActionId: 'smoke-wave',
            importedActionId: 'smoke-wave',
            canRestore: true
          },
          diagnostics: {
            conditioning: {
              mode: 'image-edit',
              endpoint: '/images/edits',
              referenceImageCount: 1,
              referenceFileNames: ['canonical-reference.png']
            }
          }
        },
        verification: {
          ok: true,
          message: 'Imported action smoke-wave exists in isolated editable workspace. Reference conditioning recorded 1 image input(s) through /images/edits.'
        },
        seededSettingsSummary: {
          model: 'gpt-image-2'
        }
      }
    ],
    errors: []
  }

  if (typeof reportMutator === 'function') reportMutator(report)
  fs.writeFileSync(path.join(sessionDir, 'creator-workflow-host-smoke-report.json'), `${JSON.stringify(report, null, 2)}\n`)
  return { rootDir, sessionDir, report }
}

test('parseArgs accepts archive inputs and flags', () => {
  const options = parseArgs([
    '--session-dir', 'release/session',
    '--archive-dir', 'docs/archive',
    '--output', 'docs/archive/result.json',
    '--json'
  ])

  assert.equal(options.sessionDir, 'release/session')
  assert.equal(options.archiveDir, 'docs/archive')
  assert.equal(options.outputPath, 'docs/archive/result.json')
  assert.equal(options.json, true)
})

test('parseArgs rejects missing and unexpected arguments', () => {
  assert.throws(() => parseArgs([]), /--session-dir is required/)
  assert.throws(() => parseArgs(['--session-dir']), /--session-dir requires a value/)
  assert.throws(() => parseArgs(['--wat']), /Unexpected argument/)
})

test('createReadme preserves branch-level claim boundary', () => {
  const { report } = createSessionFixture()
  const archiveResult = {
    sourceSummary: {
      sessionDir: 'release/creator-workflow-host-smoke/2026-07-04T21-38-29-834Z'
    },
    referenceImage: {
      path: '[redacted-local-reference]/正面.png'
    },
    scenarios: [{
      scenario: 'new-character',
      ok: true,
      durationMs: 114453,
      workflow: {
        activatedPackId: 'smoke-mango-cat'
      },
      conditioning: {
        mode: 'image-edit',
        endpoint: '/images/edits',
        referenceImageCount: 1
      }
    }],
    archive: {
      outputPath: 'docs/release-evidence/creator-workflow-host-smoke/2026-07-04T21-38-29-834Z-dev8-acceptance/creator-workflow-host-smoke-result.json'
    }
  }

  const readme = createReadme({
    report,
    archiveResult,
    archiveDir: '/tmp/archive'
  })

  assert.match(readme, /Creator Workflow Host Smoke Evidence/)
  assert.match(readme, /does not by itself prove/i)
  assert.match(readme, /main-branch acceptance remains required/i)
  assert.match(readme, /npm run smoke:creator-workflow-host/)
  assert.match(readme, /create-creator-workflow-host-smoke-archive\.js/)
})

test('createCreatorWorkflowHostSmokeArchive writes a sanitized archive result and README', () => {
  const { rootDir, sessionDir } = createSessionFixture()
  const archiveDir = path.join(rootDir, 'archive', '2026-07-04T21-38-29-834Z-dev8-acceptance')

  const result = createCreatorWorkflowHostSmokeArchive({
    sessionDir,
    archiveDir,
    now: fixedNow
  })

  assert.equal(result.ok, true)
  assert.equal(result.archive.sessionId, '2026-07-04T21-38-29-834Z')
  assert.equal(result.referenceImage.fileName, '正面.png')
  assert.equal(result.scenarios.length, 2)
  assert.equal(result.scenarios[0].provider.model, 'gpt-image-2')
  assert.equal(result.scenarios[0].conditioning.endpoint, '/images/edits')
  assert.equal(result.scenarios[1].workflow.importedActionId, 'smoke-wave')
  assert.equal(result.files.length, 2)

  const archivedReportPath = path.join(archiveDir, 'creator-workflow-host-smoke-result.json')
  const archivedReadmePath = path.join(archiveDir, 'README.md')
  assert.equal(fs.existsSync(archivedReportPath), true)
  assert.equal(fs.existsSync(archivedReadmePath), true)

  const archivedReport = JSON.parse(fs.readFileSync(archivedReportPath, 'utf-8'))
  assert.equal(archivedReport.sourceSummary.sessionDir, 'release/creator-workflow-host-smoke/2026-07-04T21-38-29-834Z')
  assert.equal(archivedReport.referenceImage.path, '[redacted-local-reference]/正面.png')
  assert.doesNotMatch(JSON.stringify(archivedReport), /\/Users\//)
  assert.doesNotMatch(JSON.stringify(archivedReport), /\.codex\/worktrees\//)

  const archivedReadme = fs.readFileSync(archivedReadmePath, 'utf-8')
  assert.match(archivedReadme, /host-side one-click Creator Workflow smoke run/i)
  assert.match(archivedReadme, /does not by itself prove/i)
})

test('createCreatorWorkflowHostSmokeArchive rejects missing report files', () => {
  const { rootDir, sessionDir } = createSessionFixture()
  fs.rmSync(path.join(sessionDir, 'creator-workflow-host-smoke-report.json'))
  const archiveDir = path.join(rootDir, 'archive', '2026-07-04T21-38-29-834Z-dev8-acceptance')

  assert.throws(
    () => createCreatorWorkflowHostSmokeArchive({ sessionDir, archiveDir, now: fixedNow }),
    /creatorWorkflowHostSmokeReport is missing/
  )
})

test('createCreatorWorkflowHostSmokeArchive rejects unexpected evidence types', () => {
  const { rootDir, sessionDir } = createSessionFixture({
    reportMutator: (report) => {
      report.evidenceType = 'not-host-smoke'
    }
  })
  const archiveDir = path.join(rootDir, 'archive', '2026-07-04T21-38-29-834Z-dev8-acceptance')

  assert.throws(
    () => createCreatorWorkflowHostSmokeArchive({ sessionDir, archiveDir, now: fixedNow }),
    /Unexpected evidenceType/
  )
})

test('createCreatorWorkflowHostSmokeArchive refuses to overwrite an existing archive directory', () => {
  const { rootDir, sessionDir } = createSessionFixture()
  const archiveDir = path.join(rootDir, 'archive', '2026-07-04T21-38-29-834Z-dev8-acceptance')
  fs.mkdirSync(archiveDir, { recursive: true })

  assert.throws(
    () => createCreatorWorkflowHostSmokeArchive({ sessionDir, archiveDir, now: fixedNow }),
    /archiveDir already exists/
  )
})
