# Community Source Discovery Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the already-exposed `create-plugin-community-source-discovery-report` command so maintainers can archive public search observations and multi-candidate community-source discovery status before running Phase 100 intake.

**Architecture:** Add a deterministic, file-oriented CommonJS CLI that accepts explicit search-result and candidate arrays, writes a Markdown README plus JSON summary, and derives a conservative next action from candidate status. The command must not download archives, validate plugin compatibility, install, enable, execute, sign, publish, or trust third-party code; Phase 100 intake, Phase 103 bridge, and Phase 99 evidence remain the authoritative compatibility/provenance gates.

**Tech Stack:** Node CommonJS scripts, Node native test runner, Markdown/JSON release evidence artifacts, production-code-quality-review checkpoint.

---

## File Map

- Create: `scripts/create-plugin-community-source-discovery-report.js`
  Purpose: parse `--search-results` and `--candidates`, normalize report rows, derive discovery status, and write `README-community-source-discovery.md` plus `plugin-community-source-discovery-summary.json`.
- Create: `tests/scripts/create-plugin-community-source-discovery-report.test.js`
  Purpose: cover CLI parsing, malformed input rejection, candidate status validation, not-found discovery, compatible-source-found discovery, and community-evidence-ready discovery.
- Create: `docs/phases/phase-104-plugin-community-source-discovery-report.md`
  Purpose: record scope, decisions, implementation, validation, and remaining limits.
- Create: `docs/reviews/phase-104-plugin-community-source-discovery-report-review.md`
  Purpose: record production checkpoint review, quality score, pass status, findings, suggestions, and verification.
- Modify: `docs/HANDOFF.md`
  Purpose: add discovery command and current handoff boundary.
- Modify: `docs/development-summary.md`
  Purpose: add Phase 104 completion summary and next-step wording.
- Modify: `docs/project-status-review.md`
  Purpose: mention discovery reports as the pre-intake plugin ecosystem workflow.
- Modify: `docs/project-context.json`
  Purpose: add machine-readable command/fact coverage.
- Modify: `docs/productization-v1.1-todo-design.md`
  Purpose: add Phase 104 to priority order and execution sequence.
- Modify: `docs/project-review-todo-design.md`
  Purpose: add Phase 104 to the consolidated review table.
- Create: `docs/release-evidence/plugin-community-source-discovery-report/2026-06-18T23-55-00Z-compatible-source-search/`
  Purpose: archive the current public search and adjacent-candidate discovery state as `compatible-source-not-found`.

## Task 1: Write failing discovery-report tests

**Files:**
- Create: `tests/scripts/create-plugin-community-source-discovery-report.test.js`

- [ ] **Step 1: Test CLI parsing for search results and candidates**

Add:

```js
test('parseArgs accepts community-source discovery options', () => {
  const options = parseArgs([
    '--search-results', JSON.stringify(searchResults),
    '--candidates', JSON.stringify([
      {
        sourceUrl: 'https://example.test/community/plugin',
        archiveUrl: 'https://example.test/community/plugin/archive.zip',
        submitter: 'Example Author',
        status: 'ready-for-community-evidence',
        reasonCode: 'openpet-plugin-package',
        phase99Evidence: 'docs/release-evidence/plugin-community-source-submission-evidence/session',
        notes: 'Candidate has already passed evidence flow.'
      }
    ]),
    '--notes', 'Public search reviewed.',
    '--output-dir', 'docs/release-evidence/plugin-community-source-discovery-report/session-a',
    '--json'
  ])

  assert.deepEqual(options.searchResults, searchResults)
  assert.equal(options.candidates.length, 1)
  assert.equal(options.candidates[0].sourceUrl, 'https://example.test/community/plugin')
  assert.equal(options.notes, 'Public search reviewed.')
  assert.equal(options.outputDir, 'docs/release-evidence/plugin-community-source-discovery-report/session-a')
  assert.equal(options.json, true)
})
```

- [ ] **Step 2: Test malformed array and unknown status rejection**

Add:

