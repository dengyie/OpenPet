# Community Source Invitation Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a local invitation-kit CLI so maintainers can draft outreach packets for compatible third-party OpenPet plugin authors after Phase 104 discovery finds no ready source.

**Architecture:** Add a deterministic CommonJS script that turns a target author/profile, optional source URL, candidate context, and requested capability slugs into a human-readable invitation packet plus a machine-readable summary. The command must not send network messages, record external replies, or claim third-party compatibility; it only prepares outreach material that still depends on Phase 104 discovery, Phase 100 intake, Phase 103 bridge, and Phase 99 evidence for the actual ecosystem truth.

**Tech Stack:** Node CommonJS scripts, Node native test runner, Markdown/JSON release evidence docs, production-code-quality-review checkpoint.

---

## File Map

- Create: `scripts/create-plugin-community-source-invitation-kit.js`
  Purpose: parse invitation options, normalize requested capabilities, and write README/message/checklist/summary artifacts under `docs/release-evidence/plugin-community-source-invitation-kit/<session>`.
- Create: `tests/scripts/create-plugin-community-source-invitation-kit.test.js`
  Purpose: cover CLI parsing, HTTPS URL validation, capability slug validation, invitation artifact generation, and the no-target-URL path.
- Modify: `package.json`
  Purpose: expose both `create-plugin-community-source-invitation` and `create-plugin-community-source-invitation-kit` npm scripts.
- Create: `docs/phases/phase-105-plugin-community-source-invitation-kit.md`
  Purpose: record scope, decisions, implementation, validation, and remaining limits.
- Create: `docs/reviews/phase-105-plugin-community-source-invitation-kit-review.md`
  Purpose: record production checkpoint review, quality score, pass status, findings, suggestions, and verification.
- Modify: `docs/HANDOFF.md`
  Purpose: mention the invitation kit as the current follow-up to Phase 104 discovery.
- Modify: `docs/development-summary.md`
  Purpose: add Phase 105 completion summary and next-step wording.
- Modify: `docs/project-status-review.md`
  Purpose: mention invitation kits as the pre-intake outreach boundary after discovery.
- Modify: `docs/project-context.json`
  Purpose: add machine-readable command/fact coverage for the invitation kit.
- Modify: `docs/productization-v1.1-todo-design.md`
  Purpose: add Phase 105 to priority order and execution sequence.
- Modify: `docs/project-review-todo-design.md`
  Purpose: add Phase 105 to the consolidated review table.

## Task 1: Write failing invitation-kit tests

**Files:**
- Create: `tests/scripts/create-plugin-community-source-invitation-kit.test.js`

- [ ] **Step 1: Test CLI parsing**

Add:

```js
test('parseArgs accepts community-source invitation options', () => {
  const options = parseArgs([
    '--target-author', 'Example Maintainer',
    '--target-url', 'https://github.com/example/openpet-plugin',
    '--candidate-context', 'Maintainer expressed interest in a desktop pet plugin.',
    '--requested-capabilities', 'weather pet-action pet-dialogue',
    '--maintainer', 'OpenPet Maintainer',
    '--output-dir', 'docs/release-evidence/plugin-community-source-invitation-kit/session-a',
    '--json'
  ])

  assert.equal(options.targetAuthor, 'Example Maintainer')
  assert.equal(options.targetUrl, 'https://github.com/example/openpet-plugin')
  assert.equal(options.candidateContext, 'Maintainer expressed interest in a desktop pet plugin.')
  assert.deepEqual(options.requestedCapabilities, ['weather', 'pet-action', 'pet-dialogue'])
  assert.equal(options.maintainer, 'OpenPet Maintainer')
  assert.equal(options.outputDir, 'docs/release-evidence/plugin-community-source-invitation-kit/session-a')
  assert.equal(options.json, true)
})
```

- [ ] **Step 2: Test invitation-input rejection**

Add:

```js
test('parseArgs rejects unsafe or empty invitation input', () => {
  assert.throws(() => parseArgs(['--target-author']), /--target-author requires a value/)
  assert.throws(() => parseArgs([]), /Target author is required/)
  assert.throws(
    () => parseArgs(['--target-author', 'Example', '--target-url', 'http://example.test/plugin']),
    /Target URL must use https:/
  )
  assert.throws(
    () => parseArgs(['--target-author', 'Example', '--requested-capabilities', 'weather,pet_action']),
    /Requested capability must use lowercase letters, numbers, and hyphens/
  )
  assert.throws(() => parseArgs(['--nope']), /Unexpected argument/)
})
```

- [ ] **Step 3: Test invitation artifact generation**