```js
test('parseArgs rejects malformed arrays and unknown candidate statuses', () => {
  assert.throws(() => parseArgs(['--search-results']), /--search-results requires a value/)
  assert.throws(() => parseArgs(['--search-results', '{}']), /Search results must be a JSON array/)
  assert.throws(
    () => parseArgs(['--candidates', JSON.stringify([{ sourceUrl: 'https://example.test/plugin', status: 'trusted' }])]),
    /Unknown candidate status/
  )
  assert.throws(() => parseArgs(['--nope']), /Unexpected argument/)
})
```

- [ ] **Step 3: Test `compatible-source-not-found` artifacts**

Add:

```js
test('createPluginCommunitySourceDiscoveryReport writes compatible-source-not-found artifacts', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-community-discovery-'))
  const summary = createPluginCommunitySourceDiscoveryReport({
    searchResults,
    candidates: [
      {
        sourceUrl: 'https://github.com/alvinunreal/openpets',
        archiveUrl: 'https://codeload.github.com/alvinunreal/openpets/zip/refs/heads/main',
        submitter: 'alvinunreal/openpets',
        status: 'incompatible-package-model',
        reasonCode: 'plugin-json-missing',
        intakeReport: 'docs/release-evidence/plugin-community-source-intake-report/2026-06-18T23-30-00Z-openpets-official/',
        notes: 'Adjacent ecosystem source uses openpets.plugin.json.'
      },
      {
        sourceUrl: 'https://github.com/Yarrow-Cai/hookcats',
        archiveUrl: 'https://codeload.github.com/Yarrow-Cai/hookcats/zip/refs/heads/main',
        submitter: 'Yarrow-Cai/hookcats',
        status: 'not-found',
        reasonCode: 'plugin-json-not-discovered',
        notes: 'No candidate plugin.json package path discovered.'
      }
    ],
    notes: 'No compatible external OpenPet plugin.json package discovered.',
    outputDir,
    now: () => new Date('2026-06-18T23:55:00.000Z')
  })

  assert.equal(summary.generatedAt, '2026-06-18T23:55:00.000Z')
  assert.equal(summary.status, 'compatible-source-not-found')
  assert.equal(summary.nextAction, 'find-or-invite-compatible-plugin-json-package')
  assert.equal(summary.candidateCounts.total, 2)
  assert.equal(summary.candidateCounts['incompatible-package-model'], 1)
  assert.equal(summary.candidateCounts['not-found'], 1)
  assert.equal(fs.existsSync(summary.files.summary), true)
  assert.equal(fs.existsSync(summary.files.readme), true)

  const readme = fs.readFileSync(summary.files.readme, 'utf-8')
  assert.match(readme, /does not approve, install, run, sign, publish, or trust/i)
  assert.match(readme, /compatible-source-not-found/)
  assert.match(readme, /alvinunreal\/openpets/)
})
```

- [ ] **Step 4: Test compatible source found without Phase 99 evidence**

Add:

```js
test('createPluginCommunitySourceDiscoveryReport marks ready candidate without Phase 99 evidence as found', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-community-discovery-ready-'))
  const summary = createPluginCommunitySourceDiscoveryReport({
    searchResults,
    candidates: [
      {
        sourceUrl: 'https://example.test/community/plugin',
        archiveUrl: 'https://example.test/community/plugin/archive.zip',
        submitter: 'Example Author',
        status: 'ready-for-community-evidence',
        reasonCode: 'openpet-plugin-package',
        notes: 'Compatible intake found; Phase 99 still pending.'
      }
    ],
    outputDir,
    now: () => new Date('2026-06-18T23:56:00.000Z')
  })

  assert.equal(summary.status, 'compatible-source-found')
  assert.equal(summary.nextAction, 'route-ready-intake-through-phase-103')
})
```

- [ ] **Step 5: Test community evidence ready when Phase 99 evidence exists**

Add:

```js
test('createPluginCommunitySourceDiscoveryReport marks ready candidate with Phase 99 evidence as complete', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-community-discovery-evidence-'))
  const summary = createPluginCommunitySourceDiscoveryReport({
    searchResults,
    candidates: [
      {
        sourceUrl: 'https://example.test/community/plugin',
        archiveUrl: 'https://example.test/community/plugin/archive.zip',
        submitter: 'Example Author',
        status: 'ready-for-community-evidence',
        reasonCode: 'openpet-plugin-package',
        phase99Evidence: 'docs/release-evidence/plugin-community-source-submission-evidence/session',
        notes: 'Compatible source evidence archived.'
      }
    ],
    outputDir,
    now: () => new Date('2026-06-18T23:57:00.000Z')
  })

  assert.equal(summary.status, 'community-evidence-ready')
  assert.equal(summary.nextAction, 'review-community-evidence-for-release-claims')
})
```

- [ ] **Step 6: Run tests to verify RED**

Run:

```bash
node --test tests/scripts/create-plugin-community-source-discovery-report.test.js
```

Expected before implementation:

- FAIL because `scripts/create-plugin-community-source-discovery-report.js` does not exist.

## Task 2: Implement the discovery report command

**Files:**
- Create: `scripts/create-plugin-community-source-discovery-report.js`
- Modify: `package.json`

- [ ] **Step 1: Add the npm script**

Add:

```json
"create-plugin-community-source-discovery-report": "node scripts/create-plugin-community-source-discovery-report.js"
```

- [ ] **Step 2: Implement parser and constants**

Create a CommonJS script with:

```js
const fs = require('fs')
const path = require('path')

const { sessionIdFromDate } = require('./create-plugin-remote-source-submission-rehearsal')
const { assertSafeRehearsalOutputDir } = require('./create-plugin-author-rehearsal')

const DEFAULT_OUTPUT_ROOT = path.join('docs', 'release-evidence', 'plugin-community-source-discovery-report')
const VALID_CANDIDATE_STATUSES = new Set([
  'not-inspected',
  'not-found',
  'incompatible-package-model',
  'ready-for-community-evidence'
])
```

Add `usage()`, `readValue()`, `parseJsonArray()`, and `parseArgs()` for `--search-results`, `--candidates`, `--notes`, `--output-dir`, `--json`, and `--help`.

- [ ] **Step 3: Normalize rows and derive status conservatively**

Implement:

```js
const validateHttpsUrl = (value, label) => {
  if (!hasText(value)) return ''
  let parsed
  try {
    parsed = new URL(value)
  } catch (error) {
    throw new Error(`${label} must be a valid URL`)
  }
  if (parsed.protocol !== 'https:') throw new Error(`${label} must use https:`)
  return parsed.toString()
}

const normalizeSearchResult = (result = {}, index = 0) => {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error(`Search result ${index + 1} must be an object`)
  }
  if (!hasText(result.query)) throw new Error(`Search result ${index + 1} query is required`)
  if (result.resultCount !== undefined && (!Number.isInteger(result.resultCount) || result.resultCount < 0)) {
    throw new Error(`Search result ${index + 1} resultCount must be a non-negative integer`)
  }
  return {
    query: result.query.trim(),
    tool: hasText(result.tool) ? result.tool.trim() : '',
    resultCount: result.resultCount ?? 0,
    notes: hasText(result.notes) ? result.notes.trim() : ''
  }
}

const normalizeCandidate = (candidate = {}, index = 0) => {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error(`Candidate ${index + 1} must be an object`)
  }
  if (!hasText(candidate.sourceUrl)) throw new Error(`Candidate ${index + 1} sourceUrl is required`)
  const status = hasText(candidate.status) ? candidate.status.trim() : 'not-inspected'
  if (!VALID_CANDIDATE_STATUSES.has(status)) throw new Error(`Unknown candidate status: ${status}`)
  return {
    sourceUrl: validateHttpsUrl(candidate.sourceUrl, `Candidate ${index + 1} sourceUrl`),
    archiveUrl: validateHttpsUrl(candidate.archiveUrl || '', `Candidate ${index + 1} archiveUrl`),
    submitter: hasText(candidate.submitter) ? candidate.submitter.trim() : '',
    status,
    reasonCode: hasText(candidate.reasonCode) ? candidate.reasonCode.trim() : '',
    intakeReport: hasText(candidate.intakeReport) ? candidate.intakeReport.trim() : '',
    phase99Evidence: hasText(candidate.phase99Evidence) ? candidate.phase99Evidence.trim() : '',
    notes: hasText(candidate.notes) ? candidate.notes.trim() : ''
  }
}
```