Add:

```js
test('createPluginCommunitySourceInvitationKit writes conservative invitation artifacts', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-community-invitation-'))
  const summary = createPluginCommunitySourceInvitationKit({
    targetAuthor: 'Example Maintainer',
    targetUrl: 'https://github.com/example/openpet-plugin',
    candidateContext: 'Maintainer expressed interest in a desktop pet plugin.',
    requestedCapabilities: ['weather', 'pet-action', 'pet-dialogue'],
    maintainer: 'OpenPet Maintainer',
    outputDir,
    now: () => new Date('2026-06-18T23:59:00.000Z')
  })

  assert.equal(summary.generatedAt, '2026-06-18T23:59:00.000Z')
  assert.equal(summary.status, 'invitation-draft-ready')
  assert.equal(summary.nextAction, 'send-invitation-and-wait-for-compatible-plugin-json-package')
  assert.equal(summary.target.author, 'Example Maintainer')
  assert.deepEqual(summary.requestedCapabilities, ['weather', 'pet-action', 'pet-dialogue'])
  assert.equal(fs.existsSync(summary.files.summary), true)
  assert.equal(fs.existsSync(summary.files.readme), true)
  assert.equal(fs.existsSync(summary.files.message), true)
  assert.equal(fs.existsSync(summary.files.checklist), true)

  const message = fs.readFileSync(summary.files.message, 'utf-8')
  assert.match(message, /OpenPet welcomes third-party extension authors/)
  assert.match(message, /weather/)
  assert.match(message, /Phase 100 intake/)
  assert.match(message, /does not approve, install, run, sign, publish, or trust/i)

  const checklist = fs.readFileSync(summary.files.checklist, 'utf-8')
  assert.match(checklist, /Invitation sent/)
  assert.match(checklist, /Compatible `plugin.json` package received/)
  assert.match(checklist, /Phase 104 discovery report updated or linked/)
})
```

- [ ] **Step 4: Test invitation without target URL**

Add:

```js
test('createPluginCommunitySourceInvitationKit can omit target URL without claiming contact', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-community-invitation-no-url-'))
  const summary = createPluginCommunitySourceInvitationKit({
    targetAuthor: 'Example Community',
    requestedCapabilities: ['pet-dialogue'],
    outputDir,
    now: () => new Date('2026-06-19T00:01:00.000Z')
  })

  assert.equal(summary.target.url, '')
  assert.equal(summary.status, 'invitation-draft-ready')
  assert.equal(summary.contactState, 'not-sent')

  const readme = fs.readFileSync(summary.files.readme, 'utf-8')
  assert.match(readme, /This kit is a draft invitation packet/)
  assert.match(readme, /It does not prove an invitation was sent/)
})
```

- [ ] **Step 5: Run tests to verify RED**

Run:

```bash
node --test tests/scripts/create-plugin-community-source-invitation-kit.test.js
```

Expected before implementation:

- FAIL because `scripts/create-plugin-community-source-invitation-kit.js` does not exist.

## Task 2: Implement the invitation kit command

**Files:**
- Create: `scripts/create-plugin-community-source-invitation-kit.js`
- Modify: `package.json`

- [ ] **Step 1: Add both npm scripts**

Add:

```json
"create-plugin-community-source-invitation": "node scripts/create-plugin-community-source-invitation-kit.js",
"create-plugin-community-source-invitation-kit": "node scripts/create-plugin-community-source-invitation-kit.js"
```

- [ ] **Step 2: Implement parser and constants**

Create a CommonJS script with:

```js
const fs = require('fs')
const path = require('path')

const { sessionIdFromDate } = require('./create-plugin-remote-source-submission-rehearsal')
const { assertSafeRehearsalOutputDir } = require('./create-plugin-author-rehearsal')

const DEFAULT_OUTPUT_ROOT = path.join('docs', 'release-evidence', 'plugin-community-source-invitation-kit')
const DEFAULT_CAPABILITIES = ['pet-dialogue', 'pet-action', 'weather')
const CAPABILITY_PATTERN = /^[a-z0-9-]+$/
```

Add `usage()`, `readValue()`, `parseCapabilities()`, and `parseArgs()` for `--target-author`, `--target-url`, `--candidate-context`, `--requested-capabilities`, `--maintainer`, `--output-dir`, `--json`, and `--help`.

- [ ] **Step 3: Render invitation artifacts**

Implement:

```js
const renderInvitationMessage = ({ summary }) => [ ... ]
const renderChecklist = () => [ ... ]
const renderReadme = ({ generatedAt, summary }) => [ ... ]
```