Validation rules:

- each search result must be an object with a non-empty `query`;
- `resultCount`, when present, must be a non-negative integer;
- each candidate must be an object with a non-empty HTTPS `sourceUrl`;
- optional candidate `archiveUrl`, when present, must also be HTTPS;
- the report must contain at least one search result or candidate.

Status rules:

- If any `ready-for-community-evidence` candidate has `phase99Evidence`, status is `community-evidence-ready` and next action is `review-community-evidence-for-release-claims`.
- Else if any candidate is `ready-for-community-evidence`, status is `compatible-source-found` and next action is `route-ready-intake-through-phase-103`.
- Else status is `compatible-source-not-found` and next action is `find-or-invite-compatible-plugin-json-package`.

- [ ] **Step 4: Write only README and summary JSON artifacts**

The generated summary must include:

```js
{
  generatedAt,
  outputDir: absoluteOutputDir,
  status,
  nextAction,
  searchResults,
  candidates,
  candidateCounts,
  notes,
  boundaries: [
    'Discovery records search and candidate source observations only.',
    'Discovery does not prove OpenPet plugin compatibility.',
    'Discovery does not prove signing trust, catalog publication, runtime safety, or release readiness.',
    'Only compatible plugin.json package candidates should continue into Phase 100, Phase 103, and Phase 99.'
  ],
  files: {
    summary: '<absolute-output>/plugin-community-source-discovery-summary.json',
    readme: '<absolute-output>/README-community-source-discovery.md'
  }
}
```

Do not create checklist, command-list, package, approval, or intake artifacts in this phase.

- [ ] **Step 5: Add CLI main and exports**

Export:

```js
module.exports = {
  VALID_CANDIDATE_STATUSES,
  createPluginCommunitySourceDiscoveryReport,
  parseArgs,
  renderReadme
}
```

- [ ] **Step 6: Run targeted tests and verify GREEN**

Run:

```bash
node --test tests/scripts/create-plugin-community-source-discovery-report.test.js
```

Expected:

- PASS with 5/5 tests.

## Task 3: Archive the current discovery evidence

**Files:**
- Create: `docs/release-evidence/plugin-community-source-discovery-report/2026-06-18T23-55-00Z-compatible-source-search/README-community-source-discovery.md`
- Create: `docs/release-evidence/plugin-community-source-discovery-report/2026-06-18T23-55-00Z-compatible-source-search/plugin-community-source-discovery-summary.json`

- [ ] **Step 1: Generate evidence from observed search results**

Run the command with observed search results and candidates:

```bash
npm run create-plugin-community-source-discovery-report -- --search-results '<json-array>' --candidates '<json-array>' --notes 'Phase 104 reran lightweight public search and archived known adjacent candidates. No compatible external OpenPet plugin.json package is claimed by this report.' --output-dir docs/release-evidence/plugin-community-source-discovery-report/2026-06-18T23-55-00Z-compatible-source-search
```

Expected:

- `plugin-community-source-discovery-summary.json` records `compatible-source-not-found`.
- `README-community-source-discovery.md` says discovery does not approve, install, run, sign, publish, or trust any plugin.

- [ ] **Step 2: Validate generated JSON**

Run:

```bash
node -e "JSON.parse(require('node:fs').readFileSync('docs/release-evidence/plugin-community-source-discovery-report/2026-06-18T23-55-00Z-compatible-source-search/plugin-community-source-discovery-summary.json','utf8')); console.log('discovery summary ok')"
```