The summary should include:

```js
{
  generatedAt,
  outputDir: absoluteOutputDir,
  status: 'invitation-draft-ready',
  nextAction: 'send-invitation-and-wait-for-compatible-plugin-json-package',
  contactState: 'not-sent',
  target: { author, url },
  candidateContext,
  requestedCapabilities,
  maintainer,
  boundaries: [
    'Invitation kits are draft outreach materials only.',
    'Invitation kits do not prove an invitation was sent or accepted.',
    'Invitation kits do not prove OpenPet plugin compatibility.',
    'Invitation kits do not prove signing trust, catalog publication, runtime safety, or release readiness.',
    'A received package must still pass Phase 104 discovery, Phase 100 intake, Phase 103 bridge, Phase 99 evidence, and maintainer review.'
  ],
  files: {
    summary: '<absolute-output>/plugin-community-source-invitation-summary.json',
    readme: '<absolute-output>/README-community-source-invitation.md',
    message: '<absolute-output>/invitation-message.md',
    checklist: '<absolute-output>/invitation-checklist.md'
  }
}
```

- [ ] **Step 4: Add CLI main and exports**

Export:

```js
module.exports = {
  createPluginCommunitySourceInvitationKit,
  parseArgs,
  renderChecklist,
  renderInvitationMessage,
  renderReadme
}
```

- [ ] **Step 5: Run targeted tests and verify GREEN**

Run:

```bash
node --test tests/scripts/create-plugin-community-source-invitation-kit.test.js
```

Expected:

- PASS.

## Task 3: Record the phase and refresh live docs

**Files:**
- Create: `docs/phases/phase-105-plugin-community-source-invitation-kit.md`
- Create: `docs/reviews/phase-105-plugin-community-source-invitation-kit-review.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/project-status-review.md`
- Modify: `docs/project-context.json`
- Modify: `docs/productization-v1.1-todo-design.md`
- Modify: `docs/project-review-todo-design.md`
- Modify: `docs/plugin-submission-workflow-playbook.md`

- [ ] **Step 1: Write the phase document**

Record:

```md
- Phase 105 adds a local invitation-kit CLI for maintainers.
- The kit drafts outreach packets but does not contact authors or prove compatibility.
- The kit prepares a path toward a future compatible `plugin.json` package after Phase 104 discovery.
- Discovery, intake, bridge, and Phase 99 evidence still decide the real ecosystem truth.
```

- [ ] **Step 2: Write production checkpoint review**

Record quality score `92`, result `通过`, and no blocking findings if the checks pass. Mention that the command is isolated from runtime behavior and only prepares draft outreach materials.

- [ ] **Step 3: Update live docs**

Add the invitation kit as the current follow-up to Phase 104 discovery. Do not claim a live compatible third-party source exists.

## Task 4: Verify and commit

**Files:**
- All Phase 105 files

- [ ] **Step 1: Run verification**

Run:

```bash
node --test tests/scripts/create-plugin-community-source-invitation-kit.test.js
npm run check:syntax
npm test
npm run test:control-center
npm run typecheck
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('package.json','utf8')); JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); JSON.parse(require('node:fs').readFileSync('docs/release-evidence/plugin-community-source-invitation-kit/<session>/plugin-community-source-invitation-summary.json','utf8')); console.log('json ok')"
```

- [ ] **Step 2: Commit atomically**

Run:

```bash
git add package.json scripts/create-plugin-community-source-invitation-kit.js tests/scripts/create-plugin-community-source-invitation-kit.test.js docs/phases/phase-105-plugin-community-source-invitation-kit.md docs/reviews/phase-105-plugin-community-source-invitation-kit-review.md docs/HANDOFF.md docs/development-summary.md docs/project-status-review.md docs/project-context.json docs/productization-v1.1-todo-design.md docs/project-review-todo-design.md docs/plugin-submission-workflow-playbook.md docs/superpowers/plans/2026-06-18-community-source-invitation-kit-phase105.md
git commit -m "feat(阶段105): add community source invitation kit"
```

## Self-Review Checklist

- [ ] The command exists and matches the npm scripts in `package.json`.
- [ ] Invitation artifacts cannot claim compatibility, trust, publication, runtime safety, or release readiness.
- [ ] Tests cover HTTPS URL validation, capability slug validation, invitation draft generation, and the no-target-URL path.
- [ ] Docs place the invitation kit after Phase 104 discovery and before any claim of Phase 100/103/99 completion.

Plan complete and saved to `docs/superpowers/plans/2026-06-18-community-source-invitation-kit-phase105.md`.