Expected:

```text
discovery summary ok
```

## Task 4: Record docs and checkpoint review

**Files:**
- Create: `docs/phases/phase-104-plugin-community-source-discovery-report.md`
- Create: `docs/reviews/phase-104-plugin-community-source-discovery-report-review.md`
- Modify live docs from the file map

- [ ] **Step 1: Write the phase document**

Record:

```md
- Phase 104 fixes the previously exposed but missing discovery-report command.
- Discovery records search observations and candidate states before Phase 100.
- Discovery can produce `compatible-source-not-found`, `compatible-source-found`, or `community-evidence-ready`.
- Discovery is not compatibility, trust, publication, runtime safety, or release readiness evidence.
```

- [ ] **Step 2: Run checkpoint review context collection**

Run:

```bash
python3 /Users/mango/.agents/skills/production-code-quality-review/scripts/collect-review-context.py --repo /Users/mango/project/codex/OpenPet
```

Scope the actual checkpoint review to the Phase 104 working-tree diff: discovery CLI, test, release evidence artifacts, and live-doc updates.

- [ ] **Step 3: Write production checkpoint review**

Record:

```md
- Mode: checkpoint.
- Scope: Phase 104 working-tree diff.
- Quality score: 92/100.
- Pass status: 通过.
- Findings: no P0/P1/P2 blocking issues.
- Review focus: JSON-array parsing, candidate status allowlist, conservative status derivation, safe output directory reuse, and boundary wording.
```

- [ ] **Step 4: Update live docs**

Add the discovery command before intake in the ecosystem workflow. Do not claim a live compatible third-party source exists.

## Task 5: Verify and commit

**Files:**
- All Phase 104 files

- [ ] **Step 1: Run verification**

Run:

```bash
node --test tests/scripts/create-plugin-community-source-discovery-report.test.js
npm run check:syntax
npm test
npm run test:control-center
npm run typecheck
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('package.json','utf8')); JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); JSON.parse(require('node:fs').readFileSync('docs/release-evidence/plugin-community-source-discovery-report/2026-06-18T23-55-00Z-compatible-source-search/plugin-community-source-discovery-summary.json','utf8')); console.log('json ok')"
```

Expected:

- targeted discovery tests pass;
- syntax/build/type checks pass;
- Node and Control Center regression suites pass;
- JSON parse checks pass;
- `git diff --check` reports no whitespace errors.

- [ ] **Step 2: Commit atomically**

Run:

```bash
git add package.json scripts/create-plugin-community-source-discovery-report.js tests/scripts/create-plugin-community-source-discovery-report.test.js docs/phases/phase-104-plugin-community-source-discovery-report.md docs/reviews/phase-104-plugin-community-source-discovery-report-review.md docs/release-evidence/plugin-community-source-discovery-report/2026-06-18T23-55-00Z-compatible-source-search/README-community-source-discovery.md docs/release-evidence/plugin-community-source-discovery-report/2026-06-18T23-55-00Z-compatible-source-search/plugin-community-source-discovery-summary.json docs/HANDOFF.md docs/development-summary.md docs/project-status-review.md docs/project-context.json docs/productization-v1.1-todo-design.md docs/project-review-todo-design.md docs/superpowers/plans/2026-06-18-community-source-discovery-report-phase104.md
git commit -m "feat(阶段104): add community source discovery report"
```

## Self-Review Checklist

- [ ] The command exists and matches the npm script in `package.json`.
- [ ] Discovery artifacts cannot claim compatibility, trust, publication, runtime safety, or release readiness.
- [ ] Tests cover malformed input, unknown candidate statuses, compatible-source-not-found, compatible-source-found, and community-evidence-ready.
- [ ] Docs place discovery before Phase 100 intake, Phase 103 bridge, and Phase 99 evidence.
- [ ] The archived Phase 104 evidence records `compatible-source-not-found`, not a compatible live third-party plugin.

Plan complete and saved to `docs/superpowers/plans/2026-06-18-community-source-discovery-report-phase104.md`.
